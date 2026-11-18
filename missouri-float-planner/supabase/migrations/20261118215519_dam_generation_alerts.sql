-- Dam generation alerts: "tell me when generation is posted to start".
--
-- NOT YET APPLIED is recorded in supabase/production-migrations.txt, not here.
-- ADR 0020 (docs/decisions/0020-dam-generation-alerts-follow-the-posted-schedule.md)
-- has the product decision; this file holds the storage.
--
-- ── What an alert is ────────────────────────────────────────────────────────
-- One row per person per dam, with the two times they can be told about a
-- posted start: at the posted time, an hour before it, or both. There is no
-- `enabled` column. A row with neither time would be an alert that can never
-- fire, so set_dam_generation_alert deletes the row instead and the CHECK
-- refuses it.
--
-- ── Why dam_id is text with no foreign key ──────────────────────────────────
-- Same reason as starred_dams (00206): dams are read through from CWMS and
-- SWPA and have no table to point at. /api/me/dam-alerts checks the id against
-- the registry before writing, and requires that the dam has a posted schedule
-- at all, because an alert on a dam SWPA never schedules cannot fire.
--
-- ── Why a second outbox and not rows in gauge_alert_events ──────────────────
-- A gauge event is a reading crossing a level at a station. This is a clock
-- time read from a schedule: no station, no reading, no condition code, and it
-- is known hours ahead. The delivery ledger is shared (alert_push_deliveries),
-- so receipts, dead-token handling and the per-device record are not repeated.

create table public.dam_generation_alerts (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  dam_id             text        not null check (length(dam_id) between 1 and 80),
  notify_at_start    boolean     not null default false,
  notify_hour_before boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint dam_generation_alerts_one_per_dam unique (user_id, dam_id),
  constraint dam_generation_alerts_has_a_time check (notify_at_start or notify_hour_before)
);

comment on table public.dam_generation_alerts is
  'One row per user per dam: push when generation is posted to start, at the posted time and/or an hour before. Written by /api/me/dam-alerts; read by /api/cron/deliver-push. See ADR 0020.';

-- The delivery pass asks "which dams does anyone watch" on every run.
create index idx_dam_generation_alerts_dam on public.dam_generation_alerts (dam_id);

alter table public.dam_generation_alerts enable row level security;
revoke all on public.dam_generation_alerts from public, anon, authenticated;
grant select, insert, update, delete on public.dam_generation_alerts to authenticated;
grant all on public.dam_generation_alerts to service_role;

-- Same shape as gauge_alert_subscriptions (00200). is_permanent_user() on
-- writes is not a tier: push needs a durable identity to route to, and an
-- anonymous id is replaced on reinstall.
create policy dam_generation_alerts_select_own on public.dam_generation_alerts
  for select to authenticated using (user_id = (select auth.uid()));

create policy dam_generation_alerts_insert_own on public.dam_generation_alerts
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_permanent_user());

create policy dam_generation_alerts_update_own on public.dam_generation_alerts
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_permanent_user())
  with check (user_id = (select auth.uid()));

