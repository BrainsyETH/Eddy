-- APPLIED to production 2026-08-04 as 20260804192753.
--
-- Give gauge_missing_site_id an entity key that a rename cannot move.
--
-- ── The identity problem ─────────────────────────────────────────────────
--
-- A finding's ledger identity is sha256(check_id | entity_type | entity_key |
-- rule_key). If the key moves, the old finding resolves as fixed and an
-- identical new one opens, both wrongly — the recurrence count resets, the
-- first_seen_at is lost, and "broken since March" becomes "found last night".
--
-- Every other rule in this function keys on r.slug, which is a slug and stable.
-- This one selected COALESCE(r.slug, gs.name), and it was wrong in two separate
-- ways:
--
--   1. For an UNLINKED gauge the key was the human display name. Editing
--      "Current River at Van Buren" to "Current River near Van Buren" forked
--      the finding's identity. normalizeEntityKey() in fingerprint.ts absorbs
--      case, punctuation and spacing, and its comment claimed this made the key
--      rename-safe; it does not. "at" and "near" are different tokens.
--
--   2. For a gauge linked to TWO rivers, the LEFT JOIN produced two rows for
--      one broken gauge, under two different river slugs — two findings, two
--      fingerprints, one problem, and fixing it closed both only by coincidence.
--      Eddy has exactly this arrangement: USGS 07014000 is correctly primary for
--      both Huzzah and Courtois (00164_fix_river_gauge_misassociations.sql:58).
--
-- gs.id is the gauge station's primary key. It cannot be renamed, it does not
-- depend on how many rivers reference the station, and it is the actual subject
-- of the rule — the finding is about a gauge_stations row, not about a river.
-- The joins are dropped with it, which is what removes the duplicate.
--
-- The display name moves into the detail, where it belongs and where it may
-- change freely: detail is deliberately excluded from the fingerprint precisely
-- so that the values which made a rule fire can move without forking identity.
--
-- ── Accepted churn ──────────────────────────────────────────────────────
--
-- Existing open gauge_missing_site_id findings change fingerprint, so the next
-- run resolves the old rows and raises equivalent new ones. That is a deliberate
-- one-time re-fingerprinting, recorded in docs/TRUST_LEDGER_V1_PLAN.md. The
-- affected population is small and the alternative — deriving a fingerprint
-- backfill from live data, correct only if run before the next check pass — is
-- more risk than the churn it avoids.
--
-- Everything else in this function is byte-identical to
-- 00164_harden_river_validation.sql. It is reproduced in full because
-- CREATE OR REPLACE FUNCTION has no partial form, not because it changed: the
-- twenty rules, their order, and their severities are untouched.

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
       'access point "' || ap.name || '" is ' ||
       round(ST_Distance(ap.location_snap::geography, r.geom::geography)::numeric) ||
       'm from the river line'
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true
  AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
  AND ST_Distance(ap.location_snap::geography, r.geom::geography) > 500

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
$$;
