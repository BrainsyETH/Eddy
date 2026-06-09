-- File: supabase/migrations/00008_gauge_geojson_function.sql
-- Function to get gauge stations with location as GeoJSON

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
