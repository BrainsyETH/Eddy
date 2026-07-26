-- 00190_alert_push_deliveries.sql
-- Per-device delivery ledger for push notifications.
--
-- WHY: river_condition_events.push_delivered_at is per EVENT, not per device.
-- A delivery pass killed part-way through would re-notify everyone it had
-- already reached on the next run. This table is the honest at-least-once
-- record of who actually got what.
--
-- It also supplies the substrate for the push COOLDOWN. Social posting has a
-- 4h per-(river, condition) cooldown; push had none, so a gauge oscillating
-- around a band edge would notify subscribers every 15 minutes. That is
-- precisely the "push-disable > 30% = alert-quality problem" failure the
-- strategy doc names as a kill signal.

create table if not exists public.alert_push_deliveries (
    event_id uuid not null references public.river_condition_events(id) on delete cascade,
    device_token_id uuid not null references public.device_tokens(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    river_id uuid references public.rivers(id) on delete set null,
    -- Mirrors river_condition_events.kind so the cooldown can be scoped per
    -- kind: a safety warning must never be suppressed by a recent floatable.
    kind text not null,
    sent_at timestamptz not null default now(),
    -- Expo ticket id, for the follow-up receipts pass that resolves
    -- DeviceNotRegistered (which usually arrives in the receipt, not the ticket).
    ticket_id text,
    status text not null default 'sent' check (status in ('sent', 'error')),
    error_code text,
    primary key (event_id, device_token_id)
);

-- The cooldown lookup: "has this user already been pushed about this river and
-- kind recently?"
create index if not exists idx_apd_cooldown
    on public.alert_push_deliveries (user_id, river_id, kind, sent_at desc);

-- Receipts follow-up: find recently sent tickets to poll.
create index if not exists idx_apd_ticket
    on public.alert_push_deliveries (sent_at desc)
    where ticket_id is not null and status = 'sent';

alter table public.alert_push_deliveries enable row level security;

-- Users may read their own delivery history (useful for an in-app "why did I
-- get this?" and for support). All writes are service-role only.
create policy alert_push_deliveries_select_own on public.alert_push_deliveries
    for select using (user_id = (select auth.uid()));
