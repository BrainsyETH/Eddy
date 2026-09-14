-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-14 17:54:27 UTC and
-- RECORDED as 20260914175427; authored as 20260914183000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt.
--
-- Apply output: access_point_offline reported 0 findings (Echo Bluff excluded by
-- the launch gate, Buffalo City and Ha Ha Tonka by off_channel_reason);
-- mileage_segment_implausible reported 3 rivers — huzzah, meramec, niangua.
--
-- Teach the validator to see a bad river mile, and wake a rule that never fired.
--
-- ── WHAT WAS WRONG, ONE ─────────────────────────────────────────────────
--
-- `access_point_offline` measured ST_Distance(ap.location_snap, r.geom). But
-- location_snap is ST_LineInterpolatePoint output (00010_update_mile_calculations
-- .sql:36) — a point ON the line by construction — so that distance is ~0 for
-- every row in the table and the rule was arithmetically incapable of firing.
-- Measured on production 2026-09-14: snapped-to-line distance is 0.000-0.005 m
-- for all 309 approved points, while the real location_orig-to-line distance
-- reaches 1 001 m.
--
-- It shipped in 00146, survived a refinement in 00147, a hardening pass in
-- 00164 and a full reproduction in 20260804192753, and nobody noticed for the
-- same reason nobody notices any of these: zero findings and cannot produce
-- findings look identical from outside.
--
-- ── WHAT WAS WRONG, TWO ─────────────────────────────────────────────────
--
-- Nothing checked whether river_mile_downstream is the right SIZE.
-- `mileage_order_mismatch` checks that consecutive points are in the right
-- ORDER, and `mileage_equals_length` catches one clamped-placeholder shape.
-- Between them sits the defect this migration adds a rule for: a mile that
-- orders correctly and is simply wrong, which /api/plan then quotes to a reader
-- as a trip distance. get_float_segment computes distance_miles as
-- ABS(end_mile - start_mile) from this column (00142:103), so the number a
-- floater budgets their day against is exactly this arithmetic.
--
-- On the Niangua, Williams Ford Access to Moon Valley quotes 10.10 mi for
-- 1.55 mi of river line. A reader plans a full day for a half-hour paddle.
--
-- ── WHY THE RULE IS NOT "DISAGREES WITH GEOMETRY" ───────────────────────
--
-- The obvious check — compare the stored mile against
-- ST_LineLocatePoint(geom, pt) * length_miles — is WRONG here, and destructively
-- so. src/lib/geo/mile-index.ts:12-31 records that this column deliberately
-- carries two different things: geometry miles, and the EDITORIAL mile index a
-- river is actually described by on the outfitter maps and in the mile-by-mile
-- guides. The two diverge by design, and that file measures the divergence at a
-- median of 20 km on the Meramec, 19 km on the St. Francis, 17 km on the
-- Bourbeuse and 15 km on the Niangua, while landing within 5 m on the Current
-- and the James. A magnitude check against geometry would open a permanent
-- finding on every editorial-mile river and invite somebody to "fix" them by
-- recomputing, which would erase the index and the access-point control points
-- buildMileIndex uses to decode it.
--
-- What holds in BOTH systems is that a real channel is longer than a
-- generalisation of it. So the invariant is per-segment: the ratio of quoted
-- mileage to line mileage between consecutive launches should sit near 1.0-1.5,
-- and can never fall far below 1.0. Measured over 272 pairs on 2026-09-14:
--
--     ratio < 0.60  ......   6    impossible
--     0.60 - 0.90   ......  29    0.1-mi rounding on short segments
--     0.90 - 1.54   ..... 236    normal sinuosity
--     1.60 - 2.50   ......   0
--     ratio > 2.50  ......   1    Williams Ford -> Moon Valley, 6.51
--
-- The empty band between 1.54 and 6.51 is what makes a threshold defensible.
-- The rule fires outside 0.5-2.0, and only on a line segment of at least half a
-- mile. That floor is not a fudge: editorial miles are published to one decimal,
-- so on a short enough segment the rounding alone dominates the ratio in either
-- direction, and the floor is what keeps both the 0.60-0.90 band and the
-- symmetric high-side noise quiet. It costs nothing real — the shortest genuine
-- defect below names 1.44 mi of line.
--
-- ── ONE FINDING PER RIVER, DELIBERATELY ─────────────────────────────────
--
-- A finding is identified by sha256(check_id | entity_type | entity_key |
-- rule_key), and checks/validate-river-data.ts keys every row this function
-- returns on river_slug. Two bad segments on one river would therefore collide
-- on one fingerprint, and ledger.ts:165 builds its emitted map keyed by
-- fingerprint, so the second would silently overwrite the first. Every sibling
-- rule here has the same property and gets away with it because its steady
-- state is zero findings. This one does not: the Niangua currently has four bad
-- pairs. So the branch aggregates — one row per river, carrying the count and
-- every offending pair in the detail, which is excluded from the fingerprint
-- and may therefore churn freely.
--
-- ── OFF-CHANNEL IS A DECISION, NOT A WARNING ────────────────────────────
--
-- Waking access_point_offline naively would have opened two findings that are
-- permanently correct and permanently unactionable. Buffalo City is the
-- traditional Buffalo take-out and sits 1 001 m from that river line because it
-- is on the White River below the confluence; Ha Ha Tonka State Park sits 638 m
-- out on the Lake of the Ozarks arm.
--
-- 20260826174017_echo_bluff_is_on_sinking_creek.sql:138-150 already argued what
-- happens next: a finding that is permanently false "would eventually be
-- silenced by flipping the wrong flag". Permanent expected warnings also make
-- `npm run db:validate -- --strict` useless as a gate.
--
-- So two things gate the rule. It applies only where is_float_endpoint is true,
-- because distance from the channel is the right test for a put-in and the
-- wrong one for a park — the same reasoning
-- scripts/ingestion/import-dossier-access-points.ts already uses to print FAR
-- for every row but block only a launch. That alone excludes Echo Bluff, which
-- is not a launch. And off_channel_reason, added here, records the remaining
-- two as decisions with their reasons attached.
--
-- The 500 m threshold is unchanged; what changes is that it now measures a real
-- distance. Of the ten approved points beyond 250 m, the eight between 278 m and
-- 458 m are ordinary bank geometry and fall under it. So the expected steady
-- state of this rule is zero findings, and a clean
-- `npm run db:validate -- --strict` remains the bar.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
--
-- It corrects no data. The rule is expected to report roughly four rivers on
-- the run immediately after this lands; a follow-up migration repairs the rows
-- it names, one endpoint at a time and against a published source, because an
-- implausible pair condemns a SEGMENT and either of its two endpoints could be
-- the wrong one.
--
-- It also does not re-base any river onto geometry. See above.
--
-- ── ACCEPTED LIMITATION ─────────────────────────────────────────────────
--
-- The new branch inherits GeometryType(ST_LineMerge(...)) = 'LINESTRING' from
-- mileage_order_mismatch, so a river whose MultiLineString will not merge is
-- skipped in silence. That blind spot now exists in two rules rather than one.
-- It is recorded rather than fixed because merging is a property of the stored
-- geometry, not of this check, and every active river merges today.


