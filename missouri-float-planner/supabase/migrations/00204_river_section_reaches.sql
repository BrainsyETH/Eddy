-- 00204_river_section_reaches.sql
-- Give river_sections a reach, a gauge and a type.
--
-- WHY: a river row carries one river_type, but a river with a dam in the middle
-- has two hydrologies. The Black is the live case: 5 access points above
-- Clearwater Dam (spring-fed float out of Lesterville) and 6 below it (a
-- flood-control tailwater). rivers.river_type can only describe one of them, and
-- it is not a cosmetic label — generate-update.ts keys RIVER_TYPE_GUIDANCE off
-- it, so the tailwater currently receives spring_fed_float safety wording that
-- tells floaters to read flow changes as rain. Releases, not rain, move that
-- water.
--
-- Splitting the Black into two rivers rows would fix the semantics and break the
-- product: one river should stay one page, one slug, one search result. So the
-- reach becomes a river_sections row instead. river_sections already drives
-- per-section Eddy updates (the Current and Meramec run upper/lower this way),
-- it just had no way to say *where* a section is, *what* gauge reads it, or
-- *how* its water behaves.
--
-- Every column added here is nullable and every existing row keeps NULL, so the
-- other 24 rivers and the four existing Current/Meramec sections are unaffected.

-- ─────────────────────────────────────────────────────────────────────────────
-- Reach columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE river_sections
    -- Bounds are in the SAME frame as access_points.river_mile_downstream --
    -- "mile from headwaters, hand-entered" -- because that is what callers pass
    -- as get_river_condition_segment(p_put_in_mile), via get_float_segment's
    -- start_river_mile. It is NOT the geometry frame: on the Black those two
    -- differ by ~8 miles, and river_gauges.river_mile is in a third frame again
    -- (Poplar Bluff is recorded at mile 55 but sits ~86 miles down the access
    -- frame). Mixing them is how a put-in below a dam ends up reading a gauge
    -- above it.
    ADD COLUMN IF NOT EXISTS river_mile_start NUMERIC,  -- NULL = unbounded upstream
    ADD COLUMN IF NOT EXISTS river_mile_end   NUMERIC,  -- NULL = unbounded downstream
    -- NULL = inherit rivers.river_type. Set only where a reach genuinely differs
    -- in hydrology, because this selects safety wording.
    ADD COLUMN IF NOT EXISTS river_type TEXT,
    -- NULL = fall back to the existing nearest-upstream-gauge rule.
    ADD COLUMN IF NOT EXISTS primary_gauge_station_id UUID REFERENCES gauge_stations(id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'river_sections_river_type_check'
    ) THEN
        ALTER TABLE river_sections
            ADD CONSTRAINT river_sections_river_type_check CHECK (
                river_type IS NULL OR river_type IN
                    ('spring_fed_float', 'dam_tailwater', 'rain_flashy', 'snowmelt', 'flatwater')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'river_sections_mile_order_check'
    ) THEN
        ALTER TABLE river_sections
            ADD CONSTRAINT river_sections_mile_order_check CHECK (
                river_mile_start IS NULL OR river_mile_end IS NULL
                OR river_mile_start < river_mile_end
            );
    END IF;
END $$;

COMMENT ON COLUMN river_sections.river_mile_start IS
    'Upstream bound, in access_points.river_mile_downstream miles. NULL = from the top of the river.';
COMMENT ON COLUMN river_sections.river_mile_end IS
    'Downstream bound, in access_points.river_mile_downstream miles. NULL = to the end of the river.';
COMMENT ON COLUMN river_sections.river_type IS
    'Per-reach override of rivers.river_type. NULL inherits. Drives RIVER_TYPE_GUIDANCE safety wording -- see the SAFETY note in src/lib/eddy/generate-update.ts.';
COMMENT ON COLUMN river_sections.primary_gauge_station_id IS
    'Gauge that actually reads this reach. Set it wherever a barrier (dam, major confluence) makes the nearest-upstream-gauge rule wrong. NULL keeps the default rule.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Populate the Black River's two existing reaches
-- ─────────────────────────────────────────────────────────────────────────────
--
-- These rows ALREADY EXIST and are already curated -- 'upper-lesterville' and
-- 'lower-markham-hammer'. This migration only fills in the three new columns; it
-- does not create, rename or re-describe anything. The lower reach's own
-- description already names Poplar Bluff 07063000 as its gauge and is candid
-- about the tradeoff (the Williamsville reach gauge 07062575 is discontinued, so
-- Poplar Bluff sits ~26 miles below with ~24% more drainage -- a sound
-- high-water ceiling, loose for optimal flows). We are encoding a choice the
-- curation had already reached in prose, not making a new one.
--
-- BOUNDS ARE HYDROLOGIC, NOT THE PUT-IN/TAKE-OUT PAIRS IN THE NAMES. The names
-- describe the popular float in each reach ("Markham Springs to Hammer"), which
-- spans miles 59.4-62.1. The bounds instead split the river at the dam, mile
-- 38.0, so that EVERY put-in resolves to the water it is actually sitting on.
-- Bounded to the named floats, River Road Park (mile 38.20) and Mill Spring
-- (50.60) -- the two accesses closest below a flood-control dam, the worst place
-- to be wrong -- would fall between the reaches and keep reading the gauge above
-- the dam. Bounds answer "which water is this", not "where do people launch".
--
-- The boundary of 38.0 is derived, not guessed: Clearwater Dam sits at fraction
-- 0.1649 along rivers.geom; interpolating between Hwy K Recreation Area
-- (fraction 0.0740, mile 25.00) and River Road Park (fraction 0.1664, mile
-- 38.20) puts the dam at mile 37.98. That independently reproduces River Road
-- Park being the first access below the dam, which it is.

