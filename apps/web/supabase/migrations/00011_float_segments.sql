-- File: supabase/migrations/00011_float_segments.sql
-- Float Segments: Known float times between access points
-- Times are based on actual floater data, not calculations

-- ============================================
-- FLOAT SEGMENTS
-- Stores known float times between access points
-- ============================================
CREATE TABLE float_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,

    -- Segment endpoints (by name, matched to access_points)
    put_in_name TEXT NOT NULL,
    take_out_name TEXT NOT NULL,

    -- Linked access points (populated after matching)
    put_in_id UUID REFERENCES access_points(id) ON DELETE SET NULL,
    take_out_id UUID REFERENCES access_points(id) ON DELETE SET NULL,

    -- Distance
    distance_miles NUMERIC(5,2) NOT NULL,

    -- Float times in minutes (stored as range)
    canoe_time_min INT,  -- e.g., 180 for "3 hours"
    canoe_time_max INT,  -- e.g., 300 for "5 hours"
    raft_time_min INT,
    raft_time_max INT,
    tube_time_min INT,
    tube_time_max INT,

    -- Trip classification
    trip_type TEXT CHECK (trip_type IN ('day', 'overnight', 'multi-day')),

    -- Notes from source
    notes TEXT,

    -- Source tracking
    source TEXT,  -- e.g., 'floatmissouri.org', 'outfitter_data'

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate segments
    UNIQUE(river_id, put_in_name, take_out_name)
);

CREATE INDEX idx_float_segments_river ON float_segments(river_id);
CREATE INDEX idx_float_segments_endpoints ON float_segments(put_in_id, take_out_id);

-- ============================================
-- FUNCTION: Get float time for a segment
-- Returns average time in minutes for vessel type
-- ============================================
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
    is_reverse BOOLEAN
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
                WHEN 'kayak' THEN v_segment.canoe_time_min  -- Same as canoe
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
            FALSE;
        RETURN;
    END IF;

    -- Try reverse direction (upstream float)
    SELECT * INTO v_segment
    FROM float_segments fs
    WHERE fs.put_in_id = p_take_out_id AND fs.take_out_id = p_put_in_id
    LIMIT 1;

    IF FOUND THEN
        -- Return with upstream penalty (1.5x time)
        RETURN QUERY SELECT
            v_segment.distance_miles,
            CASE p_vessel_type
                WHEN 'canoe' THEN (v_segment.canoe_time_min * 1.5)::INT
                WHEN 'kayak' THEN (v_segment.canoe_time_min * 1.5)::INT
                WHEN 'raft' THEN (v_segment.raft_time_min * 1.5)::INT
                WHEN 'tube' THEN NULL  -- Can't tube upstream
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
            TRUE;  -- is_reverse
        RETURN;
    END IF;

    -- No segment found - return NULL
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- FUNCTION: Link segment names to access point IDs
-- Run after importing segments to match names
-- ============================================
CREATE OR REPLACE FUNCTION link_float_segments()
RETURNS TABLE (
    segment_id UUID,
    put_in_name TEXT,
    take_out_name TEXT,
    put_in_matched BOOLEAN,
    take_out_matched BOOLEAN
) AS $$
BEGIN
    -- Update put_in_id by matching name
    UPDATE float_segments fs
    SET put_in_id = ap.id
    FROM access_points ap
    WHERE fs.river_id = ap.river_id
      AND (
        LOWER(ap.name) = LOWER(fs.put_in_name)
        OR LOWER(ap.name) LIKE LOWER(fs.put_in_name) || '%'
        OR LOWER(fs.put_in_name) LIKE LOWER(ap.name) || '%'
      )
      AND fs.put_in_id IS NULL;

    -- Update take_out_id by matching name
    UPDATE float_segments fs
    SET take_out_id = ap.id
    FROM access_points ap
    WHERE fs.river_id = ap.river_id
      AND (
        LOWER(ap.name) = LOWER(fs.take_out_name)
        OR LOWER(ap.name) LIKE LOWER(fs.take_out_name) || '%'
        OR LOWER(fs.take_out_name) LIKE LOWER(ap.name) || '%'
      )
      AND fs.take_out_id IS NULL;

    -- Return status of all segments
    RETURN QUERY
    SELECT
        fs.id,
        fs.put_in_name,
        fs.take_out_name,
        fs.put_in_id IS NOT NULL,
        fs.take_out_id IS NOT NULL
    FROM float_segments fs
    ORDER BY fs.river_id, fs.put_in_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENT
-- ============================================
COMMENT ON TABLE float_segments IS 'Known float times between access points from verified sources';
COMMENT ON FUNCTION get_segment_float_time IS 'Look up float time for a segment by access point IDs';
COMMENT ON FUNCTION link_float_segments IS 'Match segment endpoint names to access_points IDs';