-- ── The off-channel exception ───────────────────────────────────────────
ALTER TABLE public.access_points
    ADD COLUMN IF NOT EXISTS off_channel_reason TEXT;

COMMENT ON COLUMN public.access_points.off_channel_reason IS
    'Why this launch legitimately sits far from its river line. NULL means no '
    'exception has been recorded, which is the ordinary case. Set only where '
    'the distance is a fact about geography rather than a bad coordinate — a '
    'confluence take-out, a lake arm — and say which, because '
    'validate_river_data() stops reporting the row once this is non-null.';

UPDATE public.access_points ap
SET off_channel_reason = 'Take-out sits on the White River just below the Buffalo confluence; '
                         'the traditional end of a lower-river float.'
FROM public.rivers r
WHERE r.id = ap.river_id AND r.slug = 'buffalo' AND ap.slug = 'buffalo-city'
  AND ap.off_channel_reason IS NULL;

UPDATE public.access_points ap
SET off_channel_reason = 'Park access is on the Lake of the Ozarks arm rather than the '
                         'Niangua channel proper.'
FROM public.rivers r
WHERE r.id = ap.river_id AND r.slug = 'niangua' AND ap.slug = 'ha-ha-tonka-state-park'
  AND ap.off_channel_reason IS NULL;


CREATE OR REPLACE FUNCTION validate_river_data()
RETURNS TABLE (
    river_slug TEXT,
    check_name TEXT,
    severity TEXT,
    detail TEXT
)
LANGUAGE sql
STABLE
AS $$
SELECT r.slug, 'missing_timezone', 'error', 'rivers.timezone is null or empty'
FROM rivers r
WHERE r.active = true AND (r.timezone IS NULL OR r.timezone = '')

