-- File: supabase/migrations/00050_fix_get_river_condition_threshold_unit.sql
-- Fix: get_river_condition() now respects the threshold_unit column.
-- Previously it always compared gauge_height_ft against thresholds, even when
-- thresholds are configured in CFS. Now it checks threshold_unit and compares
-- against discharge_cfs when appropriate, mirroring the client-side
-- computeCondition() logic in src/lib/conditions.ts.

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
            -- Pick the compare value based on threshold_unit
            -- When 'cfs', compare discharge_cfs against thresholds
            -- When 'ft' (default), compare gauge_height_ft against thresholds
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
            ) >= pg.level_high THEN 'High Water - Experienced Only'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_optimal_min
                 AND COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) <= pg.level_optimal_max THEN 'Optimal Conditions'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_low THEN 'Low - Floatable'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_too_low THEN 'Very Low - Scraping Likely'
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
            ) <= pg.level_optimal_max THEN 'optimal'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_low THEN 'low'
            WHEN COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) >= pg.level_too_low THEN 'very_low'
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
