-- 20261109224918_lakes_pool_readings_and_launches.sql
--
-- Applied to Eddy production on 2026-11-09; filename matches recorded version.
-- Ledger: supabase/production-migrations.txt.
--
-- Phase 1 of the lakes plan (docs/LAKES_AND_LAUNCHES_PLAN_2026-11-09.md step 2,
-- ADR 0019): the two tables the Table Rock and Truman pilot needs and no more.
-- Status observations and area links come with the status step, once the
-- pilot's launches are reviewed.
--
-- A lake has no table of its own. Its identity is src/lib/lakes/registry.ts,
-- pinned by tests, and `lake_slug` here is validated against it in code — the
-- same arrangement dam_metric_readings and starred_dams use for `dam_id`.
--
-- ── lake_pool_readings ─────────────────────────────────────────────────────
-- Eddy's own record of the pool, one row per lake per observation, written by
-- /api/cron/sync-lake-levels. Why not a third metric in dam_metric_readings:
-- that table's CHECK admits two metrics, its value column is named in cfs,
-- buildPatternDays draws any other metric as total release, and
-- trust_dam_history_freshness() would call Truman's once-a-day pool
-- permanently stale. `daily` marks a source that publishes one value a day
-- (Truman through Ameren), so a trend never pretends to hourly resolution.
--
-- ── lake_launches ──────────────────────────────────────────────────────────
-- Reviewed launch places on a lake. Rows arrive unapproved from the Phase 0
-- review queue (scripts/ingestion/lakes/2026-11-09/) and are approved one by
-- one; nothing renders until `approved`, and the CHECKs below refuse to approve
-- a row with no launch method or no source. `access_point_id` is the one-identity
-- rule: a launch that is already an access point links to it and borrows its
-- name, photos and favorites, and the UNIQUE keeps it one place. Launch
-- methods (how a boat enters the water) are separate from amenities, and the
-- CHECK admits only the two methods ADR 0019 names. Elevation thresholds are
-- the Kansas City layer's ramp bottom and closure elevation in a named datum;
-- a missing threshold renders as "not published", never as fine.
--
-- Both tables are server-only. The page assembles them with the service role;
-- the API serves what the page serves. No client grant, RLS with no policies.

create table public.lake_pool_readings (
  lake_slug    text             not null check (length(lake_slug) between 1 and 60),
  observed_at  timestamptz      not null,
  elevation_ft double precision not null check (elevation_ft between -300 and 10000),
  datum        text             not null check (datum in ('NGVD29', 'NAVD88')),
  source       text             not null check (length(source) between 1 and 80),
  daily        boolean          not null default false,
  recorded_at  timestamptz      not null default now(),
  primary key (lake_slug, observed_at)
);

create index lake_pool_readings_observed_idx on public.lake_pool_readings (observed_at);

comment on table public.lake_pool_readings is
  'Eddy''s record of a lake''s pool elevation, written by /api/cron/sync-lake-levels from the controlling dam''s source (CWMS hourly, or Ameren''s daily Truman report with daily = true). Keyed by the registry slug in src/lib/lakes/registry.ts. Server-only: no client grant. ADR 0019.';
comment on column public.lake_pool_readings.daily is
  'True when the source publishes one value a day; a change computed over such readings must say so and must not pretend to hourly resolution.';

alter table public.lake_pool_readings enable row level security;
revoke all on public.lake_pool_readings from public, anon, authenticated;
grant all on public.lake_pool_readings to service_role;

create table public.lake_launches (
  id                      uuid primary key default gen_random_uuid(),
  lake_slug               text not null check (length(lake_slug) between 1 and 60),
  slug                    text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                    text not null check (length(name) between 1 and 120),
  longitude               double precision not null check (longitude between -180 and 180),
  latitude                double precision not null check (latitude between -90 and 90),
  -- How a boat enters the water. A human decision; the review queue leaves it empty.
  launch_methods          text[] not null default '{}' check (launch_methods <@ array['trailer', 'hand']::text[]),
  -- Facilities, in the access-point amenity vocabulary. A courtesy dock is an amenity, not a method.
  amenities               text[] not null default '{}',
  managing_agency         text check (managing_agency is null or length(managing_agency) between 1 and 80),
  fee_required            boolean,
  ramp_bottom_elev_ft     double precision check (ramp_bottom_elev_ft is null or ramp_bottom_elev_ft between -300 and 10000),
  ramp_closure_elev_ft    double precision check (ramp_closure_elev_ft is null or ramp_closure_elev_ft between -300 and 10000),
  elev_datum              text check (elev_datum is null or elev_datum in ('NGVD29', 'NAVD88')),
  elev_source             text check (elev_source is null or length(elev_source) between 1 and 160),
  elev_source_updated_at  timestamptz,
  -- One physical place, one identity: a launch that is already an access point links to it.
  access_point_id         uuid unique references public.access_points(id) on delete set null,
  -- Where the place came from: [{provider, source_id, url}], evidence rather than a claim about access.
  sources                 jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  review_note             text check (review_note is null or length(review_note) <= 2000),
  approved                boolean not null default false,
  approved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (lake_slug, slug),
  check ((approved and approved_at is not null) or (not approved)),
  -- A published launch has a reviewed method and at least one source behind it
  -- (ADR 0019 decisions 4 and 6). The queue stages rows with neither; approval
  -- is where a person supplies them, and the database refuses to publish without.
  check ((not approved) or cardinality(launch_methods) >= 1),
  check ((not approved) or jsonb_array_length(sources) >= 1),
  check ((ramp_bottom_elev_ft is null and ramp_closure_elev_ft is null) or elev_datum is not null)
);

create index lake_launches_lake_approved_idx on public.lake_launches (lake_slug) where approved;

comment on table public.lake_launches is
  'Reviewed launch places on a lake the registry carries (src/lib/lakes/registry.ts). Rows arrive unapproved from the Phase 0 review queue; nothing renders until approved. access_point_id links a launch that is already an access point so one place has one identity. Elevation thresholds are the ramp bottom and the closure elevation in elev_datum; they produce cautions, never clearance. Server-only: no client grant. ADR 0019.';
comment on column public.lake_launches.launch_methods is
  'How a boat enters the water: trailer, hand. Decided by a reviewer, never by the import. Amenities are separate.';
comment on column public.lake_launches.ramp_closure_elev_ft is
  'The elevation at which the managing agency closes the ramp (high water). Not the top of a usable range.';

alter table public.lake_launches enable row level security;
revoke all on public.lake_launches from public, anon, authenticated;
grant all on public.lake_launches to service_role;
