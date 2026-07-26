-- supabase/migrations/00192_river_condition_threshold_unit.sql
--
-- Return threshold_unit from get_river_condition.
--
-- The function has always SELECTed rg.threshold_unit into its primary_gauge CTE and
-- used it to pick the comparison value (ft vs cfs), but never returned it. That made
-- the unit invisible to every consumer of /api/rivers — including the iOS river list,
-- which cannot print a reading it can't name the unit for.
--
-- This matters more than it looks: 18 of 24 active rivers are rated in CFS on their
-- primary gauge, so 'ft' is the wrong default for three quarters of the catalog.
-- primaryReading() in eddy-ios deliberately refuses to fall back across units — a
-- discharge printed as feet is a number that does not match the colour beside it —
-- so without this column the list can only show a condition pill, never a reading.
--
-- Two things this migration must do that a normal CREATE OR REPLACE cannot:
--
--   1. DROP first. Postgres rejects CREATE OR REPLACE when the RETURNS TABLE columns
--      change ("cannot change return type of existing function"). Both statements
--      live in this one file so Supabase's per-migration transaction keeps the drop
--      invisible to the live web app.
--
--   2. Alias the source column. A RETURNS TABLE column named threshold_unit becomes a
--      plpgsql output parameter, which then collides with rg.threshold_unit inside the
--      body ("column reference is ambiguous"). get_river_condition_segment already hit
--      this and solved it by aliasing to thresh_unit; this mirrors that exactly.
--
-- The classification logic is otherwise VERBATIM from 00166. Only the alias, the new
-- output column, and this comment differ.

DROP FUNCTION IF EXISTS get_river_condition(UUID);

CREATE FUNCTION get_river_condition(p_river_id UUID)
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
    -- Appended last so any positional consumer of the previous 10 columns is
    -- unaffected. Mirrors get_river_condition_segment, which already ends this way.
    threshold_unit TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH primary_gauge AS (
        SELECT
            rg.gauge_station_id,
            rg.distance_from_section_miles,
            rg.accuracy_warning_threshold_miles,
            -- Aliased: see header note 2.
            rg.threshold_unit AS thresh_unit,
            rg.level_too_low,
            rg.level_low,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            rg.flood_stage_ft,
            gs.name AS gauge_name,
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
            EXTRACT(EPOCH FROM (NOW() - gr.reading_timestamp)) / 3600 AS age_hours
        FROM gauge_readings gr
        JOIN primary_gauge pg ON pg.gauge_station_id = gr.gauge_station_id
        ORDER BY gr.reading_timestamp DESC
        LIMIT 1
    ),
    comparison_value AS (
        SELECT
            COALESCE(
                CASE WHEN pg.thresh_unit = 'cfs' THEN lr.discharge_cfs ELSE lr.gauge_height_ft END,
                lr.gauge_height_ft
            ) AS compare_val,
            COALESCE(pg.level_optimal_max, pg.level_high) AS high_start,
            (lr.gauge_height_ft IS NOT NULL AND pg.flood_stage_ft IS NOT NULL
             AND lr.gauge_height_ft >= pg.flood_stage_ft) AS is_flood
        FROM primary_gauge pg
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.is_flood THEN 'Dangerous - Do Not Float'
            WHEN cv.compare_val IS NULL THEN 'Unknown'
            WHEN cv.compare_val >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'High Water - Use Caution'
            WHEN cv.compare_val >= pg.level_optimal_min
                 AND cv.compare_val <= pg.level_optimal_max THEN 'Flowing - Ideal Conditions'
            WHEN cv.compare_val >= COALESCE(pg.level_low, pg.level_optimal_min) THEN 'Good - Floatable'
            WHEN cv.compare_val >= pg.level_too_low THEN 'Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.is_flood THEN 'dangerous'
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= pg.level_dangerous THEN 'dangerous'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'high'
            WHEN cv.compare_val >= pg.level_optimal_min
                 AND cv.compare_val <= pg.level_optimal_max THEN 'flowing'
            WHEN cv.compare_val >= COALESCE(pg.level_low, pg.level_optimal_min) THEN 'good'
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
        pg.usgs_site_id,
        pg.thresh_unit
    FROM primary_gauge pg
    CROSS JOIN comparison_value cv
    LEFT JOIN latest_reading lr ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;
