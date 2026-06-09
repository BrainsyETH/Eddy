-- File: supabase/migrations/00012_get_point_at_mile.sql
-- Function to get coordinates at a specific mile marker on a river
-- Used by import scripts that have mile data but no coordinates

-- ============================================
-- GET POINT AT MILE MARKER
-- Given a river and mile from headwaters, returns coordinates
-- ============================================
CREATE OR REPLACE FUNCTION get_point_at_mile(
    p_river_id UUID,
    p_mile NUMERIC
) RETURNS TABLE (
    point GEOMETRY(Point, 4326),
    lng DOUBLE PRECISION,
    lat DOUBLE PRECISION
) AS $$
DECLARE
    v_river_geom GEOMETRY;
    v_river_length_miles NUMERIC;
    v_starts_at_headwaters BOOLEAN;
    v_fraction NUMERIC;
    v_point GEOMETRY;
BEGIN
    -- Get river geometry and metadata
    SELECT geom, length_miles, COALESCE(geometry_starts_at_headwaters, TRUE)
    INTO v_river_geom, v_river_length_miles, v_starts_at_headwaters
    FROM rivers WHERE id = p_river_id;

    IF v_river_geom IS NULL THEN
        RAISE EXCEPTION 'River not found: %', p_river_id;
    END IF;

    IF v_river_length_miles IS NULL OR v_river_length_miles <= 0 THEN
        RAISE EXCEPTION 'River has no length data: %', p_river_id;
    END IF;

    -- Convert mile from headwaters to fraction along geometry
    -- If geometry starts at headwaters: fraction = mile / length
    -- If geometry starts at downstream: fraction = 1 - (mile / length)
    v_fraction := p_mile / v_river_length_miles;

    -- Clamp fraction to valid range
    IF v_fraction < 0 THEN
        v_fraction := 0;
    ELSIF v_fraction > 1 THEN
        v_fraction := 1;
    END IF;

    IF NOT v_starts_at_headwaters THEN
        v_fraction := 1 - v_fraction;
    END IF;

    -- Get point at fraction
    v_point := ST_LineInterpolatePoint(v_river_geom, v_fraction);

    RETURN QUERY SELECT
        v_point::GEOMETRY(Point, 4326),
        ST_X(v_point),
        ST_Y(v_point);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_point_at_mile IS 'Returns coordinates at a specific mile from headwaters along a river geometry';

-- ============================================
-- GET POINT AT MILE BY SLUG
-- Convenience function that accepts river slug instead of ID
-- ============================================
CREATE OR REPLACE FUNCTION get_point_at_mile_by_slug(
    p_river_slug TEXT,
    p_mile NUMERIC
) RETURNS TABLE (
    point GEOMETRY(Point, 4326),
    lng DOUBLE PRECISION,
    lat DOUBLE PRECISION
) AS $$
DECLARE
    v_river_id UUID;
BEGIN
    SELECT id INTO v_river_id FROM rivers WHERE slug = p_river_slug;

    IF v_river_id IS NULL THEN
        RAISE EXCEPTION 'River not found with slug: %', p_river_slug;
    END IF;

    RETURN QUERY SELECT * FROM get_point_at_mile(v_river_id, p_mile);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_point_at_mile_by_slug IS 'Returns coordinates at a specific mile from headwaters, looking up river by slug';
