-- Migration: Fix Jacks Fork River gauge associations
-- This migration removes incorrect Current River gauge associations from Jacks Fork
-- and ensures only actual Jacks Fork gauges are associated.
--
-- Problem: Current River gauges were incorrectly linked to Jacks Fork River
--
-- Correct Jacks Fork USGS Gauges (from USGS data):
-- - 07065200 - Jacks Fork near Mountain View (upper)
-- - 07065495 - Jacks Fork at Alley Spring (middle)
-- - 07066000 - Jacks Fork at Eminence (lower)
--
-- Current River gauges that should NOT be associated with Jacks Fork:
-- - 07067000 - Current River at Van Buren
-- - 07064533 - Current River above Akers
-- - 07066510 - Current River above Powder Mill
-- - 07064440 - Current River at Montauk State Park

DO $$
DECLARE
  jacks_fork_id UUID;
  current_river_id UUID;
BEGIN
  -- Get Jacks Fork River ID
  SELECT id INTO jacks_fork_id FROM rivers
  WHERE slug = 'jacks-fork-river' OR name ILIKE '%jacks fork%'
  LIMIT 1;

  -- Get Current River ID
  SELECT id INTO current_river_id FROM rivers
  WHERE slug = 'current-river' OR name ILIKE 'current river'
  LIMIT 1;

  IF jacks_fork_id IS NULL THEN
    RAISE NOTICE 'Jacks Fork River not found';
    RETURN;
  END IF;

  IF current_river_id IS NULL THEN
    RAISE NOTICE 'Current River not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Jacks Fork River ID: %', jacks_fork_id;
  RAISE NOTICE 'Current River ID: %', current_river_id;

  -- Step 1: Remove incorrect Current River gauge associations from Jacks Fork
  -- These gauges should only be associated with Current River, not Jacks Fork
  DELETE FROM river_gauges
  WHERE river_id = jacks_fork_id
  AND gauge_station_id IN (
    SELECT id FROM gauge_stations
    WHERE usgs_site_id IN ('07067000', '07064533', '07066510', '07064440')
  );

  RAISE NOTICE 'Removed incorrect Current River gauge associations from Jacks Fork';

  -- Step 2: Ensure correct Jacks Fork gauges are associated with Jacks Fork River
  -- Jacks Fork near Mountain View (07065200) - Upper gauge
  INSERT INTO river_gauges (
    gauge_station_id,
    river_id,
    is_primary,
    level_too_low,
    level_low,
    level_optimal_min,
    level_optimal_max,
    level_high,
    level_dangerous
  )
  SELECT
    gs.id,
    jacks_fork_id,
    false,  -- Not primary
    1.0,    -- Too low
    1.3,    -- Low
    1.5,    -- Optimal min
    3.5,    -- Optimal max
    4.0,    -- High
    5.0     -- Dangerous
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07065200'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Jacks Fork near Mountain View (07065200)';

  -- Jacks Fork at Alley Spring (07065495) - Middle gauge, PRIMARY
  INSERT INTO river_gauges (
    gauge_station_id,
    river_id,
    is_primary,
    level_too_low,
    level_low,
    level_optimal_min,
    level_optimal_max,
    level_high,
    level_dangerous
  )
  SELECT
    gs.id,
    jacks_fork_id,
    true,   -- Primary gauge
    1.5,    -- Too low - below this, very difficult
    2.0,    -- Low - will drag with gear
    2.5,    -- Optimal min - good conditions start
    3.5,    -- Optimal max
    3.65,   -- High - flood level begins
    4.0     -- Dangerous - parks close the river
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07065495'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Jacks Fork at Alley Spring (07065495) as PRIMARY';

  -- Jacks Fork at Eminence (07066000) - Lower gauge
  INSERT INTO river_gauges (
    gauge_station_id,
    river_id,
    is_primary,
    level_too_low,
    level_low,
    level_optimal_min,
    level_optimal_max,
    level_high,
    level_dangerous
  )
  SELECT
    gs.id,
    jacks_fork_id,
    false,  -- Not primary
    1.0,    -- Too low
    1.5,    -- Low - average level, may drag loaded
    2.0,    -- Optimal min
    3.5,    -- Optimal max
    4.0,    -- High - river closes
    5.3     -- Dangerous - flood level
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07066000'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Jacks Fork at Eminence (07066000)';

END $$;

-- Verify the fix: Show only Jacks Fork associations
SELECT
  gs.name as gauge_name,
  gs.usgs_site_id,
  r.name as river_name,
  rg.is_primary,
  rg.level_too_low,
  rg.level_low,
  rg.level_optimal_min as level_optimal,
  rg.level_optimal_max,
  rg.level_high,
  rg.level_dangerous
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE r.name ILIKE '%jacks fork%'
ORDER BY rg.is_primary DESC, gs.name;
