-- File: supabase/migrations/00142_get_float_segment_snap_fractions.sql
--
-- Fix (audit F5): the float route polyline was sliced using `river_mile / length_miles`
-- as the line fraction. That is wrong for two reasons:
--   1. `length_miles` drifts from the true channel length (ST_Length(geom)) — e.g.
--      Meramec stores 108.5 mi against a 169-mi geometry — so the fraction overshoots.
--   2. Guide mile 0 is not geometry vertex 0 (the geometry usually starts at the
--      headwaters, above the first access point), so even a correct length can't map
--      a hand-entered mile to the right fraction.
--
-- Both problems vanish if we locate each access point on the channel directly with
-- ST_LineLocatePoint(geom, location_snap). The reported distance is UNCHANGED — it
-- stays ABS(end_mile - start_mile) from the hand-entered guide miles — so the headline
-- number does not move; only the drawn polyline (and its endpoints) become accurate.
-- We fall back to the old mile/length method only if an access point has no snapped
-- point at all.

CREATE OR REPLACE FUNCTION get_float_segment(
    p_start_access_id UUID,
    p_end_access_id UUID
) RETURNS TABLE (
    segment_geom GEOMETRY(LineString, 4326),
    distance_miles NUMERIC(5,2),
    start_name TEXT,
    end_name TEXT,
    start_river_mile NUMERIC(6,2),  -- Mile from headwaters (hand-entered)
    end_river_mile NUMERIC(6,2)     -- Mile from headwaters (hand-entered)
) AS $$
DECLARE
    v_river_id UUID;
    v_river_geom GEOMETRY;
    v_river_length NUMERIC;
    v_start_mile NUMERIC;
    v_end_mile NUMERIC;
    v_start_name TEXT;
    v_end_name TEXT;
    v_start_pt GEOMETRY;
    v_end_pt GEOMETRY;
    v_start_fraction NUMERIC;
    v_end_fraction NUMERIC;
    v_end_river_id UUID;
    v_starts_at_headwaters BOOLEAN;
BEGIN
    SELECT ap.river_id, ap.river_mile_downstream, ap.name,
           COALESCE(ap.location_snap, ap.location_orig),
           r.geom, r.length_miles, COALESCE(r.geometry_starts_at_headwaters, TRUE)
    INTO v_river_id, v_start_mile, v_start_name, v_start_pt,
         v_river_geom, v_river_length, v_starts_at_headwaters
    FROM access_points ap
    JOIN rivers r ON r.id = ap.river_id
    WHERE ap.id = p_start_access_id;

    IF v_river_id IS NULL THEN
        RAISE EXCEPTION 'Start access point not found: %', p_start_access_id;
    END IF;

    SELECT river_id, river_mile_downstream, name,
           COALESCE(location_snap, location_orig)
    INTO v_end_river_id, v_end_mile, v_end_name, v_end_pt
    FROM access_points WHERE id = p_end_access_id;

    IF v_end_river_id IS NULL THEN
        RAISE EXCEPTION 'End access point not found: %', p_end_access_id;
    END IF;

    IF v_river_id != v_end_river_id THEN
        RAISE EXCEPTION 'Access points must be on the same river';
    END IF;

    -- Preferred: fraction from the access point's actual position on the channel.
    IF v_start_pt IS NOT NULL THEN
        v_start_fraction := ST_LineLocatePoint(v_river_geom, v_start_pt);
    ELSIF v_starts_at_headwaters THEN
        v_start_fraction := v_start_mile / NULLIF(v_river_length, 0);
    ELSE
        v_start_fraction := 1 - (v_start_mile / NULLIF(v_river_length, 0));
    END IF;

    IF v_end_pt IS NOT NULL THEN
        v_end_fraction := ST_LineLocatePoint(v_river_geom, v_end_pt);
    ELSIF v_starts_at_headwaters THEN
        v_end_fraction := v_end_mile / NULLIF(v_river_length, 0);
    ELSE
        v_end_fraction := 1 - (v_end_mile / NULLIF(v_river_length, 0));
    END IF;

    -- ST_LineSubstring requires the smaller fraction first. Distance is unchanged:
    -- the absolute difference of the hand-entered miles.
    IF v_start_fraction <= v_end_fraction THEN
        RETURN QUERY SELECT
            ST_LineSubstring(v_river_geom, v_start_fraction, v_end_fraction)::GEOMETRY(LineString, 4326),
            ABS(v_end_mile - v_start_mile)::NUMERIC(5,2),
            v_start_name, v_end_name, v_start_mile, v_end_mile;
    ELSE
        RETURN QUERY SELECT
            ST_LineSubstring(v_river_geom, v_end_fraction, v_start_fraction)::GEOMETRY(LineString, 4326),
            ABS(v_start_mile - v_end_mile)::NUMERIC(5,2),
            v_start_name, v_end_name, v_start_mile, v_end_mile;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_float_segment IS 'Returns float segment geometry and distance. Slices the channel by each access point''s snapped position (ST_LineLocatePoint), not mile/length_miles, so the polyline is accurate even when length_miles drifts from the true geometry length. Distance = |end_mile - start_mile| from hand-entered miles (unchanged).';
