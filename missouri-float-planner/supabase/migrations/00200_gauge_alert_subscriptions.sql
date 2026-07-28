-- 00200_gauge_alert_subscriptions.sql
-- Per-gauge alert rules: Eddy's condition ladder, or the user's own number.
--
-- ── Why a second table and not more columns on alert_subscriptions ──────────
--
-- alert_subscriptions feeds a GLOBAL outbox. update-gauges detects one condition
-- transition per river_gauges row, records it once in river_condition_events via
-- the compare-and-swap in 00189, and deliver-push fans that single event out to
-- every subscriber. That works precisely because the verdict is the same for
-- everybody: "the Huzzah became floatable" is one fact.
--
-- A user-defined level is not one fact. "Above 3.0 ft" and "above 4.2 ft" cross
-- at different readings, so there is no event to precompute and nothing to fan
-- out — each rule has to be evaluated against the reading on its own. That is a
-- different mechanism, so it gets a different table rather than nullable columns
-- bolted onto a table whose every consumer assumes the fan-out model.
--
-- The two modes live together here because they share that per-rule evaluation:
--   mode='condition' — grade the reading with the river_gauges ladder, same
--                      verdict vocabulary as the river path, but scoped to ONE
--                      user so it can carry their own one_shot and cooldown.
--   mode='threshold' — compare the reading to the user's number.
--
-- ── Anchored to a STATION, not a river ──────────────────────────────────────
--
-- gauge_station_id is the required target and river_id is the optional label,
-- which is the opposite of alert_subscriptions. Readings belong to stations; a
-- river only has a reading by way of one. This is also what lets a rule exist on
-- the ~16,500 uncurated national stations from 00196, which are wired to no
-- river at all and can therefore only ever be threshold rules.
--
-- A river-scoped custom level is stored here too, as a rule on that river's
-- primary station with river_id set. The app presents it as a river alert; the
-- evaluator does not care.

create table if not exists public.gauge_alert_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    gauge_station_id uuid not null references public.gauge_stations(id) on delete cascade,

    -- WHICH LADDER, and the display label. Null for a national-tier station that
    -- rates no river. Note a station can rate several rivers with DIFFERENT
    -- ladders (07014000 is primary for the Huzzah and also rates the Courtois),
    -- so condition mode must grade against the row named here — never
    -- thresholds[0], never blindly the primary. Same rule gaugeLink() applies in
    -- the app.
    river_id uuid references public.rivers(id) on delete cascade,

    -- What the user thinks they created, which river_id cannot tell us on its
    -- own: a river-scoped custom level and a gauge-scoped condition rule BOTH
    -- carry a river_id, and they are not the same thing. The manage list titles
    -- them differently, and — load bearing — the push payload routes on it, to
    -- /river/[slug] or /gauge/[siteId]. Inferring it would send someone who set
    -- an alert on a gauge to a river screen that never mentions it.
    scope text not null default 'gauge' check (scope in ('river', 'gauge')),

    mode text not null check (mode in ('condition', 'threshold')),

    -- ── condition mode ──────────────────────────────────────────────────────
    -- Same vocabulary as alert_subscriptions.kind, and deliberately so: the
    -- fan-out's subscriptionKindsFor() maps event kinds onto exactly these three
    -- and is reused unchanged. 'floatable' alone makes a warning structurally
    -- undeliverable — the app must default to 'all'.
    condition_kind text check (condition_kind in ('floatable', 'safety', 'all')),

    -- ── threshold mode ──────────────────────────────────────────────────────
    -- metric is EXPLICIT, never inferred. A cfs number graded against a foot
    -- ladder is how a dead stage sensor used to manufacture a 'dangerous'; the
    -- gate in src/lib/alerts/gate.ts exists to stop exactly that, and it needs
    -- to be told which series this rule is about.
    metric text check (metric in ('gauge_height_ft', 'discharge_cfs')),
    comparator text check (comparator in ('above', 'below', 'between')),
    threshold_value numeric(12, 2),
    threshold_value_max numeric(12, 2),

    enabled boolean not null default true,
    -- "Tell me once, then stop." Spent when last_triggered_at is set; the PATCH
    -- route re-arms by clearing it.
    one_shot boolean not null default false,

    -- ── Crossing state ──────────────────────────────────────────────────────
    --
    -- Alerts are EDGE-triggered: they fire on outside → inside, never for merely
    -- remaining inside. Without this a rule would re-fire on every pass for as
    -- long as the water stayed up.
    --
    -- Seeded by the POST route from the reading at creation time, NOT left null
    -- for the first cron pass to discover. Someone who sets "above 3 ft" while
    -- the river is already at 5.2 ft has described water they can see; firing at
    -- them immediately is a notification that tells them nothing they did not
    -- just type.
    last_state text check (last_state in ('inside', 'outside')),
    last_value numeric(12, 2),
    last_reading_at timestamptz,
    last_evaluated_at timestamptz,
    last_triggered_at timestamptz,

    -- Condition mode's equivalent of last_state, held PER RULE rather than read
    -- from river_gauges.last_condition_code.
    --
    -- Sharing that column would look like reuse and would silently drop alerts:
    -- update-gauges advances it as soon as it detects the transition, and this
    -- evaluator runs on its own schedule, so by the time a rule was examined the
    -- "old" code would already equal the new one and classifyEventKind() would
    -- return 'info' for every real change. The race is unwinnable from here —
    -- the two crons have no ordering guarantee — so the rule keeps its own.
    last_condition_code text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- Each mode owns its own columns and may not borrow the other's. Enforced
    -- here rather than in the route so a bad backfill or a psql session cannot
    -- create a row the evaluator would have to guess about.
    constraint gauge_alert_mode_shape check (
        (
            mode = 'condition'
            and condition_kind is not null
            and metric is null
            and comparator is null
            and threshold_value is null
            and threshold_value_max is null
        )
        or (
            mode = 'threshold'
            and condition_kind is null
            and metric is not null
            and comparator is not null
            and threshold_value is not null
            and (
                (comparator <> 'between' and threshold_value_max is null)
                or (comparator = 'between' and threshold_value_max > threshold_value)
            )
        )
    ),

    -- Condition mode has no ladder to grade against without a river.
    constraint gauge_alert_condition_needs_river check (
        mode <> 'condition' or river_id is not null
    ),

    -- A river-scoped rule is displayed and routed by its river; without one
    -- there is nothing to title it with and nowhere for its notification to go.
    constraint gauge_alert_river_scope_needs_river check (
        scope <> 'river' or river_id is not null
    )
);

