-- Validate a river against its water regime, not against one regime's rules.
--
-- ── The blocker this removes ───────────────────────────────────────────────
-- A dam tailwater's level IS the release. It has no rain-driven floatable
-- range to calibrate, so it ships with no threshold ladder — and today that
-- makes it impossible to activate at all. Not "noisy": impossible. Both routes
-- are errors, and activate-rivers.ts rolls back on any error:
--
--   primary gauge, no thresholds  →  missing_thresholds   (error)
--   gauges but none primary       →  no_primary_gauge     (error)
--
-- The three anchor checks added in 00164 are only warnings, and each carries a
-- ladder guard (optimal_min OR high present), so they fire on a PARTIAL ladder
-- and stay quiet on an absent one. That made the situation look milder than it
-- is: reading 00164 alone suggests a ladder-less tailwater merely warns. It
-- cannot launch.
--
-- ── Why exempting is not enough ────────────────────────────────────────────
-- Deleting the ladder checks for one regime would leave a tailwater validated
-- by almost nothing, and Wave-1 lesson #7 is precisely that a validator which
-- passes a river it never really examined is worse than one that fails: five
-- rivers shipped "green" while their badges could not express the top or the
-- bottom of their own range. So each inapplicable check is REPLACED, in the
-- same launch gate, by one that means something for a release-driven reach:
--
--   ordinary river   → primary gauge + threshold ladder      (unchanged)
--   dam tailwater    → a live release source, fresh readings,
--                      and no ungated condition badge
--
-- ── What is deliberately NOT here ──────────────────────────────────────────
-- "The badge must stay disabled until a local rating is calibrated" cannot be
-- enforced in SQL, because nothing in the schema records that a rating was
-- calibrated, and computeCondition() has no concept of river_type — it grades
-- whatever thresholds it is handed. So tailwater_badge_ungated is a WARNING
-- that names the hazard rather than an error pretending to prevent it: a
-- tailwater whose primary gauge carries thresholds IS being graded, and the
-- numbers being graded are dam-release numbers. Making the badge itself
-- regime-aware is a rendering change (shared/condition-system.ts), not a
-- validation one, and it is not attempted here.
--
-- Verified read-only against production before writing: all four new checks
-- return zero rows today, so this is additive — no active river starts failing.

CREATE OR REPLACE FUNCTION public.validate_river_data()
 RETURNS TABLE(river_slug text, check_name text, severity text, detail text)
 LANGUAGE sql
 STABLE
AS $function$
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

-- REGIME-SCOPED (this migration): a dam tailwater has no rain-driven floatable
-- range to calibrate, so an absent ladder is its correct shape, not an omission.
-- Every other regime still fails here.
UNION ALL
SELECT r.slug, 'missing_thresholds', 'error',
       'gauge ' || gs.name || ' has no thresholds set'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true
  AND r.river_type IS DISTINCT FROM 'dam_tailwater'
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
  AND r.river_type IS DISTINCT FROM 'dam_tailwater'
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
  AND r.river_type IS DISTINCT FROM 'dam_tailwater'
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
  AND r.river_type IS DISTINCT FROM 'dam_tailwater'
  AND rg.level_too_low IS NULL
  AND (rg.level_optimal_min IS NOT NULL OR rg.level_low IS NOT NULL)

-- NEW: a tailwater with no live release source is ungauged in the only way
-- that matters to it. The ungauged_river check above passes on ANY active
-- link, so a tailwater carrying only a water-quality station or a distant
-- downstream gauge would read as gauged while nothing published its release.
UNION ALL
SELECT r.slug, 'tailwater_no_release_source', 'error',
       'river_type is dam_tailwater but no active gauge is linked with role = release — the reach has no source for the flow that actually drives it'
FROM rivers r
WHERE r.active = true AND r.river_type = 'dam_tailwater'
  AND NOT EXISTS (
      SELECT 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
      WHERE rg.river_id = r.id AND gs.active = true AND rg.role = 'release'
  )

