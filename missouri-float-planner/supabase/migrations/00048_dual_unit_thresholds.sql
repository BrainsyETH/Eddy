-- supabase/migrations/00048_dual_unit_thresholds.sql
-- Add alternate-unit threshold columns to river_gauges
--
-- Each gauge already has thresholds in one unit (threshold_unit = 'ft' or 'cfs').
-- These new columns store thresholds in the OTHER unit so the UI can toggle
-- between gauge height (ft) and discharge (cfs) views.
--
-- Convention:
--   threshold_unit = 'ft'  → level_* are in ft,  alt_level_* are in cfs
--   threshold_unit = 'cfs' → level_* are in cfs, alt_level_* are in ft

-- Drop and recreate the GeoJSON function to avoid return-type conflicts
DROP FUNCTION IF EXISTS get_gauge_stations_with_geojson();

CREATE OR REPLACE FUNCTION get_gauge_stations_with_geojson()
RETURNS TABLE (
    id UUID,
    usgs_site_id TEXT,
    name TEXT,
    location JSONB,
    active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gs.id,
        gs.usgs_site_id,
        gs.name,
        ST_AsGeoJSON(gs.location)::jsonb as location,
        gs.active
    FROM gauge_stations gs
    WHERE gs.active = TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE river_gauges
  ADD COLUMN IF NOT EXISTS alt_level_too_low    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_low        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_optimal_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_optimal_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_high       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alt_level_dangerous  NUMERIC(10,2);

COMMENT ON COLUMN river_gauges.alt_level_too_low IS 'Too-low threshold in the alternate unit (opposite of threshold_unit)';
COMMENT ON COLUMN river_gauges.alt_level_low IS 'Low threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_optimal_min IS 'Optimal-min threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_optimal_max IS 'Optimal-max threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_high IS 'High threshold in the alternate unit';
COMMENT ON COLUMN river_gauges.alt_level_dangerous IS 'Dangerous threshold in the alternate unit';
