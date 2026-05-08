-- scripts/diagnose-map-alignment.sql
--
-- Run this in the Supabase SQL editor to figure out why
-- /missouri-surface-water markers don't sit on the rendered river lines.
--
-- It answers four questions:
--   1. Is rivers.geom the real NHD HR import (00116) or still a stub?
--   2. Are access points snapped against current rivers.geom or stale?
--   3. Do POIs / campgrounds have location_snap populated (00117)?
--   4. How far are the markers from the nearest river right now?
--
-- Paste each section in order. The expected post-fix shape is in the
-- comment under each block.

-- ── 1. River geometry vert counts ─────────────────────────────────────
-- After 00116 a curated MO float should have 150–650 vertices and length
-- close to the real NHD HR length. Stub geometry is 14–40 vertices.
SELECT
  slug,
  ST_NPoints(geom) AS verts,
  ROUND((ST_Length(geom::geography) / 1609.34)::numeric, 1) AS length_mi,
  CASE
    WHEN ST_NPoints(geom) < 60 THEN 'STUB (re-run 00116)'
    ELSE 'NHD HR'
  END AS verdict
FROM rivers
WHERE active = true
ORDER BY slug;

-- ── 2. Access-point snap freshness ────────────────────────────────────
-- distance_now_m = distance from location_snap to the *current* river
-- geom. If 00116 has been re-run since the last snap, snaps that were
-- valid before (sub-meter distance to old geom) will now show non-zero
-- distance to the new geom — those need a re-snap via
-- scripts/snap-access-points.ts.
SELECT
  r.slug,
  COUNT(*) AS access_points,
  ROUND(AVG(ST_Distance(
    ap.location_snap::geography,
    ST_ClosestPoint(r.geom, ap.location_snap)::geography
  ))::numeric, 1) AS avg_distance_to_river_m,
  COUNT(*) FILTER (WHERE
    ST_Distance(
      ap.location_snap::geography,
      ST_ClosestPoint(r.geom, ap.location_snap)::geography
    ) > 50
  ) AS stale_snaps_over_50m
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.location_snap IS NOT NULL
GROUP BY r.slug
ORDER BY r.slug;

-- ── 3. POI / campground snap coverage (00117) ─────────────────────────
-- Both should be all non-null after 00117 runs (modulo features outside
-- the 1500 m snap window).
SELECT
  'points_of_interest' AS table_name,
  COUNT(*) AS total,
  COUNT(location_snap) AS snapped,
  COUNT(*) FILTER (WHERE location_snap IS NULL AND latitude IS NOT NULL) AS missing_snap
FROM points_of_interest
WHERE active = true
UNION ALL
SELECT
  'nps_campgrounds',
  COUNT(*),
  COUNT(location_snap),
  COUNT(*) FILTER (WHERE location_snap IS NULL AND latitude IS NOT NULL)
FROM nps_campgrounds
WHERE latitude IS NOT NULL;

-- ── 4. Outliers (markers far from any river) ─────────────────────────
-- After 00117 the worst offenders by raw distance are surfaced here so
-- you can decide whether they should snap or stay free-floating.
SELECT
  poi.name,
  poi.type,
  r.slug,
  ROUND(poi.snap_distance_m::numeric, 0) AS distance_m,
  CASE WHEN poi.location_snap IS NOT NULL THEN 'snapped' ELSE 'raw lat/lon' END AS state
FROM points_of_interest poi
LEFT JOIN rivers r ON r.id = poi.river_id
WHERE poi.active = true AND poi.snap_distance_m IS NOT NULL
ORDER BY poi.snap_distance_m DESC
LIMIT 20;