-- NEW: the tailwater must name the dam it is below…
UNION ALL
SELECT r.slug, 'tailwater_no_controlling_dam', 'error',
       'river_type is dam_tailwater but rivers.controlling_dam_id is null — nothing states which project''s release this reach carries'
FROM rivers r
WHERE r.active = true AND r.river_type = 'dam_tailwater'
  AND (r.controlling_dam_id IS NULL OR r.controlling_dam_id = '')

-- …and the release attached to it must be that dam's.
--
-- The check `provider = 'usace'` could not make: it proves a row came from the
-- Corps, not that it came from THIS project. Norfork Dam is also SWL, also
-- usace, and also releases into this same river 45 miles downstream — so on
-- the one river where the mistake is easiest to make, the old rule would have
-- passed it.
UNION ALL
SELECT r.slug, 'tailwater_release_wrong_dam', 'error',
       'release gauge ' || COALESCE(gs.site_id_external, gs.name) ||
       ' does not belong to ' || r.controlling_dam_id ||
       ' — this reach would describe another project''s water'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND r.river_type = 'dam_tailwater'
  AND rg.role = 'release'
  AND r.controlling_dam_id IS NOT NULL
  AND gs.site_id_external IS DISTINCT FROM r.controlling_dam_id

-- NEW: release freshness, tighter than the 24h stale_gauge warning below.
-- CWMS publishes hourly and usace-registry defaults to an 8h lookback, so 12h
-- clears the documented publication lag while still catching a feed that
-- stopped overnight — on a peaking hydro tailwater, a day-old release figure
-- describes water that has long since passed.
UNION ALL
SELECT r.slug, 'tailwater_release_stale', 'warning',
       'release station ' || gs.name || ' has no reading newer than 12h (' ||
       COALESCE(to_char(latest.max_ts, 'YYYY-MM-DD HH24:MI'), 'never') || ')'
FROM rivers r
JOIN river_gauges rg ON rg.river_id = r.id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
LEFT JOIN LATERAL (
    SELECT MAX(gr.reading_timestamp) AS max_ts
    FROM gauge_readings gr
    WHERE gr.gauge_station_id = gs.id
) latest ON true
WHERE r.active = true AND r.river_type = 'dam_tailwater'
  AND gs.active = true AND gs.provider = 'usace'
  AND (latest.max_ts IS NULL OR latest.max_ts < now() - interval '12 hours')

-- NEW: an ungated condition badge on a tailwater. ERROR, and unwaivable by
-- construction — the only way past it is an approval that carries provenance.
--
-- This was a warning in an earlier draft, on the reasoning that thresholds
-- might one day be correct here and an error would block a legitimate future
-- state. That reasoning was wrong in the direction that matters. A waivable
-- finding is a suppressible one, and what it suppresses is a condition badge
-- grading release-at-dam cfs with float vocabulary, read by someone deciding
-- whether to stand in the water. `computeCondition()` is river_type-blind and
-- grades whatever it is handed, so nothing downstream catches this.
--
-- The future state still has its path: populate condition_rating_approved_by,
-- _at and _source (migration 20260812210000) with the location-specific rating
-- that justifies the numbers. Approval with provenance is a different act from
-- clearing an error, which is the whole point of requiring all three.
UNION ALL
SELECT r.slug, 'tailwater_badge_ungated', 'error',
       'gauge ' || gs.name || ' carries thresholds on a dam_tailwater river with no approved condition rating — the badge would grade release values as float conditions. Clear the thresholds, or record condition_rating_approved_by/_at/_source for the local rating that justifies them.'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND r.river_type = 'dam_tailwater'
  AND (rg.level_too_low IS NOT NULL OR rg.level_low IS NOT NULL
       OR rg.level_optimal_min IS NOT NULL OR rg.level_optimal_max IS NOT NULL
       OR rg.level_high IS NOT NULL OR rg.level_dangerous IS NOT NULL)
  AND (rg.condition_rating_approved_by IS NULL
       OR rg.condition_rating_approved_at IS NULL
       OR rg.condition_rating_source IS NULL)

