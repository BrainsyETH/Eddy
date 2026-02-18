-- supabase/migrations/00051_fix_huzzah_gauge_associations.sql
--
-- Fix Huzzah Creek gauge associations.
--
-- The proximity-based link-gauges-to-rivers.sql script (10-mile radius)
-- incorrectly associated gauges from nearby Courtois Creek and Meramec River
-- with Huzzah Creek. All three rivers converge near Steelville, so their gauges
-- fell within the proximity threshold.
--
-- This migration removes all incorrect associations and ensures only the correct
-- gauge (07017200 - Huzzah Creek near Steelville) is linked to Huzzah.

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
    RAISE NOTICE 'Huzzah Creek not found, skipping';
    RETURN;
  END IF;

  -- Count current associations for logging
  SELECT COUNT(*) INTO removed_count
  FROM river_gauges WHERE river_id = huzzah_id;
  RAISE NOTICE 'Huzzah gauge associations before fix: % (should be 1)', removed_count;

  -- Remove ALL existing associations for Huzzah Creek
  DELETE FROM river_gauges
  WHERE river_id = huzzah_id;

  -- Find the correct Steelville gauge
  SELECT id INTO steelville_gauge_id FROM gauge_stations
  WHERE usgs_site_id = '07017200';

  IF steelville_gauge_id IS NULL THEN
    RAISE NOTICE 'ERROR: Huzzah Creek gauge (07017200) not found';
    RETURN;
  END IF;

  -- Re-insert the single correct gauge association with calibrated thresholds
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
    true,
    2.0,
    'ft',
    1.5,    -- Too low - scraping constantly
    2.0,    -- Low - some dragging
    2.5,    -- Optimal min - good floating
    4.5,    -- Optimal max - small creek fills fast
    6.0,    -- High - swift for this creek
    8.0     -- Dangerous - flood conditions
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

  RAISE NOTICE 'Fixed: Huzzah Creek now has 1 gauge (07017200 Steelville)';
END $$;