UPDATE river_sections rs
SET river_mile_start = v.river_mile_start,
    river_mile_end   = v.river_mile_end,
    river_type       = v.river_type,
    primary_gauge_station_id =
        (SELECT gs.id FROM gauge_stations gs WHERE gs.usgs_site_id = v.gauge_site_id)
FROM (VALUES
    -- upper reach inherits the river's spring_fed_float, hence NULL river_type
    ('upper-lesterville',     NULL::numeric, 38.0::numeric, NULL::text,      '07061500'::text),
    ('lower-markham-hammer',  38.0::numeric, NULL::numeric, 'dam_tailwater', '07063000')
) AS v(section_slug, river_mile_start, river_mile_end, river_type, gauge_site_id)
WHERE rs.section_slug = v.section_slug
  AND rs.river_id = (SELECT id FROM rivers WHERE slug = 'black');

-- ─────────────────────────────────────────────────────────────────────────────
-- get_river_condition_segment: stop selecting a gauge across a barrier
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Everything below is VERBATIM from 00193 except the selected_gauge CTE, which
-- gains a section lookup ahead of the existing rules, and a resolved_mile CTE so
-- the lookup works whether the caller passed a mile or a point. When no section
-- matches, or the matching section has no gauge, the CASE falls through to the
-- 00193 behavior unchanged.

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
        FROM gauge_info gi
        LEFT JOIN latest_reading lr ON TRUE
    )
    SELECT
        CASE
            WHEN cv.is_flood THEN 'Dangerous - Do Not Float'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_black_id UUID;
    v_sections INTEGER;
    v_below_gauge TEXT;
    v_above_gauge TEXT;
BEGIN
    SELECT id INTO v_black_id FROM rivers WHERE slug = 'black';
    IF v_black_id IS NULL THEN
        RAISE NOTICE '00204: no black river row; skipping seed invariants';
        RETURN;
    END IF;

    -- We UPDATE existing rows, so a slug rename upstream would silently no-op.
    SELECT COUNT(*) INTO v_sections
    FROM river_sections
    WHERE river_id = v_black_id
      AND section_slug IN ('upper-lesterville', 'lower-markham-hammer');
    IF v_sections <> 2 THEN
        RAISE EXCEPTION
            '00204: expected the 2 curated Black reaches (upper-lesterville, lower-markham-hammer), found %',
            v_sections;
    END IF;

    SELECT gs.usgs_site_id INTO v_above_gauge
    FROM river_sections rs JOIN gauge_stations gs ON gs.id = rs.primary_gauge_station_id
    WHERE rs.river_id = v_black_id AND rs.section_slug = 'upper-lesterville';

    SELECT gs.usgs_site_id INTO v_below_gauge
    FROM river_sections rs JOIN gauge_stations gs ON gs.id = rs.primary_gauge_station_id
    WHERE rs.river_id = v_black_id AND rs.section_slug = 'lower-markham-hammer';

    IF v_above_gauge IS DISTINCT FROM '07061500' THEN
        RAISE EXCEPTION '00204: above-dam reach should read Annapolis 07061500, got %', v_above_gauge;
    END IF;
    IF v_below_gauge IS DISTINCT FROM '07063000' THEN
        RAISE EXCEPTION '00204: below-dam reach should read Poplar Bluff 07063000, got %', v_below_gauge;
    END IF;

    -- The reason this migration exists.
    IF NOT EXISTS (
        SELECT 1 FROM river_sections
        WHERE river_id = v_black_id AND section_slug = 'lower-markham-hammer'
          AND river_type = 'dam_tailwater'
    ) THEN
        RAISE EXCEPTION '00204: below-dam reach is not typed dam_tailwater';
    END IF;

    -- The bounds must actually cover the two accesses just below the dam, which
    -- is the whole point of making them hydrologic rather than float-shaped.
    IF NOT EXISTS (
        SELECT 1 FROM river_sections
        WHERE river_id = v_black_id AND section_slug = 'lower-markham-hammer'
          AND river_mile_start <= 38.20
          AND (river_mile_end IS NULL OR river_mile_end > 50.60)
    ) THEN
        RAISE EXCEPTION
            '00204: below-dam bounds do not cover River Road Park (38.20) and Mill Spring (50.60)';
    END IF;

    -- Every OTHER section on every other river must keep NULL reach columns.
    -- 18 rivers carry sections; only the Black is touched here.
    IF EXISTS (
        SELECT 1 FROM river_sections rs
        WHERE NOT (rs.river_id = v_black_id
                   AND rs.section_slug IN ('upper-lesterville', 'lower-markham-hammer'))
          AND (rs.river_type IS NOT NULL OR rs.primary_gauge_station_id IS NOT NULL
               OR rs.river_mile_start IS NOT NULL OR rs.river_mile_end IS NOT NULL)
    ) THEN
        RAISE EXCEPTION '00204: sections outside the Black River should keep NULL reach columns';
    END IF;
END $$;
