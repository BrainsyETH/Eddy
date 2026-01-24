-- supabase/migrations/00011_gauge_river_mile_selection.sql
-- Add river_mile to river_gauges for position-based gauge selection
-- Logic: Use the gauge that is at or upstream of the put-in location

-- ============================================
-- ADD RIVER MILE TO RIVER_GAUGES
-- ============================================
ALTER TABLE river_gauges
ADD COLUMN IF NOT EXISTS river_mile NUMERIC(6,2);

COMMENT ON COLUMN river_gauges.river_mile IS 'River mile position of gauge (0 = headwaters). Used for segment-aware gauge selection.';

-- ============================================
-- UPDATE CURRENT RIVER GAUGES WITH RIVER MILES
-- ============================================
-- Montauk gauge (07064440) - at headwaters
UPDATE river_gauges rg
SET river_mile = 0.0
FROM gauge_stations gs
WHERE rg.gauge_station_id = gs.id
  AND gs.usgs_site_id = '07064440';

-- Akers gauge (07064533) - approximately mile 17
UPDATE river_gauges rg
SET river_mile = 17.0
FROM gauge_stations gs
WHERE rg.gauge_station_id = gs.id
  AND gs.usgs_site_id = '07064533';

-- Van Buren gauge (07067000) - approximately mile 100
UPDATE river_gauges rg
SET river_mile = 100.0
FROM gauge_stations gs
WHERE rg.gauge_station_id = gs.id
  AND gs.usgs_site_id = '07067000';

-- Doniphan gauge (07068000) - approximately mile 134
UPDATE river_gauges rg
SET river_mile = 134.0
FROM gauge_stations gs
WHERE rg.gauge_station_id = gs.id
  AND gs.usgs_site_id = '07068000';

-- ============================================
-- UPDATE SEGMENT-AWARE GAUGE SELECTION FUNCTION
-- ============================================
-- New logic: Select gauge at or upstream of put-in (largest river_mile <= put-in mile)
-- Falls back to closest downstream gauge if none upstream

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
    gauge_river_mile NUMERIC
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
            rg.threshold_unit,
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
        gi.gauge_mile
    FROM gauge_info gi
    LEFT JOIN latest_reading lr ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_river_condition_segment IS 'Gets river condition using position-based gauge selection. Uses gauge at or upstream of put-in mile.';
