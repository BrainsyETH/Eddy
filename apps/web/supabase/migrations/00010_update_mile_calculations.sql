-- File: supabase/migrations/00010_update_mile_calculations.sql
-- Update mile calculation functions to use geometry_starts_at_headwaters flag
-- This ensures mile 0.0 = headwaters (as per CSV reference) regardless of geometry direction

-- ============================================
-- UPDATE SNAP TO RIVER FUNCTION
-- Now returns "mile from headwaters" (mile 0.0 = headwaters)
-- ============================================
CREATE OR REPLACE FUNCTION snap_to_river(
    p_point GEOMETRY(Point, 4326),
    p_river_id UUID
) RETURNS TABLE (
    snapped_point GEOMETRY(Point, 4326),
    river_mile NUMERIC(6,2),  -- Mile from headwaters (0.0 = headwaters)
    distance_from_original_meters NUMERIC(8,2)
) AS $$
DECLARE
    v_river_geom GEOMETRY;
    v_river_length_miles NUMERIC;
    v_fraction NUMERIC;
    v_starts_at_headwaters BOOLEAN;
BEGIN
    SELECT geom, length_miles, COALESCE(geometry_starts_at_headwaters, TRUE)
    INTO v_river_geom, v_river_length_miles, v_starts_at_headwaters
    FROM rivers WHERE id = p_river_id;

    IF v_river_geom IS NULL THEN
        RAISE EXCEPTION 'River not found: %', p_river_id;
    END IF;

    v_fraction := ST_LineLocatePoint(v_river_geom, p_point);

    -- Calculate mile from headwaters
    -- If geometry starts at headwaters: mile = fraction * length
    -- If geometry starts at downstream: mile = (1 - fraction) * length
    RETURN QUERY SELECT
        ST_LineInterpolatePoint(v_river_geom, v_fraction)::GEOMETRY(Point, 4326),
        CASE 
            WHEN v_starts_at_headwaters THEN
                (v_fraction * v_river_length_miles)::NUMERIC(6,2)
            ELSE
                ((1 - v_fraction) * v_river_length_miles)::NUMERIC(6,2)
        END,
        ST_Distance(
            p_point::geography,
            ST_LineInterpolatePoint(v_river_geom, v_fraction)::geography
        )::NUMERIC(8,2);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION snap_to_river IS 'Snaps a point to the nearest river geometry and returns mile from headwaters (mile 0.0 = headwaters, increasing downstream)';

-- ============================================
-- UPDATE AUTO-SNAP TRIGGER
-- Now stores mile from headwaters in river_mile_downstream
-- ============================================
CREATE OR REPLACE FUNCTION auto_snap_access_point()
RETURNS TRIGGER AS $$
DECLARE
    snap_result RECORD;
    v_river_length NUMERIC;
BEGIN
    -- Snap to river (returns mile from headwaters)
    SELECT * INTO snap_result
    FROM snap_to_river(NEW.location_orig, NEW.river_id);

    NEW.location_snap := snap_result.snapped_point;
    
    -- Store mile from headwaters in river_mile_downstream
    -- (keeping field name for backward compatibility, but now represents "mile from headwaters")
    NEW.river_mile_downstream := snap_result.river_mile;

    -- Calculate mile from downstream end (for reference)
    SELECT length_miles INTO v_river_length
    FROM rivers WHERE id = NEW.river_id;
    
    NEW.river_mile_upstream := v_river_length - snap_result.river_mile;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- UPDATE GET FLOAT SEGMENT
-- Now uses mile from headwaters for calculations
-- ============================================
CREATE OR REPLACE FUNCTION get_float_segment(
    p_start_access_id UUID,
    p_end_access_id UUID
) RETURNS TABLE (
    segment_geom GEOMETRY(LineString, 4326),
    distance_miles NUMERIC(5,2),
    start_name TEXT,
    end_name TEXT,
    start_river_mile NUMERIC(6,2),  -- Mile from headwaters
    end_river_mile NUMERIC(6,2)     -- Mile from headwaters
) AS $$
DECLARE
    v_river_id UUID;
    v_river_geom GEOMETRY;
    v_start_mile NUMERIC;  -- Mile from headwaters
    v_end_mile NUMERIC;    -- Mile from headwaters
    v_start_name TEXT;
    v_end_name TEXT;
    v_river_length NUMERIC;
    v_start_fraction NUMERIC;
    v_end_fraction NUMERIC;
    v_end_river_id UUID;
    v_starts_at_headwaters BOOLEAN;
