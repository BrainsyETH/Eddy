-- File: supabase/migrations/00007_segment_aware_functions.sql
-- Missouri Float Planner Segment-Aware Functions
-- Adds get_segment_nearest_gauge function and updates get_river_condition

-- ============================================
-- GET SEGMENT NEAREST GAUGE
-- Returns gauge with smallest ST_Distance to the put-in point
-- ============================================
CREATE OR REPLACE FUNCTION get_segment_nearest_gauge(
    p_river_id UUID,
    p_put_in_point GEOMETRY(Point, 4326)
)
RETURNS TABLE (
    gauge_station_id UUID,
    gauge_name TEXT,
    usgs_site_id TEXT,
    distance_meters NUMERIC,
    threshold_unit TEXT,
    level_too_low NUMERIC,
    level_low NUMERIC,
    level_optimal_min NUMERIC,
    level_optimal_max NUMERIC,
    level_high NUMERIC,
    level_dangerous NUMERIC,
    distance_from_section_miles NUMERIC,
    accuracy_warning_threshold_miles NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gs.id as gauge_station_id,
        gs.name as gauge_name,
        gs.usgs_site_id,
        ST_Distance(
            gs.location::geography,
            p_put_in_point::geography
        )::NUMERIC as distance_meters,
        rg.threshold_unit,
        rg.level_too_low,
        rg.level_low,
        rg.level_optimal_min,
        rg.level_optimal_max,
        rg.level_high,
        rg.level_dangerous,
        rg.distance_from_section_miles,
        rg.accuracy_warning_threshold_miles
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE rg.river_id = p_river_id
      AND gs.active = TRUE
    ORDER BY ST_Distance(gs.location::geography, p_put_in_point::geography) ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_segment_nearest_gauge IS 'Returns the gauge station nearest to the specified put-in point for segment-aware condition reporting';

-- ============================================
-- GET RIVER CONDITION (SEGMENT-AWARE VERSION)
-- Updated to accept optional put-in point for segment-aware gauge selection
-- ============================================
CREATE OR REPLACE FUNCTION get_river_condition_segment(
    p_river_id UUID,
    p_put_in_point GEOMETRY(Point, 4326) DEFAULT NULL
)
RETURNS TABLE (
    condition_label TEXT,
    condition_code TEXT,
    gauge_height_ft NUMERIC,
    discharge_cfs NUMERIC,
    reading_timestamp TIMESTAMPTZ,
    reading_age_hours NUMERIC,
    accuracy_warning BOOLEAN,
    accuracy_warning_reason TEXT,
    gauge_name TEXT,
    gauge_usgs_id TEXT,
    distance_to_put_in_meters NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH selected_gauge AS (
        -- If put-in point provided, use nearest gauge; otherwise fall back to primary
        SELECT
            CASE 
                WHEN p_put_in_point IS NOT NULL THEN (
                    SELECT gs.id FROM gauge_stations gs
                    JOIN river_gauges rg ON rg.gauge_station_id = gs.id
                    WHERE rg.river_id = p_river_id AND gs.active = TRUE
                    ORDER BY ST_Distance(gs.location::geography, p_put_in_point::geography) ASC
                    LIMIT 1
                )
                ELSE (
                    SELECT rg.gauge_station_id FROM river_gauges rg
                    WHERE rg.river_id = p_river_id AND rg.is_primary = TRUE
                    LIMIT 1
                )
            END as gauge_id
    ),
    gauge_info AS (
        SELECT
            rg.gauge_station_id,
            rg.distance_from_section_miles,
            rg.accuracy_warning_threshold_miles,
            rg.threshold_unit,
            rg.level_too_low,
            rg.level_low,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            gs.name as gauge_name,
            gs.usgs_site_id,
            gs.location as gauge_location
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        JOIN selected_gauge sg ON sg.gauge_id = rg.gauge_station_id
        WHERE gs.active = TRUE
        LIMIT 1
    ),
    latest_reading AS (
        SELECT
            gr.gauge_height_ft,
            gr.discharge_cfs,
            gr.reading_timestamp,
            EXTRACT(EPOCH FROM (NOW() - gr.reading_timestamp)) / 3600 as age_hours
        FROM gauge_readings gr
        JOIN gauge_info gi ON gi.gauge_station_id = gr.gauge_station_id
        ORDER BY gr.reading_timestamp DESC
        LIMIT 1
    )
    SELECT
        CASE
            WHEN lr.gauge_height_ft IS NULL THEN 'Unknown'
            WHEN lr.gauge_height_ft >= gi.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN lr.gauge_height_ft >= gi.level_high THEN 'High Water - Experienced Only'
            WHEN lr.gauge_height_ft >= gi.level_optimal_min
                 AND lr.gauge_height_ft <= gi.level_optimal_max THEN 'Optimal Conditions'
            WHEN lr.gauge_height_ft >= gi.level_low THEN 'Low - Floatable'
            WHEN lr.gauge_height_ft >= gi.level_too_low THEN 'Very Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN lr.gauge_height_ft IS NULL THEN 'unknown'
            WHEN lr.gauge_height_ft >= gi.level_dangerous THEN 'dangerous'
            WHEN lr.gauge_height_ft >= gi.level_high THEN 'high'
            WHEN lr.gauge_height_ft >= gi.level_optimal_min
                 AND lr.gauge_height_ft <= gi.level_optimal_max THEN 'optimal'
            WHEN lr.gauge_height_ft >= gi.level_low THEN 'low'
            WHEN lr.gauge_height_ft >= gi.level_too_low THEN 'very_low'
            ELSE 'too_low'
        END,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::NUMERIC(5,1),
        (gi.distance_from_section_miles > gi.accuracy_warning_threshold_miles
         OR lr.age_hours > 6),
        CASE
            WHEN gi.distance_from_section_miles > gi.accuracy_warning_threshold_miles
                THEN 'Gauge is ' || gi.distance_from_section_miles::TEXT || ' miles from float section'
            WHEN lr.age_hours > 6
                THEN 'Reading is ' || ROUND(lr.age_hours)::TEXT || ' hours old'
            ELSE NULL
        END,
        gi.gauge_name,
        gi.usgs_site_id,
        CASE
            WHEN p_put_in_point IS NOT NULL THEN
                ST_Distance(gi.gauge_location::geography, p_put_in_point::geography)::NUMERIC
            ELSE NULL
        END
    FROM gauge_info gi
    LEFT JOIN latest_reading lr ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_river_condition_segment IS 'Gets river condition using segment-aware gauge selection when put-in point is provided';

-- ============================================
-- CACHE SEGMENT GEOMETRY
-- Utility function to cache segment calculations
-- ============================================
CREATE OR REPLACE FUNCTION cache_segment(
    p_start_access_id UUID,
    p_end_access_id UUID
)
RETURNS TABLE (
    segment_geom GEOMETRY(LineString, 4326),
    distance_miles NUMERIC(5,2)
) AS $$
DECLARE
    v_cached RECORD;
    v_segment RECORD;
BEGIN
    -- Check cache first
    SELECT sc.segment_geom, sc.distance_miles
    INTO v_cached
    FROM segment_cache sc
    WHERE sc.start_access_id = p_start_access_id
      AND sc.end_access_id = p_end_access_id;
    
    IF FOUND THEN
        RETURN QUERY SELECT v_cached.segment_geom, v_cached.distance_miles;
        RETURN;
    END IF;
    
    -- Calculate segment
    SELECT gfs.segment_geom, gfs.distance_miles
    INTO v_segment
    FROM get_float_segment(p_start_access_id, p_end_access_id) gfs;
    
    -- Cache result
    INSERT INTO segment_cache (start_access_id, end_access_id, segment_geom, distance_miles)
    VALUES (p_start_access_id, p_end_access_id, v_segment.segment_geom, v_segment.distance_miles)
    ON CONFLICT (start_access_id, end_access_id) 
    DO UPDATE SET 
        segment_geom = EXCLUDED.segment_geom,
        distance_miles = EXCLUDED.distance_miles,
        cached_at = NOW();
    
    RETURN QUERY SELECT v_segment.segment_geom, v_segment.distance_miles;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cache_segment IS 'Retrieves cached segment or calculates and caches a new one';

-- ============================================
-- INVALIDATE SEGMENT CACHE
-- Call when river geometry or access points change
-- ============================================
CREATE OR REPLACE FUNCTION invalidate_segment_cache(
    p_river_id UUID DEFAULT NULL,
    p_access_point_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    IF p_access_point_id IS NOT NULL THEN
        -- Invalidate cache entries involving this access point
        DELETE FROM segment_cache
        WHERE start_access_id = p_access_point_id
           OR end_access_id = p_access_point_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    ELSIF p_river_id IS NOT NULL THEN
        -- Invalidate all cache entries for access points on this river
        DELETE FROM segment_cache
        WHERE start_access_id IN (SELECT id FROM access_points WHERE river_id = p_river_id)
           OR end_access_id IN (SELECT id FROM access_points WHERE river_id = p_river_id);
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    ELSE
        -- Invalidate entire cache
        DELETE FROM segment_cache;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END IF;
    
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION invalidate_segment_cache IS 'Manually invalidates segment cache entries';

-- ============================================
-- GET CAMPGROUNDS ALONG ROUTE
-- For multi-day trip planning
-- ============================================
CREATE OR REPLACE FUNCTION get_campgrounds_along_route(
    p_river_id UUID,
    p_start_mile NUMERIC,
    p_end_mile NUMERIC,
    p_interval_min_miles NUMERIC DEFAULT 10,
    p_interval_max_miles NUMERIC DEFAULT 15
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    river_mile NUMERIC,
    coordinates GEOMETRY,
    amenities TEXT[],
    distance_from_start NUMERIC
) AS $$
DECLARE
    v_min_mile NUMERIC;
    v_max_mile NUMERIC;
BEGIN
    -- Handle direction (start could be upstream or downstream)
    v_min_mile := LEAST(p_start_mile, p_end_mile);
    v_max_mile := GREATEST(p_start_mile, p_end_mile);
    
    RETURN QUERY
    WITH campgrounds AS (
        SELECT 
            ap.id,
            ap.name,
            ap.slug,
            ap.river_mile_downstream as river_mile,
            COALESCE(ap.location_snap, ap.location_orig) as coordinates,
            ap.amenities,
            ABS(ap.river_mile_downstream - p_start_mile) as distance_from_start
        FROM access_points ap
        WHERE ap.river_id = p_river_id
          AND ap.type = 'campground'
          AND ap.approved = TRUE
          AND ap.river_mile_downstream >= v_min_mile
          AND ap.river_mile_downstream <= v_max_mile
        ORDER BY ap.river_mile_downstream
    ),
    -- Filter to approximate intervals
    spaced_campgrounds AS (
        SELECT 
            c.*,
            LAG(c.river_mile) OVER (ORDER BY c.river_mile) as prev_mile
        FROM campgrounds c
    )
    SELECT 
        sc.id,
        sc.name,
        sc.slug,
        sc.river_mile,
        sc.coordinates,
        sc.amenities,
        sc.distance_from_start
    FROM spaced_campgrounds sc
    WHERE sc.prev_mile IS NULL 
       OR ABS(sc.river_mile - sc.prev_mile) >= p_interval_min_miles;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_campgrounds_along_route IS 'Returns campground access points along a route at specified intervals for multi-day trip planning';

-- ============================================
-- CALCULATE GAUGE RATE OF CHANGE
-- For adaptive polling logic
-- ============================================
CREATE OR REPLACE FUNCTION get_gauge_rate_of_change(
    p_gauge_station_id UUID,
    p_hours_lookback NUMERIC DEFAULT 1
)
RETURNS TABLE (
    rate_ft_per_hour NUMERIC,
    current_height NUMERIC,
    previous_height NUMERIC,
    hours_elapsed NUMERIC,
    is_rapid_change BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH readings AS (
        SELECT 
            gr.gauge_height_ft,
            gr.reading_timestamp,
            ROW_NUMBER() OVER (ORDER BY gr.reading_timestamp DESC) as rn
        FROM gauge_readings gr
        WHERE gr.gauge_station_id = p_gauge_station_id
          AND gr.reading_timestamp >= NOW() - (p_hours_lookback * 2 || ' hours')::INTERVAL
        ORDER BY gr.reading_timestamp DESC
        LIMIT 10
    ),
    current_reading AS (
        SELECT gauge_height_ft, reading_timestamp FROM readings WHERE rn = 1
    ),
    previous_reading AS (
        SELECT gauge_height_ft, reading_timestamp 
        FROM readings 
        WHERE rn > 1
          AND reading_timestamp <= (SELECT reading_timestamp - (p_hours_lookback || ' hours')::INTERVAL FROM current_reading)
        ORDER BY reading_timestamp DESC
        LIMIT 1
    )
    SELECT
        CASE 
            WHEN pr.gauge_height_ft IS NOT NULL AND cr.gauge_height_ft IS NOT NULL THEN
                (cr.gauge_height_ft - pr.gauge_height_ft) / 
                NULLIF(EXTRACT(EPOCH FROM (cr.reading_timestamp - pr.reading_timestamp)) / 3600, 0)
            ELSE NULL
        END::NUMERIC as rate_ft_per_hour,
        cr.gauge_height_ft as current_height,
        pr.gauge_height_ft as previous_height,
        EXTRACT(EPOCH FROM (cr.reading_timestamp - pr.reading_timestamp)) / 3600 as hours_elapsed,
        CASE 
            WHEN pr.gauge_height_ft IS NOT NULL AND cr.gauge_height_ft IS NOT NULL THEN
                ABS(cr.gauge_height_ft - pr.gauge_height_ft) / 
                NULLIF(EXTRACT(EPOCH FROM (cr.reading_timestamp - pr.reading_timestamp)) / 3600, 0) > 0.5
            ELSE FALSE
        END as is_rapid_change
    FROM current_reading cr
    LEFT JOIN previous_reading pr ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_gauge_rate_of_change IS 'Calculates rate of change in gauge height for adaptive polling decisions';
