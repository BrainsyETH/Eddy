-- 20260826120000_an_unrated_gauge_reads_unknown_not_too_low.sql
--
-- A river nobody has rated must say "Unknown", not "Too Low - Not Recommended".
--
-- ── The bug ─────────────────────────────────────────────────────────────────
-- Both condition RPCs grade a reading from the top of the ladder down and end
-- in a bare ELSE:
--
--     WHEN cv.compare_val >= pg.level_too_low THEN 'Low - Scraping Likely'
--     ELSE 'Too Low - Not Recommended'
--
-- Every comparison against a NULL threshold yields NULL, which a CASE treats as
-- not-matched. So a gauge with SIX null levels skips every band and lands on
-- the ELSE. An unrated river does not read "unrated". It reads "Too Low".
--
-- shared/condition-ladder.ts has always known this — hasLadder() exists for it,
-- and its comment says so in as many words: "classifyReading would answer
-- too_low for it ... which would paint a perfectly healthy river brown on a
-- map." That guard was written for the TypeScript path and never had a SQL
-- counterpart, and the SQL path is what the river hub page, both OG image
-- routes, /plan, /api/conditions, /api/rivers/[slug]/visuals,
-- /api/rivers/[slug]/outlook and /api/og/float all call.
--
-- ── What it cost ────────────────────────────────────────────────────────────
-- 20260824232949 landed the White, the Norfork tailwater and Lake Taneycomo
-- with every level_* NULL, deliberately, because no agency publishes a rating
-- that maps release to wade or float safety on any of them. That migration's
-- header calls the alternative "inventing a number that tells a wading angler a
-- river is safe".
--
-- Leaving the ladder null invented the opposite number. Measured on production
-- 2026-08-26, straight out of get_river_condition():
--
--   white              9,100 cfs  →  "Too Low - Not Recommended"
--   taneycomo          6,323 cfs  →  "Too Low - Not Recommended"
--   norfork-tailwater  3,310 cfs  →  "Too Low - Not Recommended"
--
-- Norfork's 3,310 cfs is a generating unit running in a channel under five
-- miles long that wades at 204. The page told a reader to expect gravel bars.
--
-- These three rivers are `active = false`, which keeps them off /rivers — but
-- active gates the LIST, not the PAGE. rivers/[state]/[slug] loads by slug with
-- no active filter, and sitemap.ts lists every river row, so all three are
-- public and crawlable today.
--
-- ── Blast radius of the fix ─────────────────────────────────────────────────
-- Exactly three rows. No ACTIVE river has an all-null primary ladder:
--
--   SELECT r.slug, r.active FROM rivers r
--     JOIN river_gauges rg ON rg.river_id = r.id AND rg.is_primary
--    WHERE rg.level_too_low IS NULL AND rg.level_low IS NULL
--      AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL
--      AND rg.level_high IS NULL AND rg.level_dangerous IS NULL;
--   → norfork-tailwater (f), taneycomo (f), white (f)
--
-- A PARTIAL ladder is untouched on purpose. 00150 exists so a "Good begins at
-- X" rating with only level_optimal_min still grades, and has_ladder is the
-- same OR-of-six that hasLadder() uses, so any single level keeps the old
-- behaviour exactly.
--
-- The flood-stage override stays FIRST, ahead of the new guard. A gauge with an
-- NWS flood stage and no editorial ladder is above flood stage or it is not,
-- and that is a fact about the water rather than an opinion about floating it.

-- ── 1. get_river_condition ──────────────────────────────────────────────────
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

-- ── 2. get_river_condition_segment ──────────────────────────────────────────
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
            rg.flood_stage_ft,
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

comment on function public.get_river_condition(uuid) is
  'The rated condition for one river from its primary gauge''s newest reading. Returns unknown when the gauge carries no ladder at all — the SQL counterpart of hasLadder() in shared/condition-ladder.ts. The latest_reading CTE seeks via a scalar subquery rather than joining the materialised primary_gauge CTE, which is what lets idx_gauge_readings_latest return the newest row directly instead of the station''s whole history being sorted.';

COMMENT ON FUNCTION get_river_condition_segment(UUID, GEOMETRY, NUMERIC) IS
  'Reach-aware river condition. A reach that names its own primary_gauge_station_id wins outright; otherwise the nearest upstream gauge by river mile, then by distance, then the river primary. Returns unknown when the selected gauge carries no ladder at all.';

