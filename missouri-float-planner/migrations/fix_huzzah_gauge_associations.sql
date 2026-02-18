-- Migration: Fix Huzzah Creek gauge associations
--
-- Problem: The proximity-based link-gauges-to-rivers.sql script (10-mile radius)
-- incorrectly associated gauges from nearby rivers (Courtois Creek, Meramec River)
-- with Huzzah Creek. Huzzah, Courtois, and the Meramec all converge near Steelville,
-- so gauges from all three rivers fell within the 10-mile proximity threshold.
--
-- Correct Huzzah Creek USGS Gauge:
-- - 07017200 - Huzzah Creek near Steelville, MO (Primary, only gauge)
--
-- Gauges that should NOT be on Huzzah:
-- - 07017610 - Courtois Creek at Berryman, MO (belongs to Courtois)
-- - 07018500 - Meramec River near Sullivan, MO (belongs to Meramec)
-- - 07019000 - Meramec River near Eureka, MO (belongs to Meramec)
-- - Any other gauge not specifically for Huzzah Creek
--
-- Thresholds (from migration 00009, local knowledge):
-- Huzzah is a smaller creek, very dependent on rainfall.
-- Needs recent rain to be floatable.
-- - Too Low: < 1.5 ft - scraping constantly
-- - Low: 1.5-2.0 ft - some dragging
-- - Optimal: 2.5-4.5 ft - good floating (small creek fills fast)
-- - High: 6.0 ft - swift for this creek
-- - Dangerous: 8.0 ft - flood conditions

DO $$
DECLARE
  huzzah_id UUID;
  steelville_gauge_id UUID;
  removed_count INTEGER;
BEGIN
  -- Get Huzzah Creek river ID
  SELECT id INTO huzzah_id FROM rivers
  WHERE slug = 'huzzah'
  LIMIT 1;

  IF huzzah_id IS NULL THEN
    RAISE NOTICE 'Huzzah Creek not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Huzzah Creek river ID: %', huzzah_id;

  -- Step 1: Count current associations for diagnosis
  SELECT COUNT(*) INTO removed_count
  FROM river_gauges WHERE river_id = huzzah_id;
  RAISE NOTICE 'Current Huzzah gauge associations: % (should be 1)', removed_count;

  -- Step 2: Remove ALL existing associations for Huzzah Creek
  -- We'll rebuild with only the correct gauge
  DELETE FROM river_gauges
  WHERE river_id = huzzah_id;

  RAISE NOTICE 'Removed all existing Huzzah gauge associations';

  -- Step 3: Find the Steelville gauge
  SELECT id INTO steelville_gauge_id FROM gauge_stations
  WHERE usgs_site_id = '07017200';

  IF steelville_gauge_id IS NULL THEN
    RAISE NOTICE 'ERROR: Huzzah Creek gauge (07017200) not found in gauge_stations table';
    RETURN;
  END IF;

  RAISE NOTICE 'Steelville gauge ID: %', steelville_gauge_id;

  -- Step 4: Add the correct Steelville gauge association with proper thresholds
  INSERT INTO river_gauges (
    gauge_station_id,
    river_id,
    is_primary,
    distance_from_section_miles,
    threshold_unit,
    level_too_low,
    level_low,
    level_optimal_min,
    level_optimal_max,
    level_high,
    level_dangerous
  ) VALUES (
    steelville_gauge_id,
    huzzah_id,
    true,           -- Primary gauge (only gauge for Huzzah Creek)
    2.0,            -- Distance from float section
    'ft',           -- Gauge height in feet
    1.5,            -- Too low - scraping constantly
    2.0,            -- Low - some dragging
    2.5,            -- Optimal min - good floating begins
    4.5,            -- Optimal max - small creek fills fast
    6.0,            -- High - swift for this creek
    8.0             -- Dangerous - flood conditions
  )
  ON CONFLICT (gauge_station_id, river_id)
  DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Added Steelville gauge (07017200) as primary for Huzzah Creek';

  -- Step 5: Also clean up any Huzzah associations on other rivers' gauges
  -- (in case the proximity script linked Huzzah gauge to nearby rivers too)
  DELETE FROM river_gauges
  WHERE gauge_station_id = steelville_gauge_id
    AND river_id != huzzah_id;

  RAISE NOTICE 'Cleaned up any Huzzah gauge incorrectly linked to other rivers';

END $$;

-- Verify the fix: Show all Huzzah Creek associations (should be exactly 1)
SELECT
  gs.name as gauge_name,
  gs.usgs_site_id,
  r.name as river_name,
  rg.is_primary,
  rg.threshold_unit,
  rg.level_too_low,
  rg.level_low,
  rg.level_optimal_min,
  rg.level_optimal_max,
  rg.level_high,
  rg.level_dangerous
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE r.slug = 'huzzah'
ORDER BY rg.is_primary DESC, gs.name;