-- One rule per distinct definition. coalesce because null never equals null in a
-- unique index, so without it a user could create "above 3.0 ft" twice over.
create unique index if not exists idx_gas_dedupe
    on public.gauge_alert_subscriptions (
        user_id,
        gauge_station_id,
        mode,
        coalesce(river_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(condition_kind, ''),
        coalesce(metric, ''),
        coalesce(comparator, ''),
        coalesce(threshold_value, -1),
        coalesce(threshold_value_max, -1)
    );

-- The evaluator's ONLY lookup: which stations does anyone still care about?
-- Partial, because a paused rule must not drag its station into the pass — that
-- is what keeps the cron proportional to subscribed stations (hundreds) rather
-- than to gauge_stations (~16,500).
create index if not exists idx_gas_enabled_station
    on public.gauge_alert_subscriptions (gauge_station_id)
    where enabled;

create index if not exists idx_gas_user
    on public.gauge_alert_subscriptions (user_id);

alter table public.gauge_alert_subscriptions enable row level security;

-- Same shape as alert_subscriptions in 00183. is_permanent_user() on writes is
-- not a tier: push needs a durable identity to route to, and an anonymous id is
-- replaced on reinstall. The policy enforces it independently of the route.
create policy gauge_alerts_select_own on public.gauge_alert_subscriptions
    for select using (user_id = (select auth.uid()));

create policy gauge_alerts_insert_own on public.gauge_alert_subscriptions
    for insert with check (user_id = (select auth.uid()) and public.is_permanent_user());

create policy gauge_alerts_update_own on public.gauge_alert_subscriptions
    for update using (user_id = (select auth.uid()) and public.is_permanent_user())
    with check (user_id = (select auth.uid()));

create policy gauge_alerts_delete_own on public.gauge_alert_subscriptions
    for delete using (user_id = (select auth.uid()));

create or replace function public.update_gauge_alert_subscriptions_updated_at()
returns trigger
language plpgsql
-- Pinned search_path, matching the hardening 00186 applied to the other alert
-- trigger functions.
set search_path = public, pg_temp
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists gauge_alert_subscriptions_updated_at on public.gauge_alert_subscriptions;
create trigger gauge_alert_subscriptions_updated_at
    before update on public.gauge_alert_subscriptions
    for each row execute function public.update_gauge_alert_subscriptions_updated_at();

-- ============================================================
-- alert_subscriptions: pause, for parity with the new table
-- ============================================================
-- River alerts could only be created or destroyed. Pausing one meant losing it
-- and its one_shot state, so a user going away for a month had to rebuild their
-- alerts on return. deliver-push filters on this.
alter table public.alert_subscriptions
    add column if not exists enabled boolean not null default true;
