-- 00187_ios_phase0_completion.sql
-- Operational backend pieces required before the Eddy iOS client ships.

-- Reconcile the production-only float-plan ownership migration. This repeats
-- the structural portion of 00184 deliberately: existing production projects
-- no-op here, while environments that marked the older migration applied are
-- repaired on their next push.
alter table public.float_plans
    add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists idx_float_plans_user_created
    on public.float_plans (user_id, created_at desc)
    where user_id is not null;

-- Normalize any dashboard-created policy names to the repository contract.
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'float_plans'
  loop
    execute format('drop policy if exists %I on public.float_plans', policy_row.policyname);
  end loop;
end $$;
create policy "Anonymous plans public, owned plans owner-only"
    on public.float_plans for select
    using (user_id is null or user_id = (select auth.uid()));
create policy "Users create own or anonymous float plans"
    on public.float_plans for insert
    with check (user_id is null or user_id = (select auth.uid()));
create policy "Users delete own float plans"
    on public.float_plans for delete
    using (user_id is not null and user_id = (select auth.uid()));

-- Durable RevenueCat webhook ledger. Entitlement rows remain the materialized
-- current state; this table provides idempotency and an audit trail.
create table if not exists public.revenuecat_webhook_events (
    event_id text primary key,
    event_type text not null,
    event_timestamp timestamptz not null,
    app_user_id text,
    original_app_user_id text,
    aliases text[] not null default '{}',
    environment text,
    payload jsonb not null,
    status text not null default 'received'
        check (status in ('received', 'applied', 'ignored', 'failed')),
    error text,
    received_at timestamptz not null default now(),
    processed_at timestamptz
);
alter table public.revenuecat_webhook_events enable row level security;
-- No client policies: service role only.

