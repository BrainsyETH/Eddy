-- Activate the Big Piney River so it shows on the surface-water map and
-- /plan picker alongside the seven existing curated rivers.
--
-- Big Piney was seeded earlier (geometry, 32 access points, primary +
-- secondary USGS gauges all linked with editorial-validated stage-ft
-- thresholds) but kept inactive until we were ready to expose it. Both
-- gauge_stations are already active.
--
-- New rivers added going forward (Gasconade, etc.) should ship with
-- threshold_unit = 'cfs' as the project default; Big Piney's existing
-- ft thresholds are kept intact since they're already calibrated.

UPDATE rivers SET active = true WHERE slug = 'big-piney';
