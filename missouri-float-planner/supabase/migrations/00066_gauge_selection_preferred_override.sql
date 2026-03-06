-- Migration: Update get_river_condition_segment to support preferred gauge override
--
-- Adds optional p_access_point_id parameter. When the access point has a
-- preferred_gauge_station_id set, that gauge is used directly instead of
-- the automatic mile-based or distance-based selection.

-- Drop existing function (signature is changing)
DROP FUNCTION IF EXISTS get_river_condition_segment(UUID, GEOMETRY, NUMERIC);

CREATE OR REPLACE FUNCTION get_river_condition_segment(
    p_river_id UUID,
    p_put_in_point GEOMETRY(Point, 4326) DEFAULT NULL,
    p_put_in_mile NUMERIC DEFAULT NULL,
    p_access_point_id UUID DEFAULT NULL
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
    gauge_river_mile NUMERIC,
    threshold_unit TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH selected_gauge AS (
        SELECT
            CASE
                -- Priority 1: Preferred gauge override from access point
                WHEN p_access_point_id IS NOT NULL THEN (
                    SELECT gs.id
                    FROM access_points ap
                    JOIN gauge_stations gs ON gs.id = ap.preferred_gauge_station_id
                    WHERE ap.id = p_access_point_id
                      AND gs.active = TRUE
                )
                -- Priority 2: Nearest upstream gauge by river mile
                WHEN p_put_in_mile IS NOT NULL THEN (
                    SELECT gs.id
                    FROM gauge_stations gs
                    JOIN river_gauges rg ON rg.gauge_station_id = gs.id
                    WHERE rg.river_id = p_river_id
                      AND gs.active = TRUE
                      AND rg.river_mile IS NOT NULL
                      AND rg.river_mile <= p_put_in_mile
                    ORDER BY rg.river_mile DESC
                    LIMIT 1
                )
                -- Priority 3: Nearest gauge by geographic distance
                WHEN p_put_in_point IS NOT NULL THEN (
                    SELECT gs.id FROM gauge_stations gs
                    JOIN river_gauges rg ON rg.gauge_station_id = gs.id
                    WHERE rg.river_id = p_river_id AND gs.active = TRUE
                    ORDER BY ST_Distance(gs.location::geography, p_put_in_point::geography) ASC
                    LIMIT 1
                )
                -- Priority 4: Primary gauge fallback
                ELSE (
                    SELECT rg.gauge_station_id FROM river_gauges rg
                    WHERE rg.river_id = p_river_id AND rg.is_primary = TRUE
                    LIMIT 1
                )
            END as gauge_id
    ),
    -- Fallback: if preferred gauge or upstream search returned NULL, try downstream then primary
    fallback_gauge AS (
        SELECT
            COALESCE(
                sg.gauge_id,
                (
                    SELECT gs.id
                    FROM gauge_stations gs
                    JOIN river_gauges rg ON rg.gauge_station_id = gs.id
                    WHERE rg.river_id = p_river_id
                      AND gs.active = TRUE
                      AND rg.river_mile IS NOT NULL
                      AND (p_put_in_mile IS NULL OR rg.river_mile > p_put_in_mile)
                    ORDER BY rg.river_mile ASC
                    LIMIT 1
                ),
                (
                    SELECT rg.gauge_station_id FROM river_gauges rg
                    WHERE rg.river_id = p_river_id AND rg.is_primary = TRUE
                    LIMIT 1
                )
            ) as gauge_id
        FROM selected_gauge sg
    ),
    gauge_info AS (
        SELECT
            rg.gauge_station_id,
            rg.distance_from_section_miles,
            rg.accuracy_warning_threshold_miles,
            rg.threshold_unit as thresh_unit,
            rg.level_too_low,
            rg.level_low,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            rg.river_mile as gauge_mile,
            gs.name as gauge_name,
            gs.usgs_site_id,
            gs.location as gauge_location
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        JOIN fallback_gauge fg ON fg.gauge_id = rg.gauge_station_id
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
    ),
    comparison_value AS (
        SELECT
            CASE
                WHEN gi.thresh_unit = 'cfs' THEN
                    COALESCE(lr.discharge_cfs, lr.gauge_height_ft)
                ELSE
                    COALESCE(lr.gauge_height_ft, lr.discharge_cfs)
            END as compare_val,
            CASE
                WHEN gi.thresh_unit = 'cfs' AND lr.discharge_cfs IS NULL AND lr.gauge_height_ft IS NOT NULL THEN TRUE
                WHEN gi.thresh_unit = 'ft' AND lr.gauge_height_ft IS NULL AND lr.discharge_cfs IS NOT NULL THEN TRUE
                ELSE FALSE
            END as using_fallback,
            CASE
                WHEN gi.thresh_unit = 'cfs' AND lr.discharge_cfs IS NULL AND lr.gauge_height_ft IS NOT NULL
                    THEN 'Flow (cfs) unavailable, using gauge height for comparison'
                WHEN gi.thresh_unit = 'ft' AND lr.gauge_height_ft IS NULL AND lr.discharge_cfs IS NOT NULL
                    THEN 'Gauge height unavailable, using flow (cfs) for comparison'
                ELSE NULL
            END as fallback_reason
        FROM gauge_info gi
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.compare_val IS NULL THEN 'Unknown'
            WHEN cv.compare_val >= gi.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN cv.compare_val >= gi.level_high THEN 'High Water - Experienced Only'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'Optimal Conditions'
            WHEN cv.compare_val >= gi.level_low THEN 'Low - Floatable'
            WHEN cv.compare_val >= gi.level_too_low THEN 'Very Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= gi.level_dangerous THEN 'dangerous'
            WHEN cv.compare_val >= gi.level_high THEN 'high'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'optimal'
            WHEN cv.compare_val >= gi.level_low THEN 'low'
            WHEN cv.compare_val >= gi.level_too_low THEN 'very_low'
            ELSE 'too_low'
        END,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::NUMERIC(5,1),
        (gi.distance_from_section_miles > gi.accuracy_warning_threshold_miles
         OR lr.age_hours > 6
         OR cv.using_fallback),
        CASE
            WHEN gi.distance_from_section_miles > gi.accuracy_warning_threshold_miles
                THEN 'Gauge is ' || gi.distance_from_section_miles::TEXT || ' miles from float section'
            WHEN lr.age_hours > 6
                THEN 'Reading is ' || ROUND(lr.age_hours)::TEXT || ' hours old'
            WHEN cv.using_fallback
                THEN cv.fallback_reason
            ELSE NULL
        END,
        gi.gauge_name,
        gi.usgs_site_id,
        gi.gauge_mile,
        COALESCE(gi.thresh_unit, 'ft')
    FROM gauge_info gi
    LEFT JOIN latest_reading lr ON TRUE
    LEFT JOIN comparison_value cv ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_river_condition_segment IS 'Gets river condition using position-based gauge selection with preferred gauge override. Priority: 1) access point preferred gauge, 2) upstream by river mile, 3) nearest by geography, 4) primary gauge.';
