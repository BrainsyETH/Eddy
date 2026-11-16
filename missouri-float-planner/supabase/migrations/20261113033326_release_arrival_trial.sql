-- Release-arrival trial: a private, append-only log of estimates and outcomes.
--
-- ── What this is for ───────────────────────────────────────────────────────
-- Three studies (scripts/research/bull-shoals-lag-2026-11) showed that the
-- delay between a Bull Shoals release increase and the rise at the gauge near
-- Norfork is predictable on a normal river and early on a high one, and ran out
-- of untouched history before that could be confirmed. The only honest test
-- left is forward: write the estimate down before the river can answer, then
-- record what it did. /api/cron/log-release-arrivals does that, and these two
-- tables are where it writes. Nothing here is read by a page, a widget, an
-- alert or Eddy's Read. See docs/release-arrival-trial.md.
--
-- ── Why four tables ────────────────────────────────────────────────────────
-- A prediction, what is noticed while its water travels, and its outcome are
-- written hours apart by different passes. One row with columns for each would
-- need UPDATE, and a log whose rows can be updated cannot show that an estimate
-- was not adjusted afterwards. So each is its own insert, and no table grants
-- UPDATE or DELETE to anyone, service role included.
--
--   release_arrival_predictions   one per detected increase, at decision time
--   release_arrival_watch_events  the hour a live estimate's conditions changed
--   release_arrival_outcomes      what the gauge did, read a day later
--   release_arrival_passes        that a pass ran, active or paused
--
-- The passes table is what lets a missing prediction be explained. Without it
-- "no row" could mean no release, an outage or a deliberate pause, and the
-- share of increases the rule could speak on would be unknowable.
--
-- ── Why the clock is the database's ────────────────────────────────────────
-- decided_at, observed_at, evaluated_at and ran_at take their default and the
-- service role has no INSERT privilege on those columns, so the application
-- cannot supply them.
-- The check on decided_at then means what it says: an issued estimate was
-- stored before the earliest moment the study counts as an arrival (five hours
-- after the increase, which is timed at half past its first hour).

create table public.release_arrival_predictions (
  id uuid primary key default gen_random_uuid(),

  -- Registry id, e.g. 'swl-bull-shoals-dam'. Text with no foreign key, like
  -- dam_metric_readings: dams are read-through and have no row to point at.
  dam_id text not null,
  gauge_site_id text not null check (gauge_site_id ~ '^[0-9]{8,15}$'),

  -- The UTC hour the increase began. The hour the reading COVERS, the same
  -- convention as dam_metric_readings.observed_hour.
  onset_hour timestamptz not null,

  -- A changed rule is a new version and a new row, never an edit to an old one.
  rule_version text not null,

  decision text not null check (decision in ('issued', 'withheld')),
  -- The first reason in the rule's fixed order; null exactly when issued.
  reason text,
  all_reasons text[] not null default '{}',

  predicted_arrival_at timestamptz,
  range_early_at timestamptz,
  range_late_at timestamptz,

  -- Recorded for later analysis; a flag never changes the decision.
  flags text[] not null default '{}',

  -- Every reading the decision used, with its own time and when Eddy stored it.
  inputs jsonb not null,

  decided_at timestamptz not null default now(),

  constraint release_arrival_predictions_one_per_increase
    unique (dam_id, gauge_site_id, onset_hour, rule_version),
  constraint release_arrival_predictions_hour_truncated
    check (onset_hour = date_trunc('hour', onset_hour at time zone 'UTC') at time zone 'UTC'),
  constraint release_arrival_predictions_issued_is_complete
    check (
      (decision = 'issued') = (predicted_arrival_at is not null)
      and (decision = 'issued') = (range_early_at is not null)
      and (decision = 'issued') = (range_late_at is not null)
      and (decision = 'issued') = (reason is null)
      and (decision = 'issued') = (cardinality(all_reasons) = 0)
    ),
  constraint release_arrival_predictions_range_ordered
    check (
      decision <> 'issued'
      or (range_early_at < predicted_arrival_at and predicted_arrival_at < range_late_at)
    ),
  constraint release_arrival_predictions_written_before_window
    check (decision <> 'issued' or decided_at < onset_hour + interval '5 hours 30 minutes')
);

create index release_arrival_predictions_onset_idx
  on public.release_arrival_predictions (dam_id, gauge_site_id, onset_hour desc);

