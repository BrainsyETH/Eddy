-- 00202_gauge_alert_events.sql
-- The outbox for per-gauge alert rules, mirroring river_condition_events (00182).
--
-- ── Why an outbox at all, when the evaluator already knows the user ─────────
--
-- Fan-out here is trivial — gauge_alert_subscriptions.user_id names the
-- recipient, so there is no "who wants this?" question to answer. The temptation
-- is therefore to have the evaluation cron send to Expo directly and skip a
-- table. river_condition_events' own header gives the reason not to: sending
-- inline couples detection to delivery, so an Expo outage or a lambda killed
-- mid-send loses the alert outright, and Vercel crons never retry.
--
-- Keeping the shape identical to river_condition_events is what lets
-- deliver-push drain both with one set of rules — push_delivered_at marks an
-- event drained, push_attempts bounds the retries, and planDrain() in
-- src/lib/alerts/drain.ts decides between them without caring which table the
-- row came from.

create table if not exists public.gauge_alert_events (
    id uuid primary key default gen_random_uuid(),

    -- CASCADE, not set null: an event is a notification owed to one specific
    -- rule. Delete the rule and the debt goes with it — delivering "your alert
    -- fired" for an alert the user has since removed is worse than silence.
    subscription_id uuid not null references public.gauge_alert_subscriptions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    gauge_station_id uuid not null references public.gauge_stations(id) on delete cascade,
    river_id uuid references public.rivers(id) on delete set null,

    -- 'threshold' is this table's own kind; the other three are borrowed from
    -- river_condition_events so condition-mode rules classify identically via
    -- classifyEventKind(). The safety kinds matter beyond wording: they are what
    -- quiet hours let through, and what deliver-push sends at high priority.
    kind text not null check (kind in ('threshold', 'floatable', 'warning', 'easing')),

    reading_value numeric(12, 2),
    reading_unit text check (reading_unit in ('ft', 'cfs')),
    -- When the river was MEASURED. Quote this in copy, never detected_at.
    reading_at timestamptz,
    -- Condition mode only; null for a threshold crossing.
    condition_code text,

    detected_at timestamptz not null default now(),
    push_delivered_at timestamptz,
    push_attempts integer not null default 0,
    metadata jsonb
);

-- Dedupe. Two evaluation passes over the same unchanged reading must not be able
-- to owe the user two notifications — the national tier refreshes hourly while
-- this cron runs every 15 minutes, so re-reading an identical row is the NORMAL
-- case here, not an edge case.
create unique index if not exists idx_gae_dedupe
    on public.gauge_alert_events (subscription_id, reading_at);

-- The drain's only lookup.
create index if not exists idx_gae_undelivered
    on public.gauge_alert_events (detected_at)
    where push_delivered_at is null;

create index if not exists idx_gae_user
    on public.gauge_alert_events (user_id, detected_at desc);

alter table public.gauge_alert_events enable row level security;

-- Own rows only, unlike river_condition_events which is world-readable. That
-- table describes the river and is the free public feed; this one describes a
-- private rule, and its rows would tell any reader what levels a named user is
-- watching. All writes are service-role.
create policy gauge_alert_events_select_own on public.gauge_alert_events
    for select using (user_id = (select auth.uid()));