-- ── The stamp the bug left behind ───────────────────────────────────────────
--
-- update-gauges classified these three gauges the same way for the same reason
-- (that path is fixed in src/app/api/cron/update-gauges/route.ts, which now
-- calls hasLadder before computeCondition), and it PERSISTED the answer:
--
--   river_gauges.last_condition_code = 'too_low' on all three primaries
--   river_condition_events            unknown → too_low, kind='info', 2026-08-25
--
-- The events were never pushed — deliver-push drains only floatable/warning/
-- easing — and kind='info' is outside /api/alerts' default kinds, so nothing
-- reached a person. The stamp is the part that had to be undone: it is the
-- BASELINE the next comparison runs against. Leave it, and the day somebody
-- adds a real ladder the next cron pass reads too_low → high off a fiction and
-- classifies it 'warning', which IS pushed and IS in the feed.
--
-- Cleared rather than corrected, because there is no correct value: an unrated
-- gauge has no condition. NULL is what a gauge that has never been classified
-- holds, and it makes the first genuine reading an initialization ('unknown' →
-- something) instead of news.
--
-- ── Scoped to the incident, not to a predicate ──────────────────────────────
-- Both statements below name the three rivers and bound the window, rather
-- than matching "any unrated gauge" and "any unknown → too_low event".
--
-- The predicate looked equivalent and is not. It reads the ladder as it stands
-- TODAY, and an event is a record of what was true when it was written — so
-- "only an event whose gauge is unrated" cannot distinguish a manufactured
-- event from a genuine one recorded while the gauge was rated and later
-- blanked. 00198 blanked exactly that way on the Black ("calibrating them is a
-- safety judgement Eddy would be held to"), so the shape is not hypothetical,
-- and a migration that silently ate real history while claiming to preserve it
-- is the wrong way to fix a migration that silently manufactured it.
--
-- A repair of a known incident should say which incident. This one: three
-- rivers, stamped 2026-08-25 01:01 UTC by the cron pass after 20260824232949
-- landed. On a database rebuilt from migrations both statements are no-ops,
-- because cron output is not in the history.
--
-- The FORWARD-GOING rule lives in update-gauges, where it can see the reading
-- it is classifying — not here.
UPDATE public.river_gauges rg
SET last_condition_code = NULL
FROM public.rivers r
WHERE r.id = rg.river_id
  AND r.slug IN ('white', 'norfork-tailwater', 'taneycomo')
  AND rg.last_condition_code = 'too_low'
  AND rg.level_too_low IS NULL AND rg.level_low IS NULL
  AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL
  AND rg.level_high IS NULL AND rg.level_dangerous IS NULL;

DELETE FROM public.river_condition_events e
USING public.rivers r
WHERE r.id = e.river_id
  AND r.slug IN ('white', 'norfork-tailwater', 'taneycomo')
  AND e.old_condition_code = 'unknown'
  AND e.new_condition_code = 'too_low'
  -- The three rows were written within one second of 2026-08-25 01:01:13, by
  -- the first pass that saw these gauges. Bounded to that day so a later
  -- genuine event on the same rivers — once they carry a rating — is out of
  -- reach of this statement no matter when it is run.
  AND e.detected_at >= TIMESTAMPTZ '2026-08-25 00:00:00+00'
  AND e.detected_at <  TIMESTAMPTZ '2026-08-26 00:00:00+00';

-- ── Norfork's description is out by a factor of four ────────────────────────
--
-- 20260824232949 shipped "when a unit comes on, the river roughly quadruples".
-- The dam's own numbers, from the dossier and corroborated by the readings Eddy
-- has since collected, are 204 cfs idle and 3,310 cfs with a unit running:
-- sixteen times, not four. The Corps files release = turbine + siphon and the
-- three series reconcile exactly (3,074 + 185 = 3,259).
--
-- Worth a migration of its own scale because of which direction it errs in. The
-- sentence sits immediately after the one that says the siphon "is what makes
-- it wadeable", so it reads as a bound on how much worse things get when a unit
-- starts. Understating that bound by 4x, on a five-mile channel where wading is
-- the whole point, is not a typo about a number.
UPDATE public.rivers
SET description = replace(
        description,
        'when a unit comes on, the river roughly quadruples.',
        'when a unit comes on the river goes up about sixteenfold, to roughly 3,300 cfs, and wading is over.'
    )
WHERE slug = 'norfork-tailwater'
  AND description LIKE '%roughly quadruples.%';

-- ── Invariants ──────────────────────────────────────────────────────────────
DO $$
DECLARE
    n integer;
    bad text;
BEGIN
    -- Every unrated primary gauge must now read unknown rather than too_low.
    -- Asserted against the live function on the live readings, not against a
    -- fixture: the fall-through this migration removes was invisible to every
    -- test in the repo precisely because no test ran the RPC.
    --
    -- Restricted to gauges with NO flood stage, which is where 'unknown' is the
    -- only admissible answer. An unrated gauge that has one and is sitting above
    -- it correctly reads 'dangerous' — the override runs ahead of the has_ladder
    -- term by design — and asserting otherwise would make this migration fail
    -- during exactly the event it must not interfere with.
    SELECT string_agg(x.slug || '=' || x.condition_code, ', ' ORDER BY x.slug)
      INTO bad
    FROM (
        SELECT r.slug, c.condition_code
        FROM public.rivers r
        JOIN public.river_gauges rg ON rg.river_id = r.id AND rg.is_primary
        CROSS JOIN LATERAL public.get_river_condition(r.id) c
        WHERE rg.flood_stage_ft IS NULL
          AND rg.level_too_low IS NULL AND rg.level_low IS NULL
          AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL
          AND rg.level_high IS NULL AND rg.level_dangerous IS NULL
          AND c.condition_code IS DISTINCT FROM 'unknown'
    ) x;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'an unrated primary gauge still grades: %', bad;
    END IF;

    -- Scoped to the three rivers this migration repairs, for the same reason
    -- the UPDATE is: an unrated gauge elsewhere carrying a stamp is not this
    -- migration's to judge, and one carrying 'dangerous' off a flood stage is
    -- carrying the right value.
    SELECT count(*) INTO n
    FROM public.river_gauges rg
    JOIN public.rivers r ON r.id = rg.river_id
    WHERE r.slug IN ('white', 'norfork-tailwater', 'taneycomo')
      AND rg.last_condition_code IS NOT NULL
      AND rg.level_too_low IS NULL AND rg.level_low IS NULL
      AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL
      AND rg.level_high IS NULL AND rg.level_dangerous IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'a tailwater gauge still carries last_condition_code (% rows)', n;
    END IF;

    -- Belt and braces on the replace() above: the row must not still say it.
    IF EXISTS (
        SELECT 1 FROM public.rivers
        WHERE slug = 'norfork-tailwater' AND description LIKE '%quadruples%'
    ) THEN
        RAISE EXCEPTION 'norfork-tailwater still describes a unit as quadrupling the river';
    END IF;
END $$;
