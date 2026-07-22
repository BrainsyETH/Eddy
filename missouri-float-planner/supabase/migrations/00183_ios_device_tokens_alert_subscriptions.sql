-- 00183_ios_device_tokens_alert_subscriptions.sql
-- iOS Phase 0: push delivery targets.
--
-- device_tokens: Expo push tokens per device. alert_subscriptions: which
-- rivers a user wants pushes for, and of what kind. Both require a PERMANENT
-- (non-anonymous) user to write — push is tied to trial/purchase identity,
-- and the notify-me flow signs the user in before subscribing (strategy doc,
-- backend step 2). Entitlement is re-checked at send time, not here.

create table if not exists public.device_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    expo_push_token text not null unique,
    platform text not null default 'ios' check (platform in ('ios', 'android')),
    device_name text,
    app_version text,
    last_seen_at timestamptz not null default now(),
    -- Pruning state for DeviceNotRegistered receipts.
    failure_count integer not null default 0,
    disabled_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_user on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

create policy device_tokens_select_own on public.device_tokens
    for select using (user_id = (select auth.uid()));

create policy device_tokens_insert_own on public.device_tokens
    for insert with check (user_id = (select auth.uid()) and public.is_permanent_user());

create policy device_tokens_update_own on public.device_tokens
    for update using (user_id = (select auth.uid()) and public.is_permanent_user())
    with check (user_id = (select auth.uid()));

create policy device_tokens_delete_own on public.device_tokens
    for delete using (user_id = (select auth.uid()));

-- ============================================================
-- alert_subscriptions
-- ============================================================
create table if not exists public.alert_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    river_id uuid not null references public.rivers(id) on delete cascade,
    -- floatable = "tell me when my stretch opens up" (the notify-me funnel);
    -- safety = warning/dangerous transitions; all = both.
    kind text not null default 'all' check (kind in ('floatable', 'safety', 'all')),
    -- One-shot subscriptions (the contextual "notify me when it's floatable"
    -- tap) auto-expire after their first matching push.
    one_shot boolean not null default false,
    fired_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, river_id)
);

-- Fan-out lookup: subscribers for a river when an event fires.
create index if not exists idx_alert_subscriptions_river on public.alert_subscriptions(river_id);

alter table public.alert_subscriptions enable row level security;

create policy alert_subscriptions_select_own on public.alert_subscriptions
    for select using (user_id = (select auth.uid()));

create policy alert_subscriptions_insert_own on public.alert_subscriptions
    for insert with check (user_id = (select auth.uid()) and public.is_permanent_user());

create policy alert_subscriptions_update_own on public.alert_subscriptions
    for update using (user_id = (select auth.uid()) and public.is_permanent_user())
    with check (user_id = (select auth.uid()));

create policy alert_subscriptions_delete_own on public.alert_subscriptions
    for delete using (user_id = (select auth.uid()));

create or replace function public.update_alert_subscriptions_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger alert_subscriptions_updated_at
    before update on public.alert_subscriptions
    for each row execute function public.update_alert_subscriptions_updated_at();
