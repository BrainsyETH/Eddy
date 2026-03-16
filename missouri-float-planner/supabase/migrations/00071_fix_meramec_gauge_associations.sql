-- Fix Meramec River gauge associations, naming, and thresholds
--
-- Problems:
-- 1. Proximity script (10-mile radius) incorrectly linked tributary gauges
--    (Huzzah, Big River, Courtois, Joachim) to Meramec River
-- 2. Two Sullivan gauges (07014500 and 07018500) have identical names
-- 3. Three Meramec gauges (Cook Station, Steelville, Sullivan 07014500)
--    have no threshold values set

-- ============================================
-- A. Remove 5 tributary gauge associations
-- ============================================
-- These gauges belong to other rivers and were incorrectly linked
-- to Meramec by the proximity-based link-gauges-to-rivers.sql script.
-- Same issue that was fixed for Huzzah in migration 00051.

DELETE FROM river_gauges
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id IN (
    SELECT id FROM gauge_stations
    WHERE usgs_site_id IN (
      '07014000',  -- Huzzah Creek near Steelville
      '07018100',  -- Big River near Richwoods
      '07019500',  -- Joachim Creek at De Soto
      '07017610',  -- Courtois Creek at Berryman
      '07014200'   -- Courtois Creek at Berryman (alternate)
    )
  );

-- ============================================
-- B. Rename the two Sullivan gauges
-- ============================================
-- Both 07014500 and 07018500 are officially "Meramec River near Sullivan, MO"
-- but are at different points on the river. Add Upper/Lower to distinguish.
-- 07018500 is further upstream (smaller drainage area)
-- 07014500 is further downstream (1,475 sq mi drainage area)

UPDATE gauge_stations
SET name = 'Meramec River near Sullivan (Upper), MO'
WHERE usgs_site_id = '07018500';

UPDATE gauge_stations
SET name = 'Meramec River near Sullivan (Lower), MO'
WHERE usgs_site_id = '07014500';

-- ============================================
-- C. Set thresholds for 3 gauges missing them
-- ============================================
-- These gauges were linked by the proximity script but had no thresholds,
-- causing them to always show "Too Low" or "Unknown" condition.
-- Thresholds scaled by drainage area relative to existing Sullivan/Eureka values.

-- Cook Station (07010350, 199 sq mi — furthest upstream, smallest)
UPDATE river_gauges
SET
    threshold_unit = 'ft',
    level_too_low = 1.0,
    level_low = 1.5,
    level_optimal_min = 2.0,
    level_optimal_max = 4.0,
    level_high = 5.5,
    level_dangerous = 8.0
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07010350');

-- Steelville (07013000, 781 sq mi — upper-mid section)
UPDATE river_gauges
SET
    threshold_unit = 'ft',
    level_too_low = 1.2,
    level_low = 1.8,
    level_optimal_min = 2.5,
    level_optimal_max = 4.5,
    level_high = 6.5,
    level_dangerous = 9.0
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07013000');

-- Sullivan Lower (07014500, 1,475 sq mi — lower-mid section)
UPDATE river_gauges
SET
    threshold_unit = 'ft',
    level_too_low = 2.0,
    level_low = 3.0,
    level_optimal_min = 4.0,
    level_optimal_max = 7.0,
    level_high = 9.0,
    level_dangerous = 12.0
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07014500');
