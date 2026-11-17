-- 20261117013000_flood_stage_resolves_station_first.sql
--
-- Condition logic and the safety display read the flood stage from two places.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- resolveFloodStages() (src/lib/gauges/flood-stages.ts) answers "what is this
-- gauge's official flood stage" for the safety row and the chart: the
-- station's nwps_flood_stage_ft first, then the river_gauges pairing's
-- flood_stage_ft. The four functions below read the pairing alone. The
-- national import skips curated stations, so that was meant to be the same
-- answer, but a station curated AFTER it was imported keeps its nwps_* values.
-- Measured on production 2026-11-17:
--
--   white      07060500  Calico Rock     station 19 ft, pairing NULL
--   gasconade  06934000  Rich Fountain   station 20 ft, pairing NULL
--
-- Both are unrated, so the flood stage is their only danger signal: above it
-- the page draws a flood line while these functions answer 'unknown'. Neither
-- has reached flood stage in stored history (max 8.0 ft and 13.8 ft).
--
-- ── The change ──────────────────────────────────────────────────────────────
-- One expression, the SQL form of resolveFloodStages(), in each function:
--
--   coalesce(nullif(gs.nwps_flood_stage_ft, 0), nullif(rg.flood_stage_ft, 0))
--
-- nullif(…, 0) mirrors the resolver, which treats a zero stage as absent. No
-- pairing or station carries a zero today. get_mo_surface_water_dataset also
-- takes its action stage from whichever source supplied the flood stage, as
-- the resolver does. Nothing else in any body changes: each is the latest
-- definition with that one select-list entry replaced, and
-- src/lib/gauges/flood-stage-readers.test.ts pins the expression in whichever
-- migration most recently defines each function.
--
-- Bases, compared with production prosrc by md5 on 2026-11-17:
--   get_river_condition, get_river_condition_segment  20260826162627  identical
--   get_mo_surface_water_dataset                      00123           identical
--   get_river_conditions                              20260902131340  identical
--     apart from one comment sentence the file has and production lacks
--
-- Volatility, language, search_path and SECURITY INVOKER match production's
-- pg_proc rows; CREATE OR REPLACE keeps the existing grants and comments.
--
-- ── Blast radius ────────────────────────────────────────────────────────────
-- Zero rows change verdict when this is applied. The two pairings above are
-- not primary, and get_river_condition / get_river_conditions read primaries
-- only; get_river_condition_segment can select them, and both read far below
-- flood stage today. Every other pairing either has no station value or (none
-- today) an equal one. The TypeScript readers resolve the same way through
-- linkFloodStageFt() and do not depend on this migration being applied first.

-- ── 1. get_river_condition ── base: 20260826162627_an_unrated_gauge_reads_unknown_not_too_low.sql
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
            -- Station NWS stage first, then the pairing's: resolveFloodStages() in SQL.
            coalesce(nullif(gs.nwps_flood_stage_ft, 0), nullif(rg.flood_stage_ft, 0)) as flood_stage_ft,
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
            ,
            -- The SQL half of hasLadder() in shared/condition-ladder.ts.
            -- Without it the CASE below falls through to 'too_low' for a
            -- gauge nobody has rated. See this migration's header.
            (pg.level_too_low IS NOT NULL OR pg.level_low IS NOT NULL
             OR pg.level_optimal_min IS NOT NULL OR pg.level_optimal_max IS NOT NULL
             OR pg.level_high IS NOT NULL OR pg.level_dangerous IS NOT NULL) AS has_ladder
        FROM primary_gauge pg
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.is_flood THEN 'Dangerous - Do Not Float'
            WHEN cv.has_ladder IS NOT TRUE THEN 'Unknown'
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
            WHEN cv.has_ladder IS NOT TRUE THEN 'unknown'
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

