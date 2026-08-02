-- 20260802160000_percentile_source_modern_api.sql
--
-- Comment-only. No schema or data change.
--
-- The comment set by 00187 states that usgs_daily_percentiles is "snapshotted
-- from the USGS legacy statistics service, which has no modern OGC equivalent
-- and is slated for decommission." The second half is now false: USGS ships a
-- Statistics API (api.waterdata.usgs.gov/statistics/v0/observationNormals),
-- which is what src/lib/usgs/percentile-snapshot.ts writes from as of the
-- WaterServices migration.
--
-- It is not an OGC collection — different host path, different envelope, absent
-- from the OGC collections list — which is why it went unnoticed long enough
-- for four files and this comment to record the opposite.
--
-- The `source` column distinguishes rows: 'usgs_legacy_stat_service' for
-- anything snapshotted before the migration, 'usgs_statistics_api_v0' after.
-- Re-running the snapshot replaces rows in place, so the mix drains over time.

comment on table public.usgs_daily_percentiles is
    'Day-of-year discharge statistics for USGS gauges. Written from the USGS '
    'Statistics API (observationNormals); rows predating the Q1 2027 '
    'WaterServices migration carry source=usgs_legacy_stat_service. '
    'day_of_year is LEAP-YEAR normalized (Feb 29 = 60, Mar 1 = 61 always) so a '
    'given calendar date maps to one row regardless of year. The modern source '
    'publishes p05/p10/p25/p50/p75/p90/p95 — no p20 or p80, and unlike the '
    'legacy service its p90 is populated.';

comment on column public.usgs_daily_percentiles.source is
    'Which service produced the row: usgs_statistics_api_v0 (current) or '
    'usgs_legacy_stat_service (pre-migration). The two are not identical — USGS '
    'changed the derivation methodology — so this is load-bearing provenance, '
    'not bookkeeping.';

comment on column public.usgs_daily_percentiles.p20 is
    'Legacy-only. The modern Statistics API does not publish p20; rows written '
    'after the migration leave it null.';

comment on column public.usgs_daily_percentiles.p80 is
    'Legacy-only. The modern Statistics API does not publish p80; rows written '
    'after the migration leave it null. It was the stand-in upper anchor while '
    'the legacy p90 came back empty (see upperAnchor in src/lib/usgs/gauges.ts).';