UNION ALL
SELECT r.slug, 'missing_state', 'error', 'rivers.state is null or empty'
FROM rivers r
WHERE r.active = true AND (r.state IS NULL OR r.state = '')

UNION ALL
SELECT r.slug, 'missing_river_type', 'error', 'rivers.river_type is null'
FROM rivers r
WHERE r.active = true AND r.river_type IS NULL

UNION ALL
SELECT r.slug, 'missing_geometry', 'error', 'rivers.geom is null'
FROM rivers r
WHERE r.active = true AND r.geom IS NULL

UNION ALL
SELECT r.slug, 'missing_characteristics', 'warning',
       'no river_characteristics row (Eddy prompts fall back to type defaults)'
FROM rivers r
LEFT JOIN river_characteristics rc ON rc.river_id = r.id
WHERE r.active = true AND rc.river_id IS NULL

UNION ALL
SELECT r.slug, 'missing_weather_point', 'warning',
       'no weather_lat/weather_lon (weather context unavailable for Eddy updates)'
FROM rivers r
WHERE r.active = true AND (r.weather_lat IS NULL OR r.weather_lon IS NULL)

UNION ALL
SELECT r.slug, 'missing_alert_terms', 'warning',
       'no alert_search_terms (NWS alerts cannot be matched to this river)'
FROM rivers r
WHERE r.active = true AND (r.alert_search_terms IS NULL OR array_length(r.alert_search_terms, 1) IS NULL)

UNION ALL
SELECT r.slug, 'ungauged_river', 'error',
       'no active river_gauges link — river cannot show a condition badge'
FROM rivers r
WHERE r.active = true
  AND NOT EXISTS (
      SELECT 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
      WHERE rg.river_id = r.id AND gs.active = true
  )

UNION ALL
SELECT r.slug, 'no_primary_gauge', 'error',
       'river has gauges but none marked is_primary'
FROM rivers r
WHERE r.active = true
  AND EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = r.id AND rg.is_primary = true)

UNION ALL
SELECT r.slug, 'threshold_order', 'error',
       'thresholds not strictly increasing on gauge ' || gs.name ||
       ' (' || COALESCE(rg.threshold_unit, 'ft') || ')'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true
  AND (
      (rg.level_too_low IS NOT NULL AND rg.level_low IS NOT NULL AND rg.level_too_low >= rg.level_low)
   OR (rg.level_low IS NOT NULL AND rg.level_optimal_min IS NOT NULL AND rg.level_low >= rg.level_optimal_min)
   OR (rg.level_optimal_min IS NOT NULL AND rg.level_optimal_max IS NOT NULL AND rg.level_optimal_min >= rg.level_optimal_max)
   OR (rg.level_optimal_max IS NOT NULL AND rg.level_dangerous IS NOT NULL AND rg.level_optimal_max >= rg.level_dangerous)
   OR (rg.level_high IS NOT NULL AND rg.level_dangerous IS NOT NULL AND rg.level_high >= rg.level_dangerous)
  )

UNION ALL
SELECT r.slug, 'missing_thresholds', 'error',
       'gauge ' || gs.name || ' has no thresholds set'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true
  AND rg.is_primary = true
  AND rg.level_too_low IS NULL AND rg.level_low IS NULL
  AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL

-- NEW (00164): primary gauge missing the TOP of its ladder. computeCondition()
-- only returns 'dangerous' when level_dangerous IS NOT NULL (no flood-stage
-- fallback), so a null here means the badge caps at 'high' at any flow. The
-- ladder guard (optimal_min OR high present) keeps this from firing on a gauge
-- that legitimately has no thresholds yet (already caught by missing_thresholds).
UNION ALL
SELECT r.slug, 'no_dangerous_anchor', 'warning',
       'primary gauge ' || gs.name || ' has no level_dangerous — the condition badge can never show "Dangerous" (it caps at High). Anchor it to a floater do-not-float level (NOT the NWS flood stage unless bank-full ≈ floater-danger on this reach).'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND rg.is_primary = true
  AND rg.level_dangerous IS NULL
  AND (rg.level_optimal_min IS NOT NULL OR rg.level_high IS NOT NULL)

