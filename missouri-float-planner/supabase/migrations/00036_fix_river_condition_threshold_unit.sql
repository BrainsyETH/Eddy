-- File: supabase/migrations/00036_fix_river_condition_threshold_unit.sql
-- Fix: get_river_condition() now respects the threshold_unit column
-- Previously it always compared gauge_height_ft against thresholds,
-- even when threshold_unit = 'cfs' (discharge-based thresholds).

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
            -- Choose compare_value based on threshold_unit
            WHEN pg.threshold_unit = 'cfs' THEN
                CASE
                    WHEN lr.discharge_cfs IS NULL THEN 'Unknown'
                    WHEN lr.discharge_cfs >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
                    WHEN lr.discharge_cfs >= pg.level_high THEN 'High Water - Experienced Only'
                    WHEN lr.discharge_cfs >= pg.level_optimal_min
                         AND lr.discharge_cfs <= pg.level_optimal_max THEN 'Optimal Conditions'
                    WHEN lr.discharge_cfs >= pg.level_low THEN 'Low - Floatable'
                    WHEN lr.discharge_cfs >= pg.level_too_low THEN 'Very Low - Scraping Likely'
                    ELSE 'Too Low - Not Recommended'
                END
            ELSE
                CASE
                    WHEN lr.gauge_height_ft IS NULL THEN 'Unknown'
                    WHEN lr.gauge_height_ft >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
                    WHEN lr.gauge_height_ft >= pg.level_high THEN 'High Water - Experienced Only'
                    WHEN lr.gauge_height_ft >= pg.level_optimal_min
                         AND lr.gauge_height_ft <= pg.level_optimal_max THEN 'Optimal Conditions'
                    WHEN lr.gauge_height_ft >= pg.level_low THEN 'Low - Floatable'
                    WHEN lr.gauge_height_ft >= pg.level_too_low THEN 'Very Low - Scraping Likely'
                    ELSE 'Too Low - Not Recommended'
                END
        END,
        CASE
            WHEN pg.threshold_unit = 'cfs' THEN
                CASE
                    WHEN lr.discharge_cfs IS NULL THEN 'unknown'
                    WHEN lr.discharge_cfs >= pg.level_dangerous THEN 'dangerous'
                    WHEN lr.discharge_cfs >= pg.level_high THEN 'high'
                    WHEN lr.discharge_cfs >= pg.level_optimal_min
                         AND lr.discharge_cfs <= pg.level_optimal_max THEN 'optimal'
                    WHEN lr.discharge_cfs >= pg.level_low THEN 'low'
                    WHEN lr.discharge_cfs >= pg.level_too_low THEN 'very_low'
                    ELSE 'too_low'
                END
            ELSE
                CASE
                    WHEN lr.gauge_height_ft IS NULL THEN 'unknown'
                    WHEN lr.gauge_height_ft >= pg.level_dangerous THEN 'dangerous'
                    WHEN lr.gauge_height_ft >= pg.level_high THEN 'high'
                    WHEN lr.gauge_height_ft >= pg.level_optimal_min
                         AND lr.gauge_height_ft <= pg.level_optimal_max THEN 'optimal'
                    WHEN lr.gauge_height_ft >= pg.level_low THEN 'low'
                    WHEN lr.gauge_height_ft >= pg.level_too_low THEN 'very_low'
                    ELSE 'too_low'
                END
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

-- Also fix calculate_float_time to use consistent speed multipliers
-- Aligning with the conservative values (safer for trip planning):
-- very_low: 0.75x low-water speed
-- too_low: 0.5x low-water speed
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
            WHEN 'optimal' THEN speed_normal
            WHEN 'low' THEN speed_low_water
            WHEN 'very_low' THEN speed_low_water * 0.75
            WHEN 'too_low' THEN speed_low_water * 0.5
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
