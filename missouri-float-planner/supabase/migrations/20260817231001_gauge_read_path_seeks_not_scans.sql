-- 20260817214500_gauge_read_path_seeks_not_scans.sql
-- Make the two hot read paths SEEK the newest reading instead of scanning for it.
--
-- Both of the app's slowest screens were slow for the same reason, in two
-- different places: "the newest reading per station" was being computed by
-- reading every reading and sorting, rather than by walking
-- idx_gauge_readings_latest backwards once per station. gauge_readings is
-- 712k rows / 194 MB, so the difference is not a tuning detail.
--
-- Measured on production before this migration:
--
--   /api/gauges         118,307 rows sorted (external merge, 6,984 kB on disk)
--                       112,279 buffers, 5,208 ms — to end up using 45 rows.
--   get_river_condition  2,280 buffers and ~83 ms PER RIVER; the rivers list
--                       calls it once per river, so 24 rivers = 54,722 buffers
--                       and 2,002 ms of database time on its own.
--
-- Neither is fixed by an index. idx_gauge_readings_latest
-- (gauge_station_id, reading_timestamp DESC) already exists and is exactly the
-- right index — both queries were written in a shape that cannot use it for
-- the ordering, so Postgres scanned the station's whole history and sorted.

-- ── 1. The newest curated reading per station, as one seek each ─────────────
--
-- PostgREST cannot express LATERAL, which is the only reason this is a
-- function. `.in(ids).order(...).limit(n)` — what the API had to write instead
-- — is a scan of every matching row followed by a top-N sort, and no value of
-- n makes it a seek. Here each station contributes exactly one index seek
-- (202 buffers for all 45, against 112,279).
--
-- CURATED ONLY, deliberately. gauge_readings holds history for the ~46 rated
-- stations and nothing else; the ~14,250 national stations live one row deep in
-- gauge_latest. Passing national ids here would seek for rows that cannot
-- exist. Callers merge the two tiers themselves — see
-- src/lib/gauges/latest-readings.ts, which is the module that owns that rule.
create or replace function public.get_latest_curated_readings(p_station_ids uuid[])
returns table (
    gauge_station_id uuid,
    reading_timestamp timestamptz,
    gauge_height_ft numeric,
    discharge_cfs numeric,
    qualifiers text[]
)
language sql
stable
-- No PostGIS here, so this pins to '' rather than to 'public, extensions' —
-- the rule 00196's header sets out. Every reference below is schema-qualified.
set search_path = ''
as $$
    select r.gauge_station_id,
           r.reading_timestamp,
           r.gauge_height_ft,
           r.discharge_cfs,
           r.qualifiers
    from unnest(p_station_ids) as s(id)
    cross join lateral (
        select gr.gauge_station_id,
               gr.reading_timestamp,
               gr.gauge_height_ft,
               gr.discharge_cfs,
               gr.qualifiers
        from public.gauge_readings gr
        where gr.gauge_station_id = s.id
        order by gr.reading_timestamp desc
        limit 1
    ) r;
$$;

comment on function public.get_latest_curated_readings(uuid[]) is
  'Newest gauge_readings row per station id, one index seek each. Curated stations only — gauge_readings holds no national history. Exists because PostgREST cannot express LATERAL, and the .in()+.order()+.limit() it can express is a full scan of each station''s history plus a sort. Callers must still merge gauge_latest for the national tier: see loadCurrentReadings.';

grant execute on function public.get_latest_curated_readings(uuid[])
  to anon, authenticated, service_role;

-- ── 2. get_river_condition: give the planner a value to seek with ───────────
--
-- Only the latest_reading CTE changes. Every threshold comparison, label,
-- code, flood override and accuracy warning below is byte-for-byte what the
-- function already returned — this is a plan fix, not a behaviour change.
--
-- The old shape was:
--
--     FROM gauge_readings gr
--     JOIN primary_gauge pg ON pg.gauge_station_id = gr.gauge_station_id
--     ORDER BY gr.reading_timestamp DESC
--     LIMIT 1
--
-- primary_gauge is referenced three times, so Postgres materialises it, and a
-- materialised CTE is an opaque relation rather than a constant. Joining
-- against one leaves the planner no station id to seek with, so it read the
-- station's entire history (~2,600 rows) and sorted it to take one row.
--
-- Referencing it as a SCALAR SUBQUERY instead makes the station id an InitPlan
-- — a single value, available before the outer scan starts — so the index
-- condition becomes `gauge_station_id = <constant>` and the DESC index yields
-- the newest row as its first tuple. 2,280 buffers -> 34, ~83 ms -> ~13 ms.
create or replace function public.get_river_condition(p_river_id uuid)
returns table (
    condition_label text,
    condition_code text,
    gauge_height_ft numeric,
    discharge_cfs numeric,
    reading_timestamp timestamptz,
    reading_age_hours numeric,
    accuracy_warning boolean,
    accuracy_warning_reason text,
    gauge_name text,
    gauge_usgs_id text,
    threshold_unit text
)
language plpgsql
stable
as $function$
BEGIN
    RETURN QUERY
    WITH primary_gauge AS (
        SELECT
            rg.gauge_station_id,
            rg.distance_from_section_miles,
            rg.accuracy_warning_threshold_miles,
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
        -- Scalar subquery, NOT a join — that is the whole fix. See the header.
        -- primary_gauge is capped at one row above, so this cannot raise
        -- "more than one row returned by a subquery".
        WHERE gr.gauge_station_id = (SELECT pg2.gauge_station_id FROM primary_gauge pg2)
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
                 AND cv.compare_val <= pg.level_optimal_max THEN 'Flowing'
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
$function$;

comment on function public.get_river_condition(uuid) is
  'The rated condition for one river from its primary gauge''s newest reading. Grading is unchanged since 00003 and its successors; the latest_reading CTE seeks via a scalar subquery rather than joining the materialised primary_gauge CTE, which is what lets idx_gauge_readings_latest return the newest row directly instead of the station''s whole history being sorted.';