create table public.release_arrival_outcomes (
  prediction_id uuid primary key references public.release_arrival_predictions (id),

  status text not null check (
    status in ('matched', 'ambiguous', 'no rise found', 'gauge gap', 'gauge data unavailable')
  ),

  -- The first 0.10 ft rise of any cause in the window, matched or not.
  first_rise_at timestamptz,
  -- That rise, when it is the only one in the window and no other increase claims it.
  matched_rise_at timestamptz,
  rise_candidates integer not null check (rise_candidates >= 0),
  competing_increases integer not null check (competing_increases >= 0),

  -- The second outcome: the midpoint of the steepest one-hour rise.
  steepest_rise_at timestamptz,
  steepest_rise_ft_per_hour double precision,

  -- When tributaries first moved past the limit after the decision, if they did.
  tributary_watch_tripped_at timestamptz,

  details jsonb not null,
  evaluated_at timestamptz not null default now(),

  constraint release_arrival_outcomes_matched_has_a_rise
    check ((status = 'matched') = (matched_rise_at is not null))
);

create table public.release_arrival_watch_events (
  id bigint generated always as identity primary key,
  prediction_id uuid not null references public.release_arrival_predictions (id),

  -- What was seen. One kind today; a new kind is a deliberate migration.
  kind text not null check (kind in ('tributaries moving')),
  details jsonb not null,

  -- When the pass that noticed it wrote the row. This, not a later
  -- reconstruction, is the record of how quickly a change was caught.
  observed_at timestamptz not null default now(),

  -- Only the first sighting is evidence of detection time.
  constraint release_arrival_watch_events_first_sighting_only unique (prediction_id, kind)
);

create table public.release_arrival_passes (
  id bigint generated always as identity primary key,
  rule_version text not null,
  -- 'paused' is a pass that ran with the trial deliberately stopped.
  state text not null check (state in ('active', 'paused')),
  -- The newest release hour in hand, so data delay can be read per pass.
  release_through timestamptz,
  summary jsonb not null,
  ran_at timestamptz not null default now()
);

create index release_arrival_passes_ran_at_idx
  on public.release_arrival_passes (rule_version, ran_at desc);

comment on table public.release_arrival_predictions is
  'Internal trial. One row per detected Bull Shoals release increase: whether the frozen rule issued an arrival estimate for the gauge near Norfork, and from what. Append-only; written by /api/cron/log-release-arrivals before the outcome exists. Never a source for anything shown to users.';
comment on table public.release_arrival_outcomes is
  'Internal trial. What the gauge did after each logged release increase, read at least 26 hours later. Append-only.';
comment on table public.release_arrival_watch_events is
  'Internal trial. The first pass at which an issued estimate''s tributaries were seen past the limit while its water was still travelling. Append-only.';
comment on table public.release_arrival_passes is
  'Internal trial. One row per pass of /api/cron/log-release-arrivals, written last. A gap is an outage; paused rows are a deliberate stop. Append-only.';

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Server-side only, and append-only even there. RLS with no policies denies
-- anon and authenticated outright; the service role bypasses RLS, so its limits
-- are the grants below: read everything, insert the application's columns, and
-- nothing else.
alter table public.release_arrival_predictions enable row level security;
alter table public.release_arrival_outcomes enable row level security;
alter table public.release_arrival_watch_events enable row level security;
alter table public.release_arrival_passes enable row level security;

revoke all on
  public.release_arrival_predictions, public.release_arrival_outcomes,
  public.release_arrival_watch_events, public.release_arrival_passes
  from public, anon, authenticated, service_role;

grant select on
  public.release_arrival_predictions, public.release_arrival_outcomes,
  public.release_arrival_watch_events, public.release_arrival_passes
  to service_role;

grant insert (prediction_id, kind, details) on public.release_arrival_watch_events to service_role;

grant insert (rule_version, state, release_through, summary) on public.release_arrival_passes to service_role;

grant insert (
  dam_id, gauge_site_id, onset_hour, rule_version, decision, reason, all_reasons,
  predicted_arrival_at, range_early_at, range_late_at, flags, inputs
) on public.release_arrival_predictions to service_role;

grant insert (
  prediction_id, status, first_rise_at, matched_rise_at, rise_candidates, competing_increases,
  steepest_rise_at, steepest_rise_ft_per_hour, tributary_watch_tripped_at, details
) on public.release_arrival_outcomes to service_role;
