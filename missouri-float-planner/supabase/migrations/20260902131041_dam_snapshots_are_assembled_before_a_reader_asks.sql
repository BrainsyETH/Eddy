-- 20260902131041_dam_snapshots_are_assembled_before_a_reader_asks.sql
--
-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-02 13:10:41 UTC and
-- RECORDED as 20260902131041; authored as 20260831130000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt. The DDL
-- applied is this file's DDL verbatim; the prose was abridged in transit.
--
-- One assembled dam snapshot per project, rebuilt hourly by a cron.
--
-- ── Why this exists, against a module that says not to store dam data ───────
--
-- src/lib/data/dams.ts opens by stating dam data is READ-THROUGH, NOT STORED,
-- and 20260813120000 already argued one exception (observations, which no
-- published source keeps). This is a second exception with a different shape,
-- and the difference is worth stating precisely because the rule is a good one.
--
-- That rule is about RETENTION: a copy of yesterday's forecast is worthless, so
-- do not keep one. Nothing here is kept. There is exactly one row per dam, it
-- is overwritten every hour, and nothing reads it once it is three hours old.
--
-- What it changes is WHO WAITS. Assembling one dam's page means seven CWMS
-- series, up to three SWPA files, a pattern read and a forecast series. Measured
-- on production: 8.16s cold, 0.12s on the CDN hit immediately after. There are
-- twenty dams, each with its own cache key, and the routes set
-- s-maxage=900, stale-while-revalidate=3600 — so an entry goes cold roughly
-- seventy-five minutes after the last request for that dam, and at this
-- product's traffic most first visits pay the full eight seconds.
--
-- No cache policy fixes that; the work has to happen before the reader arrives.
--
-- ── One row, not a history ─────────────────────────────────────────────────
--
-- Deliberately NOT (dam_id, built_at) with retention. A second row would make
-- this a store of dam forecasts over time, which is the thing dams.ts is right
-- to refuse, and every reader wants the newest row anyway. `dam_id` alone as
-- the primary key makes "keep only the latest" a property of the schema rather
-- than a job somebody has to remember to run.
--
-- ── jsonb, not columns ─────────────────────────────────────────────────────
--
-- The payload is a DamSnapshot — the exact shape /api/dams/[damId] returns,
-- built by buildSnapshot() and pinned field-by-field by
-- dams-route-contract.test.ts. Normalising it into columns would be a second
-- schema for a wire format that already has one, and every field added to the
-- snapshot would then need a migration to keep being served. Nothing queries
-- inside the payload: the only predicates are on dam_id and built_at.
--
-- No CHECK on the payload's shape for the same reason. The contract test owns
-- that, it can express things SQL cannot, and a constraint here would fail a
-- cron write at 3am for a field the routes would have rendered fine.

create table if not exists public.dam_snapshots (
  -- Registry id, e.g. 'swl-bull-shoals-dam'. TEXT WITH NO FOREIGN KEY, for the
  -- same reason starred_dams and dam_metric_readings have none: dams are
  -- read-through and have no rows anywhere to point at. Referential integrity
  -- is the cron's job — it iterates USACE_DAMS and cannot write an id the
  -- registry does not hold — and pruneStoredSnapshots removes a row whose
  -- project has since left the registry.
  dam_id     text        primary key,

  -- The assembled DamSnapshot, exactly as the route returns it.
  payload    jsonb       not null,

  -- When the payload was ASSEMBLED, which is not when the row was written and
  -- not when the observations inside it were taken. It is the only one of the
  -- three that answers "is this worth serving", and isFresh() in
  -- dam-snapshot-store.ts is the one place that decides.
  built_at   timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

comment on table public.dam_snapshots is
  'One assembled DamSnapshot per USACE dam, rebuilt hourly by /api/cron/sync-dam-snapshots and served by /api/dams and /api/dams/[damId]. A staging table for latency, not a history: one row per dam, overwritten in place, ignored by readers past three hours. See src/lib/data/dam-snapshot-store.ts.';

comment on column public.dam_snapshots.built_at is
  'When the snapshot was assembled. Readers ignore a row older than MAX_AGE_MS (3h) and read through to CWMS/SWPA instead, so a dead cron degrades to the pre-2026-08-31 behaviour rather than serving a stale schedule.';

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Server-side only, following dam_metric_readings and the rule
-- 20260810201000_revoke_public_grants_on_cron_lock_and_validation set: a table
-- with no client reader gets no client grant. Both dam routes read this with
-- the service client while assembling their response.
alter table public.dam_snapshots enable row level security;

revoke all on public.dam_snapshots from anon, authenticated;

-- No policies are defined on purpose. RLS with zero policies denies every
-- anon/authenticated request outright; the service role bypasses RLS and is the
-- only thing that touches this table.