BEGIN
    -- Get start access point details (river_mile_downstream now = mile from headwaters)
    SELECT ap.river_id, ap.river_mile_downstream, ap.name, r.geom, r.length_miles, 
           COALESCE(r.geometry_starts_at_headwaters, TRUE)
    INTO v_river_id, v_start_mile, v_start_name, v_river_geom, v_river_length, v_starts_at_headwaters
    FROM access_points ap
    JOIN rivers r ON r.id = ap.river_id
    WHERE ap.id = p_start_access_id;

    IF v_river_id IS NULL THEN
        RAISE EXCEPTION 'Start access point not found: %', p_start_access_id;
    END IF;

    -- Get end access point details
    SELECT river_id, river_mile_downstream, name
    INTO v_end_river_id, v_end_mile, v_end_name
    FROM access_points WHERE id = p_end_access_id;

    IF v_end_river_id IS NULL THEN
        RAISE EXCEPTION 'End access point not found: %', p_end_access_id;
    END IF;

    IF v_river_id != v_end_river_id THEN
        RAISE EXCEPTION 'Access points must be on the same river';
    END IF;

    -- Convert miles from headwaters to fractions along geometry
    -- If geometry starts at headwaters: fraction = mile / length
    -- If geometry starts at downstream: fraction = 1 - (mile / length)
    IF v_starts_at_headwaters THEN
        v_start_fraction := v_start_mile / v_river_length;
        v_end_fraction := v_end_mile / v_river_length;
    ELSE
        v_start_fraction := 1 - (v_start_mile / v_river_length);
        v_end_fraction := 1 - (v_end_mile / v_river_length);
    END IF;

    -- Return segment (always order fractions correctly for ST_LineSubstring)
    -- Put-in should be upstream (lower mile from headwaters), take-out downstream (higher mile)
    IF v_start_fraction < v_end_fraction THEN
        -- Normal case: put-in upstream, take-out downstream
        RETURN QUERY SELECT
            ST_LineSubstring(v_river_geom, v_start_fraction, v_end_fraction)::GEOMETRY(LineString, 4326),
            ABS(v_end_mile - v_start_mile)::NUMERIC(5,2),
            v_start_name,
            v_end_name,
            v_start_mile,
            v_end_mile;
    ELSE
        -- Reversed: put-in downstream, take-out upstream (unusual but handle it)
        RETURN QUERY SELECT
            ST_LineSubstring(v_river_geom, v_end_fraction, v_start_fraction)::GEOMETRY(LineString, 4326),
            ABS(v_start_mile - v_end_mile)::NUMERIC(5,2),
            v_start_name,
            v_end_name,
            v_start_mile,
            v_end_mile;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_float_segment IS 'Returns float segment geometry and distance. Uses mile from headwaters (mile 0.0 = headwaters, increasing downstream)';

-- ============================================
-- FUNCTION TO CORRECT ACCESS POINT MILES FROM REFERENCE
-- Matches access points to nearest mile marker and corrects if within tolerance
-- ============================================
CREATE OR REPLACE FUNCTION correct_all_access_point_miles(
    p_river_id UUID DEFAULT NULL,
    p_tolerance_miles NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
    access_point_id UUID,
    access_point_name TEXT,
    old_mile NUMERIC,
    new_mile NUMERIC,
    corrected BOOLEAN
) AS $$
DECLARE
    v_access_point RECORD;
    v_nearest_marker RECORD;
BEGIN
    -- Loop through access points (for specified river or all)
    FOR v_access_point IN
        SELECT ap.id, ap.name, ap.river_id, ap.river_mile_downstream
        FROM access_points ap
        WHERE (p_river_id IS NULL OR ap.river_id = p_river_id)
          AND ap.approved = TRUE
    LOOP
        -- Find nearest mile marker
        SELECT * INTO v_nearest_marker
        FROM get_nearest_mile_marker(v_access_point.river_id, v_access_point.river_mile_downstream);

        -- If within tolerance, update
        IF v_nearest_marker.distance <= p_tolerance_miles THEN
            UPDATE access_points
            SET river_mile_downstream = v_nearest_marker.mile,
                river_mile_upstream = (
                    SELECT length_miles - v_nearest_marker.mile
                    FROM rivers
                    WHERE id = v_access_point.river_id
                )
            WHERE id = v_access_point.id;

            RETURN QUERY SELECT
                v_access_point.id,
                v_access_point.name::TEXT,
                v_access_point.river_mile_downstream,
                v_nearest_marker.mile,
                TRUE::BOOLEAN;
        ELSE
            RETURN QUERY SELECT
                v_access_point.id,
                v_access_point.name::TEXT,
                v_access_point.river_mile_downstream,
                v_access_point.river_mile_downstream,
                FALSE::BOOLEAN;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION correct_all_access_point_miles IS 'Batch corrects access point miles to match nearest authoritative mile marker if within tolerance';
