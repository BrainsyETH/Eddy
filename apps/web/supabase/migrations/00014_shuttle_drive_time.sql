-- File: supabase/migrations/00014_shuttle_drive_time.sql
-- Add shuttle drive time/distance to float_segments
-- Values are manually entered by admin from Google Maps

-- Add shuttle fields to float_segments
ALTER TABLE float_segments
ADD COLUMN IF NOT EXISTS shuttle_time_minutes INT,
ADD COLUMN IF NOT EXISTS shuttle_distance_miles NUMERIC(5,1);

-- Comment
COMMENT ON COLUMN float_segments.shuttle_time_minutes IS 'Drive time for shuttle (from Google Maps)';
COMMENT ON COLUMN float_segments.shuttle_distance_miles IS 'Drive distance for shuttle (from Google Maps)';

-- Update the get_segment_float_time function to include shuttle info
CREATE OR REPLACE FUNCTION get_segment_float_time(
    p_put_in_id UUID,
    p_take_out_id UUID,
    p_vessel_type TEXT DEFAULT 'canoe'
)
RETURNS TABLE (
    distance_miles NUMERIC,
    time_min_minutes INT,
    time_max_minutes INT,
    time_avg_minutes INT,
    trip_type TEXT,
    source TEXT,
    is_reverse BOOLEAN,
    shuttle_time_minutes INT,
    shuttle_distance_miles NUMERIC
) AS $$
DECLARE
    v_segment RECORD;
BEGIN
    -- Try to find exact segment match
    SELECT * INTO v_segment
    FROM float_segments fs
    WHERE fs.put_in_id = p_put_in_id AND fs.take_out_id = p_take_out_id
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT
            v_segment.distance_miles,
            CASE p_vessel_type
                WHEN 'canoe' THEN v_segment.canoe_time_min
                WHEN 'kayak' THEN v_segment.canoe_time_min
                WHEN 'raft' THEN v_segment.raft_time_min
                WHEN 'tube' THEN v_segment.tube_time_min
                ELSE v_segment.canoe_time_min
            END,
            CASE p_vessel_type
                WHEN 'canoe' THEN v_segment.canoe_time_max
                WHEN 'kayak' THEN v_segment.canoe_time_max
                WHEN 'raft' THEN v_segment.raft_time_max
                WHEN 'tube' THEN v_segment.tube_time_max
                ELSE v_segment.canoe_time_max
            END,
            CASE p_vessel_type
                WHEN 'canoe' THEN (v_segment.canoe_time_min + v_segment.canoe_time_max) / 2
                WHEN 'kayak' THEN (v_segment.canoe_time_min + v_segment.canoe_time_max) / 2
                WHEN 'raft' THEN (v_segment.raft_time_min + v_segment.raft_time_max) / 2
                WHEN 'tube' THEN (v_segment.tube_time_min + v_segment.tube_time_max) / 2
                ELSE (v_segment.canoe_time_min + v_segment.canoe_time_max) / 2
            END,
            v_segment.trip_type,
            v_segment.source,
            FALSE,
            v_segment.shuttle_time_minutes,
            v_segment.shuttle_distance_miles;
        RETURN;
    END IF;

    -- Try reverse direction (upstream float)
    SELECT * INTO v_segment
    FROM float_segments fs
    WHERE fs.put_in_id = p_take_out_id AND fs.take_out_id = p_put_in_id
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT
            v_segment.distance_miles,
            CASE p_vessel_type
                WHEN 'canoe' THEN (v_segment.canoe_time_min * 1.5)::INT
                WHEN 'kayak' THEN (v_segment.canoe_time_min * 1.5)::INT
                WHEN 'raft' THEN (v_segment.raft_time_min * 1.5)::INT
                WHEN 'tube' THEN NULL
                ELSE (v_segment.canoe_time_min * 1.5)::INT
            END,
            CASE p_vessel_type
                WHEN 'canoe' THEN (v_segment.canoe_time_max * 1.5)::INT
                WHEN 'kayak' THEN (v_segment.canoe_time_max * 1.5)::INT
                WHEN 'raft' THEN (v_segment.raft_time_max * 1.5)::INT
                WHEN 'tube' THEN NULL
                ELSE (v_segment.canoe_time_max * 1.5)::INT
            END,
            CASE p_vessel_type
                WHEN 'canoe' THEN ((v_segment.canoe_time_min + v_segment.canoe_time_max) / 2 * 1.5)::INT
                WHEN 'kayak' THEN ((v_segment.canoe_time_min + v_segment.canoe_time_max) / 2 * 1.5)::INT
                WHEN 'raft' THEN ((v_segment.raft_time_min + v_segment.raft_time_max) / 2 * 1.5)::INT
                WHEN 'tube' THEN NULL
                ELSE ((v_segment.canoe_time_min + v_segment.canoe_time_max) / 2 * 1.5)::INT
            END,
            v_segment.trip_type,
            v_segment.source,
            TRUE,
            v_segment.shuttle_time_minutes,
            v_segment.shuttle_distance_miles;
        RETURN;
    END IF;

    -- No segment found
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;