-- ── 2. get_river_condition_segment ── base: 20260826162627_an_unrated_gauge_reads_unknown_not_too_low.sql
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
    WITH resolved_mile AS (
        -- The caller's mile if given; otherwise derive one from the put-in point
        -- so point-based callers (embeds, /api/conditions) get reach awareness
        -- too. snap_to_river already does this conversion.
        SELECT COALESCE(
            p_put_in_mile,
            CASE WHEN p_put_in_point IS NOT NULL
                 THEN (SELECT s.river_mile FROM snap_to_river(p_put_in_point, p_river_id) s)
            END
        ) AS mile
    ),
    section_gauge AS (
        SELECT rs.primary_gauge_station_id AS gauge_id
        FROM river_sections rs
        CROSS JOIN resolved_mile rm
        WHERE rs.river_id = p_river_id
          AND rs.primary_gauge_station_id IS NOT NULL
          AND rm.mile IS NOT NULL
          AND (rs.river_mile_start IS NULL OR rm.mile >= rs.river_mile_start)
          AND (rs.river_mile_end   IS NULL OR rm.mile <  rs.river_mile_end)
        ORDER BY rs.sort_order
        LIMIT 1
    ),
    selected_gauge AS (
        SELECT
            CASE
                -- A reach that names its own gauge wins outright. This is the
                -- only way to express "there is a dam between you and that
                -- gauge", which no distance or mile comparison can infer.
                WHEN (SELECT sg.gauge_id FROM section_gauge sg) IS NOT NULL
                    THEN (SELECT sg.gauge_id FROM section_gauge sg)
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
            -- Station NWS stage first, then the pairing's: resolveFloodStages() in SQL.
            coalesce(nullif(gs.nwps_flood_stage_ft, 0), nullif(rg.flood_stage_ft, 0)) as flood_stage_ft,
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
            END as fallback_reason,
            (lr.gauge_height_ft IS NOT NULL AND gi.flood_stage_ft IS NOT NULL
             AND lr.gauge_height_ft >= gi.flood_stage_ft) AS is_flood
            ,
            -- The SQL half of hasLadder() in shared/condition-ladder.ts.
            -- Without it the CASE below falls through to 'too_low' for a
            -- gauge nobody has rated. See this migration's header.
            (gi.level_too_low IS NOT NULL OR gi.level_low IS NOT NULL
             OR gi.level_optimal_min IS NOT NULL OR gi.level_optimal_max IS NOT NULL
             OR gi.level_high IS NOT NULL OR gi.level_dangerous IS NOT NULL) AS has_ladder
        FROM gauge_info gi
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.is_flood THEN 'Dangerous - Do Not Float'
            WHEN cv.has_ladder IS NOT TRUE THEN 'Unknown'
            WHEN cv.compare_val IS NULL THEN 'Unknown'
            WHEN cv.compare_val >= gi.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'High Water - Use Caution'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'Flowing'
            WHEN cv.compare_val >= COALESCE(gi.level_low, gi.level_optimal_min) THEN 'Good - Floatable'
            WHEN cv.compare_val >= gi.level_too_low THEN 'Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN cv.is_flood THEN 'dangerous'
            WHEN cv.has_ladder IS NOT TRUE THEN 'unknown'
            WHEN cv.compare_val IS NULL THEN 'unknown'
            WHEN cv.compare_val >= gi.level_dangerous THEN 'dangerous'
            WHEN cv.high_start IS NOT NULL AND cv.compare_val > cv.high_start THEN 'high'
            WHEN cv.compare_val >= gi.level_optimal_min
                 AND cv.compare_val <= gi.level_optimal_max THEN 'flowing'
            WHEN cv.compare_val >= COALESCE(gi.level_low, gi.level_optimal_min) THEN 'good'
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

-- ── 3. get_river_conditions ── base: 20260902131340_the_rivers_list_asks_once_not_once_per_river.sql
create or replace function public.get_river_conditions()
returns table (
    river_id uuid,
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
language sql
stable
-- No PostGIS in this function, so it pins to '' rather than to
-- 'public, extensions' — the rule 00196's header sets out, followed by
-- get_latest_curated_readings. Every reference below is schema-qualified.
set search_path = ''
as $$
    with primary_gauge as (
        select distinct on (rg.river_id)
            rg.river_id,
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
            -- Station NWS stage first, then the pairing's: resolveFloodStages() in SQL.
            coalesce(nullif(gs.nwps_flood_stage_ft, 0), nullif(rg.flood_stage_ft, 0)) as flood_stage_ft,
            gs.name as gauge_name,
            gs.usgs_site_id
        from public.river_gauges rg
        join public.gauge_stations gs on gs.id = rg.gauge_station_id
        where rg.is_primary = true
          and gs.active = true
        order by rg.river_id, rg.gauge_station_id
    )
    select
        pg.river_id,
        case
            when cv.is_flood then 'Dangerous - Do Not Float'
            when cv.has_ladder is not true then 'Unknown'
            when cv.compare_val is null then 'Unknown'
            when cv.compare_val >= pg.level_dangerous then 'Dangerous - Do Not Float'
            when cv.high_start is not null and cv.compare_val > cv.high_start then 'High Water - Use Caution'
            when cv.compare_val >= pg.level_optimal_min
                 and cv.compare_val <= pg.level_optimal_max then 'Flowing'
            when cv.compare_val >= coalesce(pg.level_low, pg.level_optimal_min) then 'Good - Floatable'
            when cv.compare_val >= pg.level_too_low then 'Low - Scraping Likely'
            else 'Too Low - Not Recommended'
        end,
        case
            when cv.is_flood then 'dangerous'
            when cv.has_ladder is not true then 'unknown'
            when cv.compare_val is null then 'unknown'
            when cv.compare_val >= pg.level_dangerous then 'dangerous'
            when cv.high_start is not null and cv.compare_val > cv.high_start then 'high'
            when cv.compare_val >= pg.level_optimal_min
                 and cv.compare_val <= pg.level_optimal_max then 'flowing'
            when cv.compare_val >= coalesce(pg.level_low, pg.level_optimal_min) then 'good'
            when cv.compare_val >= pg.level_too_low then 'low'
            else 'too_low'
        end,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::numeric(5,1),
        (pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
         or lr.age_hours > 6),
        case
            when pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
                then 'Gauge is ' || pg.distance_from_section_miles::text || ' miles from float section'
            when lr.age_hours > 6
                then 'Reading is ' || round(lr.age_hours)::text || ' hours old'
            else null
        end,
        pg.gauge_name,
        pg.usgs_site_id,
        pg.thresh_unit
    from primary_gauge pg
    -- The seek. One index descent per river against
    -- idx_gauge_readings_latest, in place of twenty-four separate statements
    -- each doing exactly this once. See point 2 in the header.
    left join lateral (
        select
            gr.gauge_height_ft,
            gr.discharge_cfs,
            gr.reading_timestamp,
            extract(epoch from (now() - gr.reading_timestamp)) / 3600 as age_hours
        from public.gauge_readings gr
        where gr.gauge_station_id = pg.gauge_station_id
        order by gr.reading_timestamp desc
        limit 1
    ) lr on true
    cross join lateral (
        select
            coalesce(
                case when pg.thresh_unit = 'cfs' then lr.discharge_cfs else lr.gauge_height_ft end,
                lr.gauge_height_ft
            ) as compare_val,
            coalesce(pg.level_optimal_max, pg.level_high) as high_start,
            (lr.gauge_height_ft is not null and pg.flood_stage_ft is not null
             and lr.gauge_height_ft >= pg.flood_stage_ft) as is_flood,
            -- The SQL half of hasLadder() in shared/condition-ladder.ts.
            -- Without it the CASE above falls through to 'too_low' for a
            -- gauge nobody has rated. See 20260826162627.
            (pg.level_too_low is not null or pg.level_low is not null
             or pg.level_optimal_min is not null or pg.level_optimal_max is not null
             or pg.level_high is not null or pg.level_dangerous is not null) as has_ladder
    ) cv;
$$;

-- ── 4. get_mo_surface_water_dataset ── base: 00123_dataset_includes_access_point_images.sql
CREATE OR REPLACE FUNCTION get_mo_surface_water_dataset()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH river_rows AS (
    SELECT
      r.id,
      r.slug,
      r.name,
      r.region,
      r.length_miles::float AS length_miles,
      ST_AsGeoJSON(r.geom)::jsonb AS geometry,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'site_id', g.usgs_site_id,
          'name', g.gauge_name,
          'nws_lid', g.nws_lid,
          'lon', g.lon_display,
          'lat', g.lat_display,
          'lon_raw', g.lon_raw,
          'lat_raw', g.lat_raw,
          'snap_distance_m', g.snap_distance_m,
          'is_primary', g.is_primary,
          'threshold_unit', g.threshold_unit,
          'level_too_low', g.level_too_low,
          'level_low', g.level_low,
          'level_optimal_min', g.level_optimal_min,
          'level_optimal_max', g.level_optimal_max,
          'level_high', g.level_high,
          'level_dangerous', g.level_dangerous,
          'flood_stage_ft', g.flood_stage_ft,
          'action_stage_ft', g.action_stage_ft,
          'threshold_source', g.threshold_source,
          'threshold_source_url', g.threshold_source_url,
          'threshold_updated_at', g.threshold_updated_at
        ) ORDER BY g.is_primary DESC, g.gauge_name)
        FROM (
          SELECT
            gs.usgs_site_id,
            gs.name AS gauge_name,
            gs.nws_lid,
            ST_X(gs.location::geometry) AS lon_raw,
            ST_Y(gs.location::geometry) AS lat_raw,
            ST_Distance(
              gs.location::geography,
              ST_ClosestPoint(r.geom, gs.location::geometry)::geography
            ) AS snap_distance_m,
            CASE
              WHEN ST_Distance(
                gs.location::geography,
                ST_ClosestPoint(r.geom, gs.location::geometry)::geography
              ) <= 500
              THEN ST_X(ST_ClosestPoint(r.geom, gs.location::geometry))
              ELSE ST_X(gs.location::geometry)
            END AS lon_display,
            CASE
              WHEN ST_Distance(
                gs.location::geography,
                ST_ClosestPoint(r.geom, gs.location::geometry)::geography
              ) <= 500
              THEN ST_Y(ST_ClosestPoint(r.geom, gs.location::geometry))
              ELSE ST_Y(gs.location::geometry)
            END AS lat_display,
            rg.is_primary,
            rg.threshold_unit,
            rg.level_too_low,
            rg.level_low,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            coalesce(nullif(gs.nwps_flood_stage_ft, 0), nullif(rg.flood_stage_ft, 0)) AS flood_stage_ft,
            CASE WHEN nullif(gs.nwps_flood_stage_ft, 0) IS NOT NULL
                 THEN gs.nwps_action_stage_ft ELSE rg.action_stage_ft END AS action_stage_ft,
            rg.threshold_source,
            rg.threshold_source_url,
            rg.threshold_updated_at
          FROM river_gauges rg
          JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
          WHERE rg.river_id = r.id AND gs.active = true
        ) g
      ) AS gauges,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', ap.id,
          'name', ap.name,
          'slug', ap.slug,
          'type', ap.type,
          'river_mile_downstream', ap.river_mile_downstream,
          'lon', ST_X(COALESCE(ap.location_orig, ap.location_snap)),
          'lat', ST_Y(COALESCE(ap.location_orig, ap.location_snap)),
          'snap_distance_m', ap.snap_distance_m,
          'ownership', ap.ownership,
          -- New in 00123: photos for the detail modal.
          'image_urls', COALESCE(ap.image_urls, ARRAY[]::TEXT[])
        ) ORDER BY ap.river_mile_downstream NULLS LAST)
        FROM access_points ap
        WHERE ap.river_id = r.id AND ap.approved = true
      ) AS access_points,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', poi.id,
          'name', poi.name,
          'slug', poi.slug,
          'type', poi.type,
          'lat', COALESCE(poi.latitude, ST_Y(poi.location_snap)),
          'lon', COALESCE(poi.longitude, ST_X(poi.location_snap)),
          'snap_distance_m', poi.snap_distance_m,
          'river_mile', poi.river_mile,
          'nps_url', poi.nps_url,
          'description', poi.description
        ) ORDER BY poi.river_mile NULLS LAST)
        FROM points_of_interest poi
        WHERE poi.river_id = r.id AND poi.active = true AND poi.latitude IS NOT NULL
      ) AS pois
    FROM rivers r
    WHERE r.active = true
    ORDER BY r.length_miles DESC NULLS LAST
  ),
  campground_rows AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'lat', COALESCE(c.latitude, ST_Y(c.location_snap)),
      'lon', COALESCE(c.longitude, ST_X(c.location_snap)),
      'snap_distance_m', c.snap_distance_m,
      'snap_river_id', c.snap_river_id,
      'total_sites', c.total_sites,
      'sites_reservable', c.sites_reservable,
      'sites_first_come', c.sites_first_come,
      'reservation_url', c.reservation_url,
      'nps_url', c.nps_url
    ) ORDER BY c.total_sites DESC NULLS LAST) AS campgrounds
    FROM nps_campgrounds c
    WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
  )
  SELECT jsonb_build_object(
    'rivers', COALESCE((SELECT jsonb_agg(to_jsonb(rr)) FROM river_rows rr), '[]'::jsonb),
    'campgrounds', COALESCE((SELECT campgrounds FROM campground_rows), '[]'::jsonb),
    'generated_at', NOW()
  );
$$;
