-- File: supabase/migrations/00048_update_gauge_geojson_rpc.sql
-- Update RPC to include threshold_descriptions and notes columns
-- (added in migration 00033 but the RPC was never updated)

-- Must drop first because return type is changing (adding new OUT columns)
DROP FUNCTION IF EXISTS get_gauge_stations_with_geojson();

CREATE OR REPLACE FUNCTION get_gauge_stations_with_geojson()
RETURNS TABLE (
    id UUID,
    usgs_site_id TEXT,
    name TEXT,
    location JSONB,
    active BOOLEAN,
    threshold_descriptions JSONB,
    notes TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gs.id,
        gs.usgs_site_id,
        gs.name,
        ST_AsGeoJSON(gs.location)::jsonb as location,
        gs.active,
        gs.threshold_descriptions,
        gs.notes
    FROM gauge_stations gs
    WHERE gs.active = TRUE;
END;
$$ LANGUAGE plpgsql STABLE;
