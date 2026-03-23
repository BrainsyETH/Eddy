-- Migration: Rename condition codes okay→good, optimal→flowing
-- Updates:
-- 1. threshold_descriptions JSON keys in gauge_stations
-- 2. social_config highlight_conditions default
-- 3. get_river_condition() RPC — return new codes/labels
-- 4. get_river_condition_segment() RPC — return new codes/labels
-- 5. calculate_float_time() RPC — match on new codes

-- ============================================================================
-- 1. Rename threshold_descriptions JSON keys for all gauge_stations
-- ============================================================================

UPDATE gauge_stations
SET threshold_descriptions = (
  threshold_descriptions
    - 'okay'
    - 'optimal'
    || CASE WHEN threshold_descriptions ? 'okay'
         THEN jsonb_build_object('good', threshold_descriptions->'okay')
         ELSE '{}'::jsonb END
    || CASE WHEN threshold_descriptions ? 'optimal'
         THEN jsonb_build_object('flowing', threshold_descriptions->'optimal')
         ELSE '{}'::jsonb END
)
WHERE threshold_descriptions IS NOT NULL
  AND (threshold_descriptions ? 'okay' OR threshold_descriptions ? 'optimal');

COMMENT ON COLUMN gauge_stations.threshold_descriptions IS
  'JSON object with descriptions for each threshold level: {tooLow, low, good, flowing, high, flood}';

-- ============================================================================
-- 2. Update social_config highlight_conditions default + existing rows
-- ============================================================================

ALTER TABLE social_config
  ALTER COLUMN highlight_conditions SET DEFAULT '{flowing,dangerous,high,too_low}';

UPDATE social_config
SET highlight_conditions = array_replace(
      array_replace(highlight_conditions, 'optimal', 'flowing'),
      'okay', 'good'
    )
WHERE 'optimal' = ANY(highlight_conditions)
   OR 'okay' = ANY(highlight_conditions);

-- ============================================================================
-- 3. Recreate get_river_condition() with new codes/labels
--    (Based on 00080 definition, same structure, new condition strings)
-- ============================================================================

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
    gauge_usgs_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH primary_gauge AS (
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
    )
    SELECT
        CASE
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) IS NULL THEN 'Unknown'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_high THEN 'High Water - Use Caution'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_optimal_min
                 AND COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) <= pg.level_optimal_max THEN 'Flowing - Ideal Conditions'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_low THEN 'Good - Floatable'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_too_low THEN 'Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) IS NULL THEN 'unknown'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_dangerous THEN 'dangerous'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_high THEN 'high'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_optimal_min
                 AND COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) <= pg.level_optimal_max THEN 'flowing'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_low THEN 'good'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_too_low THEN 'low'
            ELSE 'too_low'
        END,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::NUMERIC(5,1),
        (pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
         OR lr.age_hours > 6),
        CASE
            WHEN pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
                THEN 'Gauge is ' || pg.distance_from_section_miles::TEXT || ' miles from float section'
            WHEN lr.age_hours > 6
                THEN 'Reading is ' || ROUND(lr.age_hours)::TEXT || ' hours old'
            ELSE NULL
        END,
        pg.gauge_name,
        pg.usgs_site_id
    FROM primary_gauge pg
    LEFT JOIN latest_reading lr ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. Recreate get_river_condition_segment() with new codes/labels
--    (Based on 00080 definition, same structure, new condition strings)
-- ============================================================================

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
            WHEN cv.compare_val >= gi.level_high THEN 'High Water - Use Caution'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'Flowing - Ideal Conditions'
            WHEN cv.compare_val >= gi.level_low THEN 'Good - Floatable'
            WHEN cv.compare_val >= gi.level_too_low THEN 'Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= gi.level_dangerous THEN 'dangerous'
            WHEN cv.compare_val >= gi.level_high THEN 'high'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'flowing'
            WHEN cv.compare_val >= gi.level_low THEN 'good'
            WHEN cv.compare_val >= gi.level_too_low THEN 'low'
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
            WHEN cv.using_fallback AND cv.fallback_reason IS NOT NULL
                THEN cv.fallback_reason
            WHEN gi.distance_from_section_miles > gi.accuracy_warning_threshold_miles
                THEN 'Gauge is ' || gi.distance_from_section_miles::TEXT || ' miles from float section'
            WHEN lr.age_hours > 6
                THEN 'Reading is ' || ROUND(lr.age_hours)::TEXT || ' hours old'
            ELSE NULL
        END,
        gi.gauge_name,
        gi.usgs_site_id,
        gi.gauge_mile,
        gi.thresh_unit
    FROM gauge_info gi
    LEFT JOIN latest_reading lr ON TRUE
    LEFT JOIN comparison_value cv ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 5. Recreate calculate_float_time() with new condition codes
--    DB functions now return 'flowing' (was 'optimal'), 'good' (was 'low'),
--    'low' (was 'very_low'). Update the speed lookup to match.
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_float_time(
    p_distance_miles NUMERIC,
    p_vessel_type_id UUID,
    p_condition_code TEXT
) RETURNS TABLE (
    float_minutes INT,
    speed_mph NUMERIC,
    vessel_name TEXT
) AS $$
DECLARE
    v_speed NUMERIC;
    v_vessel_name TEXT;
BEGIN
    SELECT
        name,
        CASE p_condition_code
            WHEN 'dangerous' THEN NULL  -- Don't calculate for dangerous
            WHEN 'high' THEN speed_high_water
            WHEN 'flowing' THEN speed_normal
            WHEN 'good' THEN speed_low_water
            WHEN 'low' THEN speed_low_water * 0.75
            WHEN 'too_low' THEN speed_low_water * 0.5
            -- Legacy codes (backwards compat during rollout)
            WHEN 'optimal' THEN speed_normal
            ELSE speed_normal  -- Default to normal
        END
    INTO v_vessel_name, v_speed
    FROM vessel_types
    WHERE id = p_vessel_type_id;

    IF v_speed IS NULL OR v_speed = 0 THEN
        RETURN QUERY SELECT NULL::INT, NULL::NUMERIC, v_vessel_name;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        ROUND((p_distance_miles / v_speed) * 60)::INT,
        v_speed,
        v_vessel_name;
END;
$$ LANGUAGE plpgsql STABLE;
