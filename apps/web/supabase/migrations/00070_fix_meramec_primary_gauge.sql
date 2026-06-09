-- Fix Meramec River primary gauge for Eddy report generation.
--
-- Problem: fetchGaugeContext() queries for is_primary = true but no Meramec
-- gauge had this flag set in production, causing "Gauge data unavailable."
--
-- Solution: Set Sullivan (#07018500) as the primary gauge for Meramec River.
-- Sullivan is the most commonly referenced gauge by local outfitters.

-- Clear any existing primary flags for Meramec
UPDATE river_gauges
SET is_primary = false
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

-- Set Sullivan as primary
UPDATE river_gauges
SET is_primary = true
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'meramec')
  AND gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07018500');