create policy dam_generation_alerts_delete_own on public.dam_generation_alerts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── Changing an alert is ONE database call ──────────────────────────────────
-- The dam screen has two switches and the app sends only the one that moved.
-- Something has to combine that with the switch that did not move, and it has
-- to be here. The route first did it in three round trips (read both, merge,
-- write both), and two requests enabling different switches at the same moment
-- each read the alert before the other wrote: the second write put the first
-- switch back off.
--
-- So the read, the merge and the write (or the delete, when both end up off)
-- happen in this function, in one transaction, behind a lock on (user, dam).
-- The advisory lock rather than SELECT ... FOR UPDATE because the case that
-- matters most has no row to lock yet: two first-ever switches at once.
--
-- A NULL argument means "leave that switch as it is". Returns the saved row,
-- or no row when the alert is gone.
--
-- SECURITY INVOKER: it runs as the caller, so the policies above still decide
-- what may be written. An anonymous session can switch its last time off (the
-- delete policy allows it) and cannot switch one on (the insert and update
-- policies do not).
create function public.set_dam_generation_alert(
  p_dam_id      text,
  p_at_start    boolean default null,
  p_hour_before boolean default null
)
returns setof public.dam_generation_alerts
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := (select auth.uid());
  v_saved       public.dam_generation_alerts;
  v_at_start    boolean;
  v_hour_before boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_at_start is null and p_hour_before is null then
    raise exception 'nothing to change: pass p_at_start, p_hour_before or both' using errcode = '22023';
  end if;

  -- Held to the end of the transaction. A second call for the same person and
  -- dam waits here, and reads the alert only after this one has committed.
  perform pg_advisory_xact_lock(hashtextextended('dam_generation_alert:' || v_user::text || ':' || p_dam_id, 0));

  select * into v_saved
    from public.dam_generation_alerts
   where user_id = v_user and dam_id = p_dam_id;

  v_at_start    := coalesce(p_at_start, v_saved.notify_at_start, false);
  v_hour_before := coalesce(p_hour_before, v_saved.notify_hour_before, false);

  -- Both off: there is no alert. Never a row with neither time.
  if not v_at_start and not v_hour_before then
    delete from public.dam_generation_alerts
     where user_id = v_user and dam_id = p_dam_id;
    return;
  end if;

  return query
    insert into public.dam_generation_alerts as alert (user_id, dam_id, notify_at_start, notify_hour_before)
    values (v_user, p_dam_id, v_at_start, v_hour_before)
    on conflict (user_id, dam_id) do update
      set notify_at_start    = excluded.notify_at_start,
          notify_hour_before = excluded.notify_hour_before,
          updated_at         = now()
    returning alert.*;
end;
$$;

comment on function public.set_dam_generation_alert(text, boolean, boolean) is
  'Change one or both times of the caller''s dam generation alert atomically; NULL leaves a time unchanged, both off deletes. Called by PUT /api/me/dam-alerts. See ADR 0020.';

revoke all on function public.set_dam_generation_alert(text, boolean, boolean) from public, anon;
grant execute on function public.set_dam_generation_alert(text, boolean, boolean) to authenticated, service_role;

-- ── The outbox ──────────────────────────────────────────────────────────────
-- One row per (alert, posted start, lead time). The unique constraint is the
-- whole idempotency: the delivery pass runs every five minutes and re-derives
-- the same due notices each time, and an insert that conflicts is the pass
-- recognising a notice it already queued.
--
-- start_at is the posted start AT THE DAM as an instant. lead_minutes is 0 for
-- "at the posted time" and 60 for "an hour before"; the notice is due at
-- start_at - lead_minutes.
create table public.dam_generation_alert_events (
  id                uuid        primary key default gen_random_uuid(),
  alert_id          uuid        not null references public.dam_generation_alerts(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  dam_id            text        not null,
  start_at          timestamptz not null,
  lead_minutes      integer     not null check (lead_minutes in (0, 60)),
  detected_at       timestamptz not null default now(),
  push_delivered_at timestamptz,
  push_attempts     integer     not null default 0,
  push_outcome      text,
  constraint dam_generation_alert_events_once unique (alert_id, start_at, lead_minutes),
  constraint dam_generation_alert_events_push_outcome_check
    check (push_outcome is null or push_outcome in ('sent', 'skipped', 'expired', 'given_up'))
);

comment on table public.dam_generation_alert_events is
  'Outbox for dam generation alerts: one row per alert, posted start and lead time. Written and drained by /api/cron/deliver-push only. See ADR 0020.';

create index idx_dam_generation_alert_events_undelivered
  on public.dam_generation_alert_events (start_at)
  where push_delivered_at is null;

-- Server-only. Nothing in the app reads the outbox, so nothing is granted.
alter table public.dam_generation_alert_events enable row level security;
revoke all on public.dam_generation_alert_events from public, anon, authenticated;
grant all on public.dam_generation_alert_events to service_role;

-- ── The shared ledger learns a third source ─────────────────────────────────
-- 00203 added event_source with an inline CHECK, which Postgres named
-- alert_push_deliveries_event_source_check. Replaced by name with the wider
-- set; existing rows all satisfy it.
alter table public.alert_push_deliveries
  drop constraint if exists alert_push_deliveries_event_source_check;
alter table public.alert_push_deliveries
  add constraint alert_push_deliveries_event_source_check
  check (event_source in ('river_condition', 'gauge_alert', 'dam_generation'));

comment on column public.alert_push_deliveries.event_source is
  'Which outbox event_id points at: river_condition_events, gauge_alert_events or dam_generation_alert_events. There is no FK — see migration 00203.';
