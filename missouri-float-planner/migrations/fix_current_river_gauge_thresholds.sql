-- Migration: Set cautious thresholds for Current River gauges
--
-- Current River USGS Gauges:
-- - 07064440 - Current River at Montauk State Park (mile 0, average ~1.8 ft)
-- - 07064533 - Current River above Akers (mile 16, average ~1.5 ft)
-- - 07066510 - Current River above Powder Mill (middle river)
-- - 07067000 - Current River at Van Buren (mile 86, average ~3.4 ft)
--
-- Local Knowledge Thresholds (CAUTIOUS - safety first):
-- Akers: River closes at 4.0 ft flood stage
-- Van Buren: Flood level 5.0 ft, flood stage 20 ft
-- General: Float when under 4.0-4.5 ft depending on section

DO $$
DECLARE
  current_river_id UUID;
BEGIN
  -- Get Current River ID
  SELECT id INTO current_river_id FROM rivers
  WHERE slug = 'current-river' OR name ILIKE 'current river'
  LIMIT 1;

  IF current_river_id IS NULL THEN
    RAISE NOTICE 'Current River not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Current River ID: %', current_river_id;

  -- Montauk State Park (07064440) - Upper river, mile 0
  -- Average ~1.8 ft, spring-fed headwaters
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
    current_river_id,
    false,  -- Not primary
    1.0,    -- Too low - very shallow
    1.3,    -- Low - may scrape
    1.5,    -- Optimal min
    2.5,    -- Optimal max
    3.0,    -- High - suggest another day
    4.0     -- Dangerous - river likely closed
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07064440'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Montauk gauge (07064440)';

  -- Akers (07064533) - Upper/Middle river, mile 16, PRIMARY
  -- Average ~1.5 ft, river closes at 4.0 ft
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
    current_river_id,
    true,   -- Primary gauge for Current River
    1.0,    -- Too low - scraping in riffles
    1.5,    -- Low - dragging likely
    2.0,    -- Optimal min - good to go
    3.0,    -- Optimal max - more cautious
    3.5,    -- High - suggest another day
    4.0     -- Dangerous - river closes at flood stage
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07064533'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Akers gauge (07064533) as PRIMARY';

  -- Powder Mill (07066510) - Middle river
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
    current_river_id,
    false,  -- Not primary
    1.2,    -- Too low
    1.5,    -- Low
    2.0,    -- Optimal min
    3.5,    -- Optimal max
    4.0,    -- High - suggest another day
    4.5     -- Dangerous
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07066510'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Powder Mill gauge (07066510)';

  -- Van Buren (07067000) - Lower river, mile 86
  -- Average ~3.4 ft, flood level 5.0 ft
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
    current_river_id,
    false,  -- Not primary
    2.0,    -- Too low
    2.5,    -- Low
    3.0,    -- Optimal min
    4.0,    -- Optimal max - more cautious
    4.5,    -- High - suggest another day
    5.0     -- Dangerous - flood level
  FROM gauge_stations gs
  WHERE gs.usgs_site_id = '07067000'
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Updated Van Buren gauge (07067000)';

END $$;

-- Verify the fix: Show Current River associations
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
WHERE r.name ILIKE '%current%'
ORDER BY rg.is_primary DESC, gs.name;
