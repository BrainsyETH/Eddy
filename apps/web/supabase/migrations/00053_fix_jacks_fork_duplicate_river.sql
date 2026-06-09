-- Migration: Fix Jacks Fork duplicate river rows and gauge associations
--
-- Root cause: The migration add_jacks_fork_gauge_thresholds.sql created a river
-- row with slug 'jacks-fork-river', while the seed data (rivers.sql) creates one
-- with slug 'jacks-fork'. Since migrations run before seeds, both rows can exist.
-- Gauge associations ended up on the 'jacks-fork-river' row, but all application
-- code uses 'jacks-fork' — causing "gauge data unavailable" in Eddy updates.
--
-- Fix: Merge any gauge associations from the incorrect slug onto the correct one,
-- then delete the duplicate row.

DO $$
DECLARE
  correct_id UUID;
  incorrect_id UUID;
BEGIN
  -- Find the correct row (slug = 'jacks-fork', used by application code)
  SELECT id INTO correct_id FROM rivers WHERE slug = 'jacks-fork' LIMIT 1;

  -- Find the incorrect row (slug = 'jacks-fork-river', from old migration)
  SELECT id INTO incorrect_id FROM rivers WHERE slug = 'jacks-fork-river' LIMIT 1;

  -- If no duplicate exists, nothing to fix
  IF incorrect_id IS NULL THEN
    RAISE NOTICE 'No duplicate jacks-fork-river row found — skipping';
    RETURN;
  END IF;

  -- If the correct row doesn't exist but the incorrect one does, just rename it
  IF correct_id IS NULL AND incorrect_id IS NOT NULL THEN
    UPDATE rivers SET slug = 'jacks-fork' WHERE id = incorrect_id;
    RAISE NOTICE 'Renamed jacks-fork-river to jacks-fork (id: %)', incorrect_id;
    RETURN;
  END IF;

  RAISE NOTICE 'Found duplicate: correct id=% (jacks-fork), incorrect id=% (jacks-fork-river)', correct_id, incorrect_id;

  -- Move river_gauges associations from incorrect to correct river
  -- First, delete any that would conflict (same gauge_station_id already linked to correct river)
  DELETE FROM river_gauges
  WHERE river_id = incorrect_id
  AND gauge_station_id IN (
    SELECT gauge_station_id FROM river_gauges WHERE river_id = correct_id
  );

  -- Move remaining gauge associations to the correct river
  UPDATE river_gauges
  SET river_id = correct_id
  WHERE river_id = incorrect_id;

  RAISE NOTICE 'Moved gauge associations from jacks-fork-river to jacks-fork';

  -- Move any other foreign key references to point to the correct row
  UPDATE access_points SET river_id = correct_id WHERE river_id = incorrect_id;
  UPDATE mile_markers SET river_id = correct_id WHERE river_id = incorrect_id;
  UPDATE float_segments SET river_id = correct_id WHERE river_id = incorrect_id;
  UPDATE nps_campgrounds SET river_id = correct_id WHERE river_id = incorrect_id;

  -- Delete the duplicate river row
  DELETE FROM rivers WHERE id = incorrect_id;
  RAISE NOTICE 'Deleted duplicate jacks-fork-river row (id: %)', incorrect_id;

END $$;

-- Ensure the correct Jacks Fork river has all three gauge associations with proper config
-- 07065495 = Alley Spring (primary), 07065200 = Mountain View (upper), 07066000 = Eminence (lower)

-- Set Alley Spring (07065495) as primary
INSERT INTO river_gauges (
  river_id, gauge_station_id, is_primary, threshold_unit,
  level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous
)
SELECT r.id, gs.id, true, 'ft', 1.5, 2.0, 2.5, 3.0, 3.5, 4.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'jacks-fork' AND gs.usgs_site_id = '07065495'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
  is_primary = true,
  level_too_low = 1.5, level_low = 2.0,
  level_optimal_min = 2.5, level_optimal_max = 3.0,
  level_high = 3.5, level_dangerous = 4.0;

-- Set Mountain View (07065200) as secondary
INSERT INTO river_gauges (
  river_id, gauge_station_id, is_primary, threshold_unit,
  level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous
)
SELECT r.id, gs.id, false, 'ft', 1.0, 1.3, 1.5, 3.0, 3.5, 4.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'jacks-fork' AND gs.usgs_site_id = '07065200'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
  is_primary = false,
  level_too_low = 1.0, level_low = 1.3,
  level_optimal_min = 1.5, level_optimal_max = 3.0,
  level_high = 3.5, level_dangerous = 4.0;

-- Set Eminence (07066000) as secondary
INSERT INTO river_gauges (
  river_id, gauge_station_id, is_primary, threshold_unit,
  level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous
)
SELECT r.id, gs.id, false, 'ft', 1.0, 1.5, 2.0, 3.0, 3.5, 4.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'jacks-fork' AND gs.usgs_site_id = '07066000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
  is_primary = false,
  level_too_low = 1.0, level_low = 1.5,
  level_optimal_min = 2.0, level_optimal_max = 3.0,
  level_high = 3.5, level_dangerous = 4.0;

-- Ensure no other gauges are marked primary for Jacks Fork
UPDATE river_gauges rg
SET is_primary = false
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
AND rg.gauge_station_id = gs.id
AND r.slug = 'jacks-fork'
AND gs.usgs_site_id != '07065495'
AND rg.is_primary = true;

-- Verify final state
SELECT
  gs.name as gauge_name,
  gs.usgs_site_id,
  rg.is_primary,
  rg.threshold_unit,
  rg.level_optimal_min,
  rg.level_optimal_max
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE r.slug = 'jacks-fork'
ORDER BY rg.is_primary DESC, gs.usgs_site_id;
