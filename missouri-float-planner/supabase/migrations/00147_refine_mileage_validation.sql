-- 00147_refine_mileage_validation.sql
-- First live run of validate_river_data() showed the mileage check was built
-- on a wrong assumption: access-point river miles use the published
-- float-guide datum (measured along the real, sinuous channel), while
-- rivers.length_miles is the length of the simplified geometry — on the
-- Meramec the real channel runs ~1.5× the simplified line, so stored miles
-- legitimately exceed length_miles. Comparing the two produced false
-- positives on correctly-curated points.
--
-- Replaced with checks that don't depend on reconciling the two datums:
--   mileage_order_mismatch  — stored-mile ordering must agree with the
--                             points' order along the geometry (catches
--                             wrong mile values without judging the datum)
--   access_point_not_snapped — approved points with no location_snap can't
--                             participate in mile/segment calculations
--   mileage_equals_length   — stored mile exactly equal to length_miles is
--                             the signature of a clamped placeholder

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
SELECT COALESCE(r.slug, gs.name), 'gauge_missing_site_id', 'error',
       'gauge_stations row has neither site_id_external nor usgs_site_id'
FROM gauge_stations gs
LEFT JOIN river_gauges rg ON rg.gauge_station_id = gs.id
LEFT JOIN rivers r ON r.id = rg.river_id
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

-- Approved points that never snapped to the river line can't participate in
-- mile/segment calculations (and are skipped by the distance check above).
UNION ALL
SELECT r.slug, 'access_point_not_snapped', 'warning',
       'access point "' || ap.name || '" has no location_snap' ||
       CASE WHEN ap.river_mile_downstream IS NOT NULL
            THEN ' but carries river_mile ' || ap.river_mile_downstream
            ELSE '' END
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true AND ap.location_snap IS NULL

-- Stored river-mile order must agree with the points' order along the river
-- geometry. Datum-agnostic: it never compares miles to length_miles (the
-- published float-mile datum legitimately exceeds simplified-geometry length).
-- Tolerance of 0.01 of the line absorbs snap jitter at near-identical miles.
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

-- A stored mile exactly equal to rivers.length_miles is the signature of a
-- value clamped by an import/snap script rather than curated.
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
