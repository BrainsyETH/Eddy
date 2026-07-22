-- 00182_ios_river_condition_events.sql
-- iOS Phase 0: river_condition_events — the alert outbox.
--
-- Every condition transition update-gauges detects gets persisted here (ALL
-- transitions, including low → good "floatable" — the classifier currently
-- drops those; see strategy doc, backend step 5d). Push delivery runs as a
-- separate pass over WHERE push_delivered_at IS NULL (at-least-once, survives
-- killed cron runs). The Alerts tab feed reads this table publicly — the feed
-- is free to view; only real-time push is gated.
--
-- This migration lands the table; the update-gauges outbox wiring, cron lock,
-- and Expo delivery pass are the next Phase 0 slice.

create table if not exists public.river_condition_events (
    id uuid primary key default gen_random_uuid(),
    river_id uuid not null references public.rivers(id) on delete cascade,
    river_gauge_id uuid references public.river_gauges(id) on delete set null,
    old_condition_code text not null,
    new_condition_code text not null,
    -- Superset of today's social classifier kinds (warning/easing) plus the
    -- classes paid delivery needs: floatable (low|too_low → good) and
    -- recovery. 'info' covers transitions we persist but never push.
    kind text not null check (kind in ('floatable', 'warning', 'easing', 'recovery', 'info')),
    -- The gauge reading that triggered the transition, in the gauge's
    -- primary unit only (never the ft↔cfs fallback — data-quality rule).
    reading_value numeric,
    reading_unit text check (reading_unit in ('ft', 'cfs')),
    reading_at timestamptz,
    detected_at timestamptz not null default now(),
    -- Outbox delivery state, stamped per event by the push pass.
    push_delivered_at timestamptz,
    push_attempts integer not null default 0,
    metadata jsonb
);

-- Dedupe backstop: the hourly and 15-min crons both fire at :00 today. Two
-- runs processing the same gauge reading must produce one event.
create unique index if not exists river_condition_events_dedupe
    on public.river_condition_events (river_gauge_id, new_condition_code, reading_at)
    where river_gauge_id is not null and reading_at is not null;

-- Feed reads: newest events per river / global.
create index if not exists idx_rce_river_detected
    on public.river_condition_events (river_id, detected_at desc);
create index if not exists idx_rce_detected
    on public.river_condition_events (detected_at desc);

-- Delivery pass scan.
create index if not exists idx_rce_undelivered
    on public.river_condition_events (detected_at)
    where push_delivered_at is null;

alter table public.river_condition_events enable row level security;

-- Public read (free feed, no account required); writes are service-role only.
create policy river_condition_events_select_all on public.river_condition_events
    for select using (true);
