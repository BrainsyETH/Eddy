-- supabase/migrations/00164_fix_river_gauge_misassociations.sql
--
-- Fix confirmed gauge mis-associations: Huzzah, Courtois, and Meramec were
-- classifying float conditions off BIG RIVER gauges, not their own water.
--
-- Verified 2026-07-12 against BOTH the authoritative USGS site service AND the
-- live production `gauge_readings` (read-only):
--   * usgs 07017200 is "Big River at Irondale, MO" (St. Francois Co, 175 sq mi).
--     Production stored 272 cfs / 2.33 ft — matches Big River, NOT Huzzah.
--     It was wired as the PRIMARY gauge for BOTH huzzah and courtois, and even
--     mislabeled in gauge_stations as "Huzzah Creek near Steelville, MO".
--   * usgs 07018500 is "Big River at Byrnesville, MO" (St. Louis Co, 917 sq mi).
--     Production stored 1740 cfs / 6.69 ft — matches Big River, NOT Meramec.
--     It was wired as the Meramec PRIMARY and mislabeled "Meramec near Sullivan".
--   * usgs 07014000 is the REAL "Huzzah Creek near Steelville, MO" (Crawford Co,
--     259 sq mi). It already exists in gauge_stations and reports live
--     (1080 cfs / 5.54 ft on 2026-07-12) but was ORPHANED — linked to no river.
--   * usgs 07013000 is "Meramec River near Steelville, MO" (781 sq mi) — a real
--     Meramec gauge, already linked to meramec as a NON-primary gauge.
--
-- This migration (following the corrective-migration pattern of 00051/00071/00077;
-- the seed is intentionally not rewritten):
--   1. Relabels the two Big River stations honestly.
--   2. Repoints huzzah + courtois to the real Huzzah gauge (07014000).
--   3. Makes Meramec near Steelville (07013000) the Meramec primary and drops
--      the Big River (07018500) association from Meramec.
--
-- The ft thresholds set for 07014000 here are provisional `editorial` values for
-- the real creek; they are recalibrated (and the river is moved to CFS) in the
-- follow-on CFS migration. Big River stations are left active + correctly named
-- (they are valid MO stream gauges and can back a future Big River product).

-- ============================================================
-- 1. Relabel the two Big River gauge_stations honestly
-- ============================================================
UPDATE gauge_stations SET name = 'Big River at Irondale, MO'
WHERE usgs_site_id = '07017200';

UPDATE gauge_stations SET name = 'Big River at Byrnesville, MO'
WHERE usgs_site_id = '07018500';

-- Ensure the real Huzzah gauge is present, correctly named, and active
UPDATE gauge_stations SET name = 'Huzzah Creek near Steelville, MO', active = true
WHERE usgs_site_id = '07014000';

-- ============================================================
-- 2. Huzzah Creek: repoint from Big River (07017200) -> real Huzzah (07014000)
-- ============================================================
DELETE FROM river_gauges
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'huzzah')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07017200');

INSERT INTO river_gauges (
    river_id, gauge_station_id, is_primary, distance_from_section_miles,
    threshold_unit, level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous, threshold_source
)
SELECT r.id, gs.id, true, 0.0, 'ft', 1.5, 2.0, 2.5, 4.0, 5.0, 6.5, 'editorial'
FROM rivers r, gauge_stations gs
WHERE r.slug = 'huzzah' AND gs.usgs_site_id = '07014000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous,
    threshold_source = EXCLUDED.threshold_source;

-- ============================================================
-- 3. Courtois Creek: repoint proxy from Big River (07017200) -> Huzzah (07014000)
--    Courtois has no active real-time gauge; the real Huzzah is the correct
--    proxy (same watershed, similar volume/precipitation).
-- ============================================================
DELETE FROM river_gauges
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'courtois')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07017200');

INSERT INTO river_gauges (
    river_id, gauge_station_id, is_primary, distance_from_section_miles,
    threshold_unit, level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous, threshold_source
)
SELECT r.id, gs.id, true, 5.0, 'ft', 1.5, 2.0, 2.5, 4.0, 5.0, 6.5, 'editorial'
FROM rivers r, gauge_stations gs
WHERE r.slug = 'courtois' AND gs.usgs_site_id = '07014000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous,
    threshold_source = EXCLUDED.threshold_source;

-- ============================================================
-- 4. Meramec River: drop Big River (07018500); make Steelville (07013000) primary
-- ============================================================
DELETE FROM river_gauges
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07018500');

UPDATE river_gauges SET is_primary = false
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

UPDATE river_gauges SET is_primary = true
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07013000');

-- ============================================================
-- 5. Sanity check (raises if a curated river lost/duplicated its primary)
-- ============================================================
DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM (
    SELECT r.slug, COUNT(*) FILTER (WHERE rg.is_primary) AS primaries
    FROM rivers r JOIN river_gauges rg ON rg.river_id = r.id
    WHERE r.slug IN ('huzzah','courtois','meramec')
    GROUP BY r.slug
    HAVING COUNT(*) FILTER (WHERE rg.is_primary) <> 1
  ) x;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Association fix left % river(s) without exactly one primary gauge', bad_count;
  END IF;
  RAISE NOTICE 'Association fix OK: huzzah/courtois -> 07014000, meramec -> 07013000';
END $$;
