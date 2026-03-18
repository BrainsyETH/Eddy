-- supabase/migrations/00077_fix_niangua_big_piney_courtois_gauge_associations.sql
--
-- Fix Niangua River, Big Piney River, and Courtois Creek gauge associations.
--
-- The proximity-based link-gauges-to-rivers.sql script (10-mile radius)
-- incorrectly associated many unrelated gauges from nearby rivers/tributaries
-- with these rivers. This migration removes all incorrect associations and
-- ensures only the correct USGS gauges are linked.
--
-- Correct gauges for Niangua River:
--   06923250 - Niangua River at Windyville, MO (upper floatable section)
--   06923700 - Niangua River at Bennett Spring, MO (core float section)
--   06923950 - Niangua River at Tunnel Dam near Macks Creek, MO (lower section)
--
-- Correct gauges for Big Piney River:
--   06928900 - Big Piney River near Houston, MO (upper section)
--   06930000 - Big Piney River near Big Piney, MO (lower/Pulaski County section)
--
-- Correct gauges for Courtois Creek:
--   07017200 - Huzzah Creek near Steelville, MO (proxy — Courtois has no active
--              real-time gauge; local paddlers use Huzzah as the two creeks are
--              similar in volume and receive similar precipitation)

-- ============================================
-- STEP 1: Ensure all correct gauge stations exist
-- ============================================

