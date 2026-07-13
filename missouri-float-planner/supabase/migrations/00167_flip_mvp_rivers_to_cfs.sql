-- supabase/migrations/00167_flip_mvp_rivers_to_cfs.sql
--
-- Flip the curated MVP river gauges from gauge-height (ft) thresholds to CFS
-- (discharge), the metric Ozark paddlers actually use. Runs after the gauge
-- association fix (00164), the NWS flood-stage backfill (00165), and the
-- unit-independent flood override (00166).
--
-- CFS bands come from USGS mid-July climatological discharge percentiles
-- (statTypeCd=all, parameterCd=00060, day-of-year 7/12), fetched 2026-07-12:
--   too_low=p10  low=p25  optimal_min=p50  optimal_max=p75  high=p90
-- The current ft ladder is preserved in alt_level_* so the UI ft/cfs toggle
-- still works.  level_dangerous is a CONSERVATIVE editorial backstop (~2x p90)
-- so every code path has a cfs danger line; the AUTHORITATIVE "Dangerous" line
-- is the official NWS flood STAGE (ft) applied by the 00166 flood override.
-- threshold_source='usgs' (percentile-derived).  Doniphan (07068000) is left as
-- its curated moherp CFS ladder.  Secondary Current/Meramec gauges without
-- fetched percentiles stay ft for now (mixed units are supported).
--
-- See docs/CFS_MIGRATION_THRESHOLDS.md for the full derivation + sanity checks.


UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 2, alt_level_low = 2.5, alt_level_optimal_min = 3,
  alt_level_optimal_max = 3.9, alt_level_high = 4, alt_level_dangerous = 5,
  level_too_low = 704, level_low = 885, level_optimal_min = 1180,
  level_optimal_max = 1630, level_high = 2000, level_dangerous = 4000,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07067000');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 0.75, alt_level_low = 1.5, alt_level_optimal_min = 2,
  alt_level_optimal_max = 3.1, alt_level_high = 3.2, alt_level_dangerous = 4,
  level_too_low = 198, level_low = 235, level_optimal_min = 308,
  level_optimal_max = 411, level_high = 909, level_dangerous = 1818,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07064533');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1, alt_level_low = 1.5, alt_level_optimal_min = 2,
  alt_level_optimal_max = 3.4, alt_level_high = 3.41, alt_level_dangerous = 5,
  level_too_low = 301, level_low = 420, level_optimal_min = 588,
  level_optimal_max = 804, level_high = 1120, level_dangerous = 2240,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07071500');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1.5, alt_level_low = 2, alt_level_optimal_min = 2.5,
  alt_level_optimal_max = 3, alt_level_high = 3.5, alt_level_dangerous = 4,
  level_too_low = 56, level_low = 74, level_optimal_min = 97,
  level_optimal_max = 141, level_high = 482, level_dangerous = 964,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07065495');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1, alt_level_low = 1.3, alt_level_optimal_min = 1.5,
  alt_level_optimal_max = 3, alt_level_high = 3.5, alt_level_dangerous = 4,
  level_too_low = 34, level_low = 39, level_optimal_min = 45,
  level_optimal_max = 86, level_high = 697, level_dangerous = 1394,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07065200');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1, alt_level_low = 1.5, alt_level_optimal_min = 2,
  alt_level_optimal_max = 3, alt_level_high = 3.5, alt_level_dangerous = 4,
  level_too_low = 121, level_low = 155, level_optimal_min = 221,
  level_optimal_max = 276, level_high = 446, level_dangerous = 892,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07066000');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1.2, alt_level_low = 1.8, alt_level_optimal_min = 2.5,
  alt_level_optimal_max = 4.5, alt_level_high = 6.5, alt_level_dangerous = 9,
  level_too_low = 131, level_low = 162, level_optimal_min = 224,
  level_optimal_max = 322, level_high = 533, level_dangerous = 1066,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07013000');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 0.8, alt_level_low = 1, alt_level_optimal_min = 1.5,
  alt_level_optimal_max = 3.5, alt_level_high = 5, alt_level_dangerous = 8,
  level_too_low = 31, level_low = 46, level_optimal_min = 117,
  level_optimal_max = 180, level_high = 541, level_dangerous = 1082,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '06923250');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1.5, alt_level_low = 2, alt_level_optimal_min = 2.5,
  alt_level_optimal_max = 5, alt_level_high = 7, alt_level_dangerous = 10,
  level_too_low = 90, level_low = 142, level_optimal_min = 234,
  level_optimal_max = 441, level_high = 754, level_dangerous = 1508,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '06923950');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1.8, alt_level_low = 2.3, alt_level_optimal_min = 3,
  alt_level_optimal_max = 5.5, alt_level_high = 7, alt_level_dangerous = 10,
  level_too_low = 123, level_low = 149, level_optimal_min = 194,
  level_optimal_max = 263, level_high = 407, level_dangerous = 814,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '06930000');

UPDATE river_gauges SET
  threshold_unit = 'cfs',
  alt_level_too_low = 1.5, alt_level_low = 2, alt_level_optimal_min = 2.5,
  alt_level_optimal_max = 4, alt_level_high = 5, alt_level_dangerous = 6.5,
  level_too_low = 56, level_low = 66, level_optimal_min = 111,
  level_optimal_max = 169, level_high = 373, level_dangerous = 746,
  threshold_source = 'usgs'
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07014000');