-- NEW: the primary gauge of a tailwater must be its release.
--
-- The generalisation of a rule that would otherwise live once per river in a
-- data migration. On a reach whose level IS the release, promoting a
-- downstream gauge to primary means the river's headline number describes
-- water measured miles away, after travel, tributaries and time — and on the
-- White River, after a second dam.
UNION ALL
SELECT r.slug, 'tailwater_primary_not_release', 'error',
       'primary gauge ' || gs.name || ' has role ' || COALESCE(rg.role, 'none') ||
       ', not release — the river''s headline flow would describe water measured downstream rather than what the dam let out'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND r.river_type = 'dam_tailwater' AND rg.is_primary = true
  AND rg.role IS DISTINCT FROM 'release'

-- NEW: a downstream gauge draining materially more than the dam releases.
--
-- Named for what it MEASURES, not for what it suggests. An earlier draft called
-- this `post_confluence`, which is the inference rather than the observation —
-- and a check named after its own conclusion is how a heuristic quietly
-- becomes a fact. Extra drainage may mean a major confluence; it may also mean
-- a long reach of ordinary tributary inflow. The finding says what it saw.
--
-- Drainage area is the arithmetic that makes it checkable rather than
-- editorial. Bull Shoals releases 6,050 sq mi of drainage; USGS 07057370 reads
-- 8,040 having taken the North Fork — which is another dam's releases — and
-- 07060500 reads 9,980 having also taken the Buffalo. Both are useful for the
-- reaches they sit on and neither describes the water below the dam.
--
-- 10% is a heuristic calibrated on the one pair Eddy has measured end to end:
-- Clearwater released 3,561 cfs while Poplar Bluff read 3,380, ~5% apart, and
-- that gauge drains about a third more than the dam. So the threshold is a
-- prompt to look, not a boundary between safe and unsafe.
--
-- A warning, not an error: carrying such a gauge is correct, and the primary
-- rule above already blocks the dangerous version. What this refuses to allow
-- is carrying one SILENTLY, with its divergence recorded only in a migration
-- comment nobody reads at activation time.
UNION ALL
SELECT r.slug, 'tailwater_gauge_drainage_divergence', 'warning',
       'gauge ' || gs.name || ' drains ' || round(gs.drainage_area_sqmi) ||
       ' sq mi against the release''s ' || round(rel.drainage_area_sqmi) ||
       ' (+' || round((gs.drainage_area_sqmi / rel.drainage_area_sqmi - 1) * 100) ||
       '%) — it carries water this dam did not release, which may indicate tributary or confluence influence. Confirm what reach it may represent before any surface presents it as conditions below the dam.'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
JOIN LATERAL (
    SELECT gs2.drainage_area_sqmi
    FROM river_gauges rg2
    JOIN gauge_stations gs2 ON gs2.id = rg2.gauge_station_id
    WHERE rg2.river_id = r.id AND rg2.role = 'release'
    LIMIT 1
) rel ON true
WHERE r.active = true AND r.river_type = 'dam_tailwater'
  AND rg.role = 'downstream'
  AND gs.drainage_area_sqmi IS NOT NULL
  AND rel.drainage_area_sqmi IS NOT NULL
  AND gs.drainage_area_sqmi > rel.drainage_area_sqmi * 1.10

-- NEW (all regimes): a primary gauge that cannot publish stage or discharge.
-- The Bull Shoals research proposed exactly this — three USGS stations below
-- the dam that report only water temperature and dissolved oxygen — and
-- nothing in the schema would have objected. parameter_codes is only populated
-- for catalogued USGS stations, so the IS NOT NULL guard keeps usace and nws
-- stations (which carry none) out of it rather than failing them blind.
UNION ALL
SELECT r.slug, 'primary_gauge_no_flow_params', 'error',
       'primary gauge ' || gs.name || ' publishes neither discharge (00060) nor gage height (00065) — it cannot produce a reading the condition system can read'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true AND rg.is_primary = true
  AND gs.parameter_codes IS NOT NULL
  AND NOT (gs.parameter_codes && ARRAY['00060','00065'])

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
$function$;