-- Niangua gauges
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06923250',
    'Niangua River at Windyville, MO',
    ST_SetSRID(ST_MakePoint(-92.8693, 37.6694), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06923700',
    'Niangua River at Bennett Spring, MO',
    ST_SetSRID(ST_MakePoint(-92.8544, 37.7167), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06923950',
    'Niangua River at Tunnel Dam near Macks Creek, MO',
    ST_SetSRID(ST_MakePoint(-92.8514, 37.9369), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Big Piney gauges
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06928900',
    'Big Piney River near Houston, MO',
    ST_SetSRID(ST_MakePoint(-91.9971, 37.3231), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- 06930000 already exists from seed, but ensure it's active
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06930000',
    'Big Piney River near Big Piney, MO',
    ST_SetSRID(ST_MakePoint(-92.0347, 37.6789), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Courtois Creek uses the Huzzah gauge (07017200) as proxy
-- (07014100 and 07014200 exist as USGS monitoring locations but have no
-- active real-time gauge height data — they are water-quality-only stations)
-- Ensure Huzzah gauge exists (it should from the Huzzah seed)
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07017200',
    'Huzzah Creek near Steelville, MO',
    ST_SetSRID(ST_MakePoint(-91.3219, 37.9519), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- ============================================
-- STEP 2: Remove ALL incorrect gauge associations
-- ============================================

DO $$
DECLARE
  niangua_id UUID;
  big_piney_id UUID;
  courtois_id UUID;
  niangua_before INTEGER;
  big_piney_before INTEGER;
  courtois_before INTEGER;
BEGIN
  -- Get river IDs
  SELECT id INTO niangua_id FROM rivers WHERE slug = 'niangua' LIMIT 1;
  SELECT id INTO big_piney_id FROM rivers WHERE slug = 'big-piney' LIMIT 1;
  SELECT id INTO courtois_id FROM rivers WHERE slug = 'courtois' LIMIT 1;

  IF niangua_id IS NULL THEN
    RAISE NOTICE 'Niangua River not found, skipping';
    RETURN;
  END IF;

  IF big_piney_id IS NULL THEN
    RAISE NOTICE 'Big Piney River not found, skipping';
    RETURN;
  END IF;

  IF courtois_id IS NULL THEN
    RAISE NOTICE 'Courtois Creek not found, skipping';
    RETURN;
  END IF;

  -- Count current associations
  SELECT COUNT(*) INTO niangua_before FROM river_gauges WHERE river_id = niangua_id;
  SELECT COUNT(*) INTO big_piney_before FROM river_gauges WHERE river_id = big_piney_id;
  SELECT COUNT(*) INTO courtois_before FROM river_gauges WHERE river_id = courtois_id;
  RAISE NOTICE 'Niangua gauge associations before fix: % (should be 3)', niangua_before;
  RAISE NOTICE 'Big Piney gauge associations before fix: % (should be 2)', big_piney_before;
  RAISE NOTICE 'Courtois gauge associations before fix: % (should be 1)', courtois_before;

  -- Delete ALL existing associations for all three rivers
  DELETE FROM river_gauges WHERE river_id = niangua_id;
  DELETE FROM river_gauges WHERE river_id = big_piney_id;
  DELETE FROM river_gauges WHERE river_id = courtois_id;

  -- ============================================
  -- STEP 3: Re-insert correct Niangua gauges
  -- ============================================

  -- Niangua at Windyville (upper section, secondary)
  -- Near Moon Valley Access, upstream of Bennett Spring
  INSERT INTO river_gauges (
    gauge_station_id, river_id, is_primary,
    distance_from_section_miles, threshold_unit,
    level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous
  )
  SELECT gs.id, niangua_id, false, 0.0, 'ft',
    1.5, 2.0, 2.5, 5.0, 7.0, 10.0
  FROM gauge_stations gs WHERE gs.usgs_site_id = '06923250'
  ON CONFLICT (gauge_station_id, river_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  -- Niangua at Bennett Spring (PRIMARY — core float section)
  INSERT INTO river_gauges (
    gauge_station_id, river_id, is_primary,
    distance_from_section_miles, threshold_unit,
    level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous
  )
  SELECT gs.id, niangua_id, true, 0.0, 'ft',
    1.5, 2.0, 2.5, 5.0, 7.0, 10.0
  FROM gauge_stations gs WHERE gs.usgs_site_id = '06923700'
  ON CONFLICT (gauge_station_id, river_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  -- Niangua at Tunnel Dam (lower section, secondary)
  INSERT INTO river_gauges (
    gauge_station_id, river_id, is_primary,
    distance_from_section_miles, threshold_unit,
    level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous
  )
  SELECT gs.id, niangua_id, false, 0.0, 'ft',
    1.5, 2.0, 2.5, 5.0, 7.0, 10.0
  FROM gauge_stations gs WHERE gs.usgs_site_id = '06923950'
  ON CONFLICT (gauge_station_id, river_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  -- ============================================
  -- STEP 4: Re-insert correct Big Piney gauges
  -- ============================================

  -- Big Piney near Houston (upper section, secondary)
  -- Near Baptist Camp and Dogs Bluff access points
  INSERT INTO river_gauges (
    gauge_station_id, river_id, is_primary,
    distance_from_section_miles, threshold_unit,
    level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous
  )
  SELECT gs.id, big_piney_id, false, 0.0, 'ft',
    1.5, 2.0, 2.5, 5.0, 7.0, 10.0
  FROM gauge_stations gs WHERE gs.usgs_site_id = '06928900'
  ON CONFLICT (gauge_station_id, river_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  -- Big Piney near Big Piney (PRIMARY — lower/Pulaski County section)
  -- Near East Gate access, downstream of Fort Leonard Wood
  INSERT INTO river_gauges (
    gauge_station_id, river_id, is_primary,
    distance_from_section_miles, threshold_unit,
    level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous
  )
  SELECT gs.id, big_piney_id, true, 0.0, 'ft',
    1.8, 2.3, 3.0, 5.5, 7.0, 10.0
  FROM gauge_stations gs WHERE gs.usgs_site_id = '06930000'
  ON CONFLICT (gauge_station_id, river_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  -- ============================================
  -- STEP 5: Re-insert correct Courtois Creek gauge
  -- ============================================

  -- Courtois Creek uses the Huzzah gauge (07017200) as proxy
  -- Courtois has no active real-time USGS gauge. The two creeks are in the
  -- same watershed, similar in volume, and receive similar precipitation.
  -- Local paddlers have always used the Huzzah gauge for Courtois conditions.
  INSERT INTO river_gauges (
    gauge_station_id, river_id, is_primary,
    distance_from_section_miles, threshold_unit,
    level_too_low, level_low, level_optimal_min,
    level_optimal_max, level_high, level_dangerous
  )
  SELECT gs.id, courtois_id, true, 5.0, 'ft',
    1.5, 2.0, 2.5, 4.5, 6.0, 8.0
  FROM gauge_stations gs WHERE gs.usgs_site_id = '07017200'
  ON CONFLICT (gauge_station_id, river_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    threshold_unit = EXCLUDED.threshold_unit,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

  RAISE NOTICE 'Fixed: Niangua now has 3 gauges (Windyville, Bennett Spring, Tunnel Dam)';
  RAISE NOTICE 'Fixed: Big Piney now has 2 gauges (Houston, Big Piney)';
  RAISE NOTICE 'Fixed: Courtois now has 1 gauge (Huzzah proxy 07017200)';
END $$;
