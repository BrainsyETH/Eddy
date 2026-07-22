-- 00180_ios_profiles_entitlements.sql
-- iOS Phase 0: consumer accounts spine.
--
-- First consumer-auth tables (see docs/EDDY_IOS_STRATEGY.md, "Backend build").
-- The iOS app signs users in via Supabase Auth (Sign in with Apple + anonymous
-- upgrade); route handlers authenticate with a Bearer JWT, so every policy here
-- is written against auth.uid() / auth.jwt() — there are no session cookies in
-- the mobile path.
--
-- Anonymity rule (strategy doc, backend step 2): tables that participate in
-- purchases or push delivery require a PERMANENT (non-anonymous) user;
-- is_permanent_user() is the shared predicate. Starring stays anonymous-friendly
-- (separate migration).

-- Shared RLS predicate: signed in AND not an anonymous session.
-- Anonymous Supabase users carry an `is_anonymous: true` JWT claim.
create or replace function public.is_permanent_user()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- ============================================================
-- profiles: one row per auth user (including anonymous users —
-- they upgrade in place, keeping the same uid).
-- ============================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    home_region text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
    for select using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
    for insert with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
    for update using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

create or replace function public.update_profiles_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
    before update on public.profiles
    for each row execute function public.update_profiles_updated_at();

-- Auto-create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ============================================================
-- entitlements: RevenueCat-synced subscription state.
-- State = latest webhook event's expires_at, never a boolean
-- (strategy doc, backend step 4). Written ONLY by the service
-- role via /api/webhooks/revenuecat — no client write policies.
-- ============================================================
create table if not exists public.entitlements (
    user_id uuid not null references auth.users(id) on delete cascade,
    entitlement_id text not null default 'eddy_plus',
    -- Active iff expires_at is in the future; grace periods arrive as
    -- extended expires_at values from RevenueCat.
    expires_at timestamptz,
    will_renew boolean,
    product_id text,
    store text,
    environment text check (environment in ('SANDBOX', 'PRODUCTION')),
    billing_issue_detected_at timestamptz,
    -- RevenueCat identity, for TRANSFER re-keying + audit.
    rc_app_user_id text,
    rc_original_app_user_id text,
    -- Idempotency/audit trail of the last applied webhook event.
    last_event_id text,
    last_event_type text,
    last_event_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, entitlement_id)
);

alter table public.entitlements enable row level security;

-- Users can read their own entitlement; all writes go through the
-- service role (RLS bypass), so no insert/update/delete policies exist.
create policy entitlements_select_own on public.entitlements
    for select using (user_id = (select auth.uid()));

create or replace function public.update_entitlements_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger entitlements_updated_at
    before update on public.entitlements
    for each row execute function public.update_entitlements_updated_at();
