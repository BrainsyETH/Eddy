-- File: supabase/migrations/00009_mile_marker_corrections.sql
-- Mile Marker Corrections and Helper Functions
-- Uses the authoritative mile_markers reference to validate and correct access point miles

-- Add flag to rivers table to indicate if geometry starts at headwaters
ALTER TABLE rivers ADD COLUMN IF NOT EXISTS geometry_starts_at_headwaters BOOLEAN DEFAULT TRUE;

-- Update known rivers based on CSV data
-- Current River, Eleven Point River, and Jacks Fork all start at headwaters (mile 0.0)
UPDATE rivers 
SET geometry_starts_at_headwaters = TRUE
WHERE slug IN ('current-river', 'eleven-point-river', 'jacks-fork-river');

COMMENT ON COLUMN rivers.geometry_starts_at_headwaters IS 'If TRUE, river geometry starts at headwaters (mile 0.0). If FALSE, geometry starts at mouth/confluence and miles increase upstream.';

-- Function to get nearest mile marker for validation
CREATE OR REPLACE FUNCTION get_nearest_mile_marker(
    p_river_id UUID,
    p_mile NUMERIC
)
RETURNS TABLE (
    mile NUMERIC,
    name TEXT,
    description TEXT,
    distance NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rmm.mile,
        rmm.name,
        rmm.description,
        ABS(rmm.mile - p_mile) as distance
    FROM river_mile_markers rmm
    WHERE rmm.river_id = p_river_id
    ORDER BY ABS(rmm.mile - p_mile) ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_nearest_mile_marker IS 'Returns the nearest mile marker from the authoritative reference for validation/correction purposes';

-- Function to correct access point mile using nearest mile marker
-- This can be used to batch-update access points that are close to known mile markers
CREATE OR REPLACE FUNCTION correct_access_point_mile_from_markers(
    p_access_point_id UUID,
    p_tolerance_miles NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
    old_mile NUMERIC,
    new_mile NUMERIC,
    corrected BOOLEAN
) AS $$
DECLARE
    v_river_id UUID;
    v_current_mile NUMERIC;
    v_nearest_marker RECORD;
BEGIN
    -- Get access point details
    SELECT ap.river_id, ap.river_mile_downstream
    INTO v_river_id, v_current_mile
    FROM access_points ap
    WHERE ap.id = p_access_point_id;

    IF v_river_id IS NULL THEN
        RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, FALSE::BOOLEAN;
        RETURN;
    END IF;

    -- Find nearest mile marker
    SELECT * INTO v_nearest_marker
    FROM get_nearest_mile_marker(v_river_id, v_current_mile);

    -- If within tolerance, update the access point
    IF v_nearest_marker.distance <= p_tolerance_miles THEN
        UPDATE access_points
        SET river_mile_downstream = v_nearest_marker.mile,
            river_mile_upstream = (
                SELECT length_miles - v_nearest_marker.mile
                FROM rivers
                WHERE id = v_river_id
            )
        WHERE id = p_access_point_id;

        RETURN QUERY SELECT v_current_mile, v_nearest_marker.mile, TRUE::BOOLEAN;
    ELSE
        RETURN QUERY SELECT v_current_mile, v_current_mile, FALSE::BOOLEAN;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION correct_access_point_mile_from_markers IS 'Corrects an access point mile marker to match the nearest authoritative mile marker if within tolerance';