-- NEW (00164): primary gauge with optimal_min but no optimal_max. The
-- 'flowing/ideal' band needs both bounds, so the whole floatable range
-- collapses into 'good' and the badge never shows Flowing. Accuracy, not safety.
UNION ALL
SELECT r.slug, 'no_optimal_max_anchor', 'warning',
       'primary gauge ' || gs.name || ' has optimal_min but no optimal_max — the badge can never show "Flowing/ideal" (the floatable range collapses to Good).'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND rg.is_primary = true
  AND rg.level_optimal_min IS NOT NULL AND rg.level_optimal_max IS NULL

-- NEW (00164): primary gauge missing the BOTTOM of its ladder. Without
-- level_too_low the badge can never show 'Too Low — Not Recommended'; low water
-- reads at best as 'Low'. Ladder guard as above.
UNION ALL
SELECT r.slug, 'no_too_low_anchor', 'warning',
       'primary gauge ' || gs.name || ' has no level_too_low — the badge can never show "Too Low" (bottom of the ladder).'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND rg.is_primary = true
  AND rg.level_too_low IS NULL
  AND (rg.level_optimal_min IS NOT NULL OR rg.level_low IS NOT NULL)

UNION ALL
SELECT r.slug, 'stale_gauge', 'warning',
       'gauge ' || gs.name || ' latest reading older than 24h (' ||
       COALESCE(to_char(latest.max_ts, 'YYYY-MM-DD HH24:MI'), 'never') || ')'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
LEFT JOIN LATERAL (
    SELECT MAX(gr.reading_timestamp) AS max_ts
    FROM gauge_readings gr
    WHERE gr.gauge_station_id = gs.id
) latest ON true
WHERE r.active = true AND gs.active = true AND rg.is_primary = true
  AND (latest.max_ts IS NULL OR latest.max_ts < now() - interval '24 hours')

UNION ALL
SELECT gs.id::text, 'gauge_missing_site_id', 'error',
       'gauge station "' || gs.name || '" has neither site_id_external nor usgs_site_id'
FROM gauge_stations gs
WHERE gs.active = true AND gs.site_id_external IS NULL AND gs.usgs_site_id IS NULL

UNION ALL
SELECT r.slug, 'access_point_offline', 'warning',
       'launch "' || ap.name || '" is ' ||
       round(ST_Distance(ap.location_orig::geography, r.geom::geography)::numeric) ||
       'm from the river line'
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true
  AND ap.is_float_endpoint = true
  AND ap.off_channel_reason IS NULL
  AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
  AND ST_Distance(ap.location_orig::geography, r.geom::geography) > 500

UNION ALL
SELECT r.slug, 'access_point_not_snapped', 'warning',
       'access point "' || ap.name || '" has no location_snap' ||
       CASE WHEN ap.river_mile_downstream IS NOT NULL
            THEN ' but carries river_mile ' || ap.river_mile_downstream
            ELSE '' END
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true AND ap.location_snap IS NULL

UNION ALL
SELECT river_slug, 'mileage_order_mismatch', 'warning', detail
FROM (
    SELECT r.slug AS river_slug,
           'access points "' || ap.name || '" (mile ' || ap.river_mile_downstream ||
           ') and "' || lead(ap.name) OVER w || '" (mile ' ||
           lead(ap.river_mile_downstream) OVER w ||
           ') are ordered differently along the river geometry' AS detail,
           ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry) AS frac,
           lead(ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry)) OVER w AS next_frac
    FROM access_points ap
    JOIN rivers r ON r.id = ap.river_id
    WHERE ap.approved = true AND r.active = true
      AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
      AND ap.river_mile_downstream IS NOT NULL
      AND GeometryType(ST_LineMerge(r.geom::geometry)) = 'LINESTRING'
    WINDOW w AS (PARTITION BY r.id ORDER BY ap.river_mile_downstream, ap.name)
) pairs
WHERE next_frac IS NOT NULL AND next_frac < frac - 0.01

