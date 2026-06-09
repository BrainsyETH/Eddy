-- supabase/migrations/00021_cfs_threshold_support.sql
-- Add support for CFS-based thresholds with fallback to stage (ft)
--
-- Some gauges (like Doniphan) have datum issues where stage readings
-- don't correlate well with floatability. CFS is more reliable for these.
--
-- Logic:
-- 1. Check threshold_unit ('ft' or 'cfs')
-- 2. If 'cfs', use discharge_cfs for comparison
-- 3. If 'ft', use gauge_height_ft for comparison
-- 4. If preferred value is NULL, fall back to the other unit

-- ============================================
-- DROP EXISTING FUNCTIONS (return type changed)
-- ============================================
DROP FUNCTION IF EXISTS get_river_condition(UUID);
DROP FUNCTION IF EXISTS get_river_condition_segment(UUID, GEOMETRY, NUMERIC);

-- ============================================
-- UPDATE get_river_condition FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_river_condition(p_river_id UUID)
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
    threshold_unit TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH primary_gauge AS (
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
            gs.name as gauge_name,
            gs.usgs_site_id
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE rg.river_id = p_river_id
          AND rg.is_primary = TRUE
          AND gs.active = TRUE
        LIMIT 1
    ),
    latest_reading AS (
        SELECT
            gr.gauge_height_ft,
            gr.discharge_cfs,
            gr.reading_timestamp,
            EXTRACT(EPOCH FROM (NOW() - gr.reading_timestamp)) / 3600 as age_hours
        FROM gauge_readings gr
        JOIN primary_gauge pg ON pg.gauge_station_id = gr.gauge_station_id
        ORDER BY gr.reading_timestamp DESC
        LIMIT 1
    ),
    -- Determine which value to use for comparison based on threshold_unit
    -- with fallback if preferred value is NULL
    comparison_value AS (
        SELECT
            CASE
                WHEN pg.thresh_unit = 'cfs' THEN
                    COALESCE(lr.discharge_cfs, lr.gauge_height_ft)
                ELSE
                    COALESCE(lr.gauge_height_ft, lr.discharge_cfs)
            END as compare_val,
            -- Track if we're using fallback (for potential warning)
            CASE
                WHEN pg.thresh_unit = 'cfs' AND lr.discharge_cfs IS NULL AND lr.gauge_height_ft IS NOT NULL THEN TRUE
                WHEN pg.thresh_unit = 'ft' AND lr.gauge_height_ft IS NULL AND lr.discharge_cfs IS NOT NULL THEN TRUE
                ELSE FALSE
            END as using_fallback
        FROM primary_gauge pg
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.compare_val IS NULL THEN 'Unknown'
            WHEN cv.compare_val >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN cv.compare_val >= pg.level_high THEN 'High Water - Experienced Only'
            WHEN cv.compare_val >= pg.level_optimal_min
                 AND cv.compare_val <= pg.level_optimal_max THEN 'Optimal Conditions'
            WHEN cv.compare_val >= pg.level_low THEN 'Low - Floatable'
            WHEN cv.compare_val >= pg.level_too_low THEN 'Very Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= pg.level_dangerous THEN 'dangerous'
            WHEN cv.compare_val >= pg.level_high THEN 'high'
            WHEN cv.compare_val >= pg.level_optimal_min
                 AND cv.compare_val <= pg.level_optimal_max THEN 'optimal'
            WHEN cv.compare_val >= pg.level_low THEN 'low'
            WHEN cv.compare_val >= pg.level_too_low THEN 'very_low'
            ELSE 'too_low'
        END,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::NUMERIC(5,1),
        (pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
         OR lr.age_hours > 6
         OR cv.using_fallback),
        CASE
            WHEN pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
                THEN 'Gauge is ' || pg.distance_from_section_miles::TEXT || ' miles from float section'
            WHEN lr.age_hours > 6
                THEN 'Reading is ' || ROUND(lr.age_hours)::TEXT || ' hours old'
            WHEN cv.using_fallback
                THEN 'Using fallback unit for comparison'
            ELSE NULL
        END,
        pg.gauge_name,
        pg.usgs_site_id,
        COALESCE(pg.thresh_unit, 'ft')
    FROM primary_gauge pg
    LEFT JOIN latest_reading lr ON TRUE
    LEFT JOIN comparison_value cv ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- UPDATE get_river_condition_segment FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_river_condition_segment(
    p_river_id UUID,
    p_put_in_point GEOMETRY(Point, 4326) DEFAULT NULL,
    p_put_in_mile NUMERIC DEFAULT NULL
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
                WHEN p_put_in_mile IS NOT NULL THEN (
                    -- First try: gauge at or upstream of put-in (largest mile <= put-in mile)
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
                WHEN p_put_in_point IS NOT NULL THEN (
                    -- Fallback: nearest gauge by distance
                    SELECT gs.id FROM gauge_stations gs
                    JOIN river_gauges rg ON rg.gauge_station_id = gs.id
                    WHERE rg.river_id = p_river_id AND gs.active = TRUE
                    ORDER BY ST_Distance(gs.location::geography, p_put_in_point::geography) ASC
                    LIMIT 1
                )
                ELSE (
                    -- Default: primary gauge
                    SELECT rg.gauge_station_id FROM river_gauges rg
                    WHERE rg.river_id = p_river_id AND rg.is_primary = TRUE
                    LIMIT 1
                )
            END as gauge_id
    ),
    -- If no upstream gauge found, get closest downstream
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
    -- Determine which value to use for comparison based on threshold_unit
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
            END as using_fallback
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
                THEN 'Using fallback unit for comparison'
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

COMMENT ON FUNCTION get_river_condition IS 'Gets river condition using primary gauge. Supports both ft and cfs threshold units with automatic fallback.';
COMMENT ON FUNCTION get_river_condition_segment IS 'Gets river condition using position-based gauge selection. Supports both ft and cfs threshold units with automatic fallback.';

-- ============================================
-- SET DONIPHAN GAUGE TO USE CFS THRESHOLDS
-- ============================================
-- Doniphan (07068000) has datum issues causing negative stage readings
-- CFS is more reliable - using moherp.org calibrated thresholds
UPDATE river_gauges rg
SET
    threshold_unit = 'cfs',
    level_too_low = 1100,       -- moherp "Poor" cutoff
    level_low = 1800,           -- Floatable but dragging
    level_optimal_min = 2350,   -- moherp "Good" range starts
    level_optimal_max = 3350,   -- moherp "Good" range ends
    level_high = 3350,          -- moherp "High" starts (cautious)
    level_dangerous = 7800      -- moherp "Flood" cutoff
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07068000';

-- Verify the update
SELECT
    gs.name as gauge_name,
    gs.usgs_site_id,
    r.name as river_name,
    rg.threshold_unit,
    rg.level_too_low,
    rg.level_low,
    rg.level_optimal_min,
    rg.level_optimal_max,
    rg.level_high,
    rg.level_dangerous
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE gs.usgs_site_id = '07068000';
