-- Align condition codes with the Float Conditions bar.
--
-- Previously: values above level_optimal_max but below level_high fell through to
-- 'good', which clashed with the bar (which paints the "High" band from
-- level_optimal_max upward) and produced badges like "GOOD" while the needle
-- visually sat in the High zone.
--
-- New rule (mirrors src/lib/conditions.ts computeCondition): anything above
-- level_optimal_max (or level_high if optimal_max is null) is 'high'.

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
    ),
    comparison_value AS (
        SELECT
            COALESCE(
                CASE WHEN pg.threshold_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) as compare_val,
            COALESCE(pg.level_optimal_max, pg.level_high) as high_start
        FROM primary_gauge pg
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.compare_val IS NULL THEN 'Unknown'
            WHEN cv.compare_val >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'High Water - Use Caution'
            WHEN cv.compare_val >= pg.level_optimal_min
                 AND cv.compare_val <= pg.level_optimal_max THEN 'Flowing - Ideal Conditions'
            WHEN cv.compare_val >= pg.level_low THEN 'Good - Floatable'
            WHEN cv.compare_val >= pg.level_too_low THEN 'Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= pg.level_dangerous THEN 'dangerous'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'high'
            WHEN cv.compare_val >= pg.level_optimal_min
                 AND cv.compare_val <= pg.level_optimal_max THEN 'flowing'
            WHEN cv.compare_val >= pg.level_low THEN 'good'
            WHEN cv.compare_val >= pg.level_too_low THEN 'low'
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
    LEFT JOIN latest_reading lr ON TRUE
    LEFT JOIN comparison_value cv ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;


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
            COALESCE(gi.level_optimal_max, gi.level_high) as high_start,
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
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'High Water - Use Caution'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'Flowing - Ideal Conditions'
            WHEN cv.compare_val >= gi.level_low THEN 'Good - Floatable'
            WHEN cv.compare_val >= gi.level_too_low THEN 'Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= gi.level_dangerous THEN 'dangerous'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'high'
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
