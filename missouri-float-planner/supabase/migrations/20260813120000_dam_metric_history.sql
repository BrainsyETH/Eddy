-- 20260813120000_dam_metric_history.sql
--
-- Hourly history of what a powerhouse actually did.
--
-- ── Why this exists, against a module that says not to store dam data ───────
-- src/lib/data/dams.ts opens by stating dam data is READ-THROUGH, NOT STORED,
-- and gives good reasons: the Corps rewrites its release forecast daily and
-- SWPA republishes seven schedule files on a rolling week, so yesterday's copy
-- of either is worthless. That argument is about FORECASTS AND PLANS. It does
-- not cover observations.
--
-- The generation pattern strip — "this dam runs mornings on weekdays and all
-- day Saturday" — is the question a visiting angler asks a week out, and no
-- published source answers it. Answering it needs observations kept, and it
-- needs them kept as OBSERVATIONS: the past half of that strip may never be
-- drawn from an old schedule, because a schedule is what was planned and
-- redrawing it as history would present a plan as a record of the river.
--
-- ── Two series, not one ────────────────────────────────────────────────────
-- Turbine discharge and total release are separate metrics with separate rows.
-- They answer different questions, they disagree exactly when the answer is
-- interesting (units idle, water still leaving), and folding them into one
-- gauge station would make that difference unrecoverable. gauge_readings has
-- two value columns and neither means "through the turbines".
--
-- ── This table is a CACHE, seeded from CWMS ────────────────────────────────
-- CWMS already serves roughly a week of hourly Flow-Plant and Flow-Res Out on
-- request, so the strip does not have to wait for history to accumulate — the
-- cron backfills. What the table buys is that the detail route makes no extra
-- upstream calls, the strip survives a CWMS outage, and a gap is RECORDED as a
-- gap rather than re-fetched into existence.
--
-- Retention is 35 days, enforced by the cron: enough for a seven-day strip with
-- headroom for a week of failed runs, and short enough that this never becomes
-- a table anybody has to think about.

create table if not exists public.dam_metric_readings (
  -- Registry id, e.g. 'swl-bull-shoals-dam'. TEXT WITH NO FOREIGN KEY, for the
  -- same reason starred_dams has none: dams are read-through and have no rows
  -- anywhere to point at. Referential integrity is the cron's job — it iterates
  -- USACE_DAMS and cannot write an id the registry does not hold.
  dam_id        text        not null,

  -- Constrained to the two series the pattern strip draws. A new metric is a
  -- deliberate migration, not an insert that happens to typo through.
  metric        text        not null,

  -- Hour-truncated UTC. The bucket, not a sample time: CWMS publishes at
  -- 15-minute to hourly cadence depending on district and series, and the strip
  -- draws one bar per hour either way.
  observed_hour timestamptz not null,

  -- Mean of the samples that landed in the bucket, cfs.
  value_cfs     double precision not null,

  -- How many samples the mean came from. Kept so a bucket built from one
  -- sample at :55 is distinguishable from one built from four, which is the
  -- difference between a reading and an artefact when a feed is degrading.
  sample_count  integer     not null default 1,

  updated_at    timestamptz not null default now(),

  -- The primary key IS the idempotency. The cron re-reads an overlapping
  -- window every hour so it self-heals after a failed run, and every re-read
  -- upserts the same rows rather than duplicating them.
  primary key (dam_id, metric, observed_hour),

  constraint dam_metric_readings_metric_known
    check (metric in ('generationFlow', 'release')),
  -- Spelled the long way round on purpose. `date_trunc('hour', timestamptz)`
  -- truncates in the SESSION time zone and is therefore only STABLE, which
  -- Postgres refuses inside a CHECK. Converting to a zoneless timestamp at an
  -- explicit zone first — `timezone(text, timestamptz)` — is IMMUTABLE in both
  -- directions, so this form is accepted and, more to the point, means the same
  -- thing no matter who is connected.
  constraint dam_metric_readings_hour_truncated
    check (
      observed_hour
        = date_trunc('hour', observed_hour at time zone 'UTC') at time zone 'UTC'
    ),
  -- Discharge is never negative. A negative arriving here means the series does
  -- not mean what the resolver thinks it means, and it should fail loudly at
  -- the write rather than draw a bar below the axis a week later.
  constraint dam_metric_readings_value_nonnegative
    check (value_cfs >= 0),
  constraint dam_metric_readings_sample_count_positive
    check (sample_count >= 1)
);

-- The one access path: "this dam, this metric, the last N days, in order."
-- The primary key already leads with (dam_id, metric), so this index exists
-- only to make the retention delete cheap.
create index if not exists dam_metric_readings_observed_hour_idx
  on public.dam_metric_readings (observed_hour);

comment on table public.dam_metric_readings is
  'Hourly observed turbine discharge and total release per USACE dam. A cache of CWMS, seeded by /api/cron/sync-dam-history, retained 35 days. NULL is expressed by a MISSING ROW, never a zero — a gap is an outage, not an idle powerhouse.';

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Server-side only. /api/dams/[damId] reads this with the service client while
-- assembling the snapshot, so nothing needs anon or authenticated access, and
-- 20260810201000_revoke_public_grants_on_cron_lock_and_validation established
-- that a table with no client reader gets no client grant.
alter table public.dam_metric_readings enable row level security;

revoke all on public.dam_metric_readings from anon, authenticated;

-- No policies are defined on purpose. RLS with zero policies denies every
-- anon/authenticated request outright; the service role bypasses RLS and is the
-- only thing that touches this table.