UNION ALL
SELECT r.slug, 'mileage_equals_length', 'warning',
       'access point "' || ap.name || '" river_mile ' || ap.river_mile_downstream ||
       ' exactly equals rivers.length_miles — likely a clamped placeholder'
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true
  AND ap.river_mile_downstream IS NOT NULL AND r.length_miles IS NOT NULL
  AND ap.river_mile_downstream = r.length_miles

UNION ALL
SELECT river_slug, 'mileage_segment_implausible', 'warning',
       count(*)::text || ' segment(s) quote a mileage the river line cannot support: ' ||
       string_agg(detail, '; ' ORDER BY detail)
FROM (
    SELECT river_slug,
           '"' || nm || '" to "' || next_nm || '" quotes ' || round(edit_d, 2) ||
           ' mi against ' || round(geo_d, 2) || ' mi of line (ratio ' ||
           round(edit_d / geo_d, 2) || ')' AS detail
    FROM (
        SELECT river_slug, nm, next_nm,
               abs(next_mile - mile)::NUMERIC              AS edit_d,
               (abs(next_frac - frac) * len)::NUMERIC      AS geo_d
        FROM (
            SELECT r.slug AS river_slug,
                   ap.name AS nm,
                   ap.river_mile_downstream AS mile,
                   r.length_miles AS len,
                   lead(ap.name) OVER w AS next_nm,
                   lead(ap.river_mile_downstream) OVER w AS next_mile,
                   ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry) AS frac,
                   lead(ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry)) OVER w AS next_frac
            FROM access_points ap
            JOIN rivers r ON r.id = ap.river_id
            WHERE ap.approved = true AND r.active = true
              AND ap.is_float_endpoint = true
              AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
              AND ap.river_mile_downstream IS NOT NULL AND r.length_miles IS NOT NULL
              AND GeometryType(ST_LineMerge(r.geom::geometry)) = 'LINESTRING'
            WINDOW w AS (PARTITION BY r.id
                         ORDER BY ST_LineLocatePoint(ST_LineMerge(r.geom::geometry), ap.location_snap::geometry),
                                  ap.name)
        ) seg
        WHERE next_frac IS NOT NULL
    ) d
    -- The half-mile floor guards BOTH tails, and it has to. Editorial miles are
    -- published to one decimal, so on a segment of a few hundred feet the
    -- rounding alone swamps the ratio: Big Piney's Peck's Last Resort to
    -- Wilderness Ridge Resort quotes 0.10 mi against 0.04 mi of line and scores
    -- 2.38 without anything being wrong with either row. A ratio is only
    -- evidence once the segment is long enough to carry one.
    WHERE geo_d >= 0.5
      AND (edit_d / geo_d > 2.0 OR edit_d / geo_d < 0.5)
) flagged
GROUP BY river_slug
$$;


-- ── Verification ────────────────────────────────────────────────────────
DO $verify$
DECLARE
    populated    BOOLEAN;
    n_offline    INTEGER;
    n_implausible INTEGER;
    n_exceptions INTEGER;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
    IF NOT populated THEN
        RAISE NOTICE 'access_points is empty (from-scratch build); skipping data assertions.';
        RETURN;
    END IF;

    IF to_regprocedure('public.validate_river_data()') IS NULL THEN
        RAISE EXCEPTION 'validate_river_data() is missing after replacement';
    END IF;

    SELECT count(*) INTO n_exceptions
    FROM public.access_points WHERE off_channel_reason IS NOT NULL;
    IF n_exceptions < 2 THEN
        RAISE EXCEPTION 'expected at least 2 recorded off-channel exceptions, found %', n_exceptions;
    END IF;

    -- Both counts are REPORTED, never asserted to be zero. A non-zero count here
    -- is the rule working against data nothing has repaired yet, and the run
    -- immediately after this migration is the first time either rule has been
    -- able to say anything at all.
    SELECT count(*) INTO n_offline
    FROM validate_river_data() WHERE check_name = 'access_point_offline';

    SELECT count(*) INTO n_implausible
    FROM validate_river_data() WHERE check_name = 'mileage_segment_implausible';

    RAISE NOTICE 'access_point_offline now reports % finding(s); it reported 0 before, '
                 'because it measured a point that lies on the line.', n_offline;
    RAISE NOTICE 'mileage_segment_implausible reports % river(s) with at least one '
                 'implausible segment.', n_implausible;
    RAISE NOTICE 'off_channel_reason recorded on % access point(s).', n_exceptions;
END
$verify$;