-- Expo accepts a batch before APNs reports final delivery. Track each
-- event/device independently so partial batches and receipt retries are safe.
create table if not exists public.push_deliveries (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.river_condition_events(id) on delete cascade,
    device_token_id uuid not null references public.device_tokens(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'pending'
        check (status in ('pending', 'ticketed', 'delivered', 'retry', 'failed', 'disabled')),
    expo_ticket_id text,
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    delivered_at timestamptz,
    unique (event_id, device_token_id)
);
create index if not exists idx_push_deliveries_pending
    on public.push_deliveries (next_attempt_at, created_at)
    where status in ('pending', 'retry');
create index if not exists idx_push_deliveries_ticketed
    on public.push_deliveries (created_at)
    where status = 'ticketed';
alter table public.push_deliveries enable row level security;

-- Atomically move eligible anonymous data into a permanent account. The API
-- verifies possession of both sessions before invoking this service-role RPC.
create or replace function public.merge_anonymous_user_data(
    p_source_user_id uuid,
    p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    moved_stars integer := 0;
    moved_plans integer := 0;
begin
    if p_source_user_id = p_target_user_id then
        return jsonb_build_object('stars', 0, 'plans', 0);
    end if;

    insert into public.starred_rivers (user_id, river_id, created_at)
    select p_target_user_id, river_id, created_at
    from public.starred_rivers
    where user_id = p_source_user_id
    on conflict (user_id, river_id) do update
      set created_at = least(public.starred_rivers.created_at, excluded.created_at);
    get diagnostics moved_stars = row_count;

    update public.float_plans
       set user_id = p_target_user_id
     where user_id = p_source_user_id;
    get diagnostics moved_plans = row_count;

    update public.profiles target
       set display_name = coalesce(target.display_name, source.display_name),
           home_region = coalesce(target.home_region, source.home_region),
           updated_at = now()
      from public.profiles source
     where target.id = p_target_user_id
       and source.id = p_source_user_id;

    delete from public.starred_rivers where user_id = p_source_user_id;

    return jsonb_build_object('stars', moved_stars, 'plans', moved_plans);
end;
$$;
revoke execute on function public.merge_anonymous_user_data(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.merge_anonymous_user_data(uuid, uuid) to service_role;

-- Timestamp-aware materialization of RevenueCat state. The WHERE clause on
-- the upsert prevents a delayed webhook from rolling a newer entitlement
-- backward, even when two serverless invocations race.
create or replace function public.apply_revenuecat_entitlement_event(
    p_user_id uuid,
    p_entitlement_id text,
    p_expires_at timestamptz,
    p_will_renew boolean,
    p_product_id text,
    p_store text,
    p_environment text,
    p_billing_issue_at timestamptz,
    p_clear_billing_issue boolean,
    p_rc_app_user_id text,
    p_rc_original_app_user_id text,
    p_event_id text,
    p_event_type text,
    p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_row_count integer := 0;
begin
    insert into public.entitlements (
        user_id, entitlement_id, expires_at, will_renew, product_id, store,
        environment, billing_issue_detected_at, rc_app_user_id,
        rc_original_app_user_id, last_event_id, last_event_type, last_event_at
    ) values (
        p_user_id, p_entitlement_id, p_expires_at, p_will_renew, p_product_id,
        p_store, p_environment,
        case when p_clear_billing_issue then null else p_billing_issue_at end,
        p_rc_app_user_id, p_rc_original_app_user_id, p_event_id,
        p_event_type, p_event_at
    )
    on conflict (user_id, entitlement_id) do update set
        expires_at = coalesce(excluded.expires_at, public.entitlements.expires_at),
        will_renew = coalesce(excluded.will_renew, public.entitlements.will_renew),
        product_id = coalesce(excluded.product_id, public.entitlements.product_id),
        store = coalesce(excluded.store, public.entitlements.store),
        environment = coalesce(excluded.environment, public.entitlements.environment),
        billing_issue_detected_at = case
            when p_clear_billing_issue then null
            else coalesce(excluded.billing_issue_detected_at, public.entitlements.billing_issue_detected_at)
        end,
        rc_app_user_id = coalesce(excluded.rc_app_user_id, public.entitlements.rc_app_user_id),
        rc_original_app_user_id = coalesce(excluded.rc_original_app_user_id, public.entitlements.rc_original_app_user_id),
        last_event_id = excluded.last_event_id,
        last_event_type = excluded.last_event_type,
        last_event_at = excluded.last_event_at,
        updated_at = now()
    where public.entitlements.last_event_at is null
       or public.entitlements.last_event_at <= excluded.last_event_at;

    get diagnostics v_row_count = row_count;
    return v_row_count > 0;
end;
$$;
revoke execute on function public.apply_revenuecat_entitlement_event(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, boolean,
    text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement_event(
    uuid, text, timestamptz, boolean, text, text, text, timestamptz, boolean,
    text, text, text, text, timestamptz
) to service_role;

-- Keep delivery-health counters accurate without a read/modify/write race.
create or replace function public.mark_device_token_failure(
    p_token_id uuid,
    p_disable boolean default false
)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.device_tokens
       set failure_count = failure_count + 1,
           disabled_at = case when p_disable then now() else disabled_at end,
           updated_at = now()
     where id = p_token_id;
$$;
revoke execute on function public.mark_device_token_failure(uuid, boolean)
    from public, anon, authenticated;
grant execute on function public.mark_device_token_failure(uuid, boolean)
    to service_role;

-- CAS + outbox insert in one transaction. A duplicate cron sees no updated
-- row and therefore cannot emit a second event.
create or replace function public.record_river_condition_transition(
    p_river_gauge_id uuid,
    p_expected_old_code text,
    p_new_code text,
    p_kind text,
    p_reading_value numeric,
    p_reading_unit text,
    p_reading_at timestamptz,
    p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_river_id uuid;
    v_event_id uuid;
begin
    update public.river_gauges
       set last_condition_code = p_new_code
     where id = p_river_gauge_id
       and coalesce(last_condition_code, 'unknown') = p_expected_old_code
     returning river_id into v_river_id;

    if v_river_id is null then
        return null;
    end if;

    insert into public.river_condition_events (
        river_id, river_gauge_id, old_condition_code, new_condition_code,
        kind, reading_value, reading_unit, reading_at, metadata
    ) values (
        v_river_id, p_river_gauge_id, p_expected_old_code, p_new_code,
        p_kind, p_reading_value, p_reading_unit, p_reading_at, p_metadata
    )
    on conflict (river_gauge_id, new_condition_code, reading_at)
      where river_gauge_id is not null and reading_at is not null
    do nothing
    returning id into v_event_id;

    return v_event_id;
end;
$$;
revoke execute on function public.record_river_condition_transition(
    uuid, text, text, text, numeric, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.record_river_condition_transition(
    uuid, text, text, text, numeric, text, timestamptz, jsonb
) to service_role;

-- Operational snapshot used by health checks and dashboards.
create or replace view public.ios_delivery_health as
select
    (select count(*) from public.river_condition_events
      where push_delivered_at is null and detected_at < now() - interval '15 minutes')
        as stale_outbox_events,
    (select count(*) from public.push_deliveries
      where status in ('pending', 'retry') and next_attempt_at < now() - interval '5 minutes')
        as overdue_deliveries,
    (select count(*) from public.device_tokens where disabled_at is not null)
        as disabled_tokens,
    (select max(received_at) from public.revenuecat_webhook_events)
        as latest_revenuecat_webhook_at;
revoke all on public.ios_delivery_health from anon, authenticated;
grant select on public.ios_delivery_health to service_role;
