-- Migration: Fix Akers gauge river_mile for proper gauge selection
--
-- Problem: Akers Ferry access point is at river mile 16.7, but the Akers gauge
-- was set to river mile 17.0. Since gauge selection uses "gauge_mile <= put_in_mile",
-- the Akers gauge wasn't being selected for floats starting at Akers Ferry.
--
-- Solution: Set Akers gauge to mile 16.5 so it covers Akers Ferry and upstream access points.
-- This makes it the selected gauge for:
-- - Akers Ferry (mile 16.7)
-- - Welch Spring (mile 14.2)
-- - Cedargrove (mile 9.0)
-- - Baptist Camp (mile 2.1) - though this might use Montauk gauge

UPDATE river_gauges rg
SET river_mile = 16.5
FROM gauge_stations gs
WHERE rg.gauge_station_id = gs.id
  AND gs.usgs_site_id = '07064533';  -- Akers gauge

-- Add comment explaining the rationale
COMMENT ON COLUMN river_gauges.river_mile IS 'River mile position of gauge. Used for segment-aware selection: finds gauge with largest river_mile <= put_in_mile. Set gauge miles slightly upstream of access points they should cover.';
