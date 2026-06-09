-- 00040_assign_rivers_to_pois.sql
--
-- Helper RPC for computing river mile from sync code.
-- Accounts for geometry_starts_at_headwaters flag (same logic as access points).
CREATE OR REPLACE FUNCTION compute_poi_river_mile(
  p_poi_id UUID,
  p_river_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS TABLE(river_mile DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN COALESCE(r.geometry_starts_at_headwaters, TRUE) THEN
        r.length_miles * ST_LineLocatePoint(
          r.geom,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
        )
      ELSE
        r.length_miles * (1.0 - ST_LineLocatePoint(
          r.geom,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
        ))
    END AS river_mile
  FROM rivers r
  WHERE r.id = p_river_id
    AND r.geom IS NOT NULL
    AND r.length_miles IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

--
-- One-time fix: Assign river_id and river_mile to existing POIs
-- that have coordinates but no river assignment.
--
-- This uses PostGIS to find the nearest river within 2km (generous buffer
-- for springs/caves that may be slightly off the river corridor).
-- Then computes river_mile by projecting the POI onto the river line.

-- Step 1: Preview — see which POIs would match
SELECT
  poi.name,
  poi.type,
  poi.latitude,
  poi.longitude,
  poi.river_id AS current_river_id,
  r.name AS matched_river,
  r.id AS river_id,
  ST_Distance(
    r.geom::geography,
    ST_SetSRID(ST_MakePoint(poi.longitude, poi.latitude), 4326)::geography
  ) AS distance_meters
FROM points_of_interest poi
CROSS JOIN LATERAL (
  SELECT r2.id, r2.name, r2.geom
  FROM rivers r2
  WHERE r2.active = true
    AND r2.geom IS NOT NULL
    AND ST_DWithin(
      r2.geom::geography,
      ST_SetSRID(ST_MakePoint(poi.longitude, poi.latitude), 4326)::geography,
      2000  -- 2km buffer
    )
  ORDER BY ST_Distance(
    r2.geom::geography,
    ST_SetSRID(ST_MakePoint(poi.longitude, poi.latitude), 4326)::geography
  )
  LIMIT 1
) r
WHERE poi.latitude IS NOT NULL
  AND poi.longitude IS NOT NULL
ORDER BY r.name, distance_meters;

-- Step 2: Actually assign river_id to POIs
-- Run this after reviewing the SELECT above
/*
UPDATE points_of_interest poi
SET
  river_id = sub.river_id,
  is_on_water = true,
  active = true
FROM (
  SELECT
    poi2.id AS poi_id,
    r.id AS river_id
  FROM points_of_interest poi2
  CROSS JOIN LATERAL (
    SELECT r2.id, r2.geom
    FROM rivers r2
    WHERE r2.active = true
      AND r2.geom IS NOT NULL
      AND ST_DWithin(
        r2.geom::geography,
        ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)::geography,
        2000
      )
    ORDER BY ST_Distance(
      r2.geom::geography,
      ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)::geography
    )
    LIMIT 1
  ) r
  WHERE poi2.latitude IS NOT NULL
    AND poi2.longitude IS NOT NULL
) sub
WHERE poi.id = sub.poi_id;
*/

-- Step 3: Compute river_mile for POIs that have a river_id
-- Accounts for geometry_starts_at_headwaters flag (same as access points).
/*
UPDATE points_of_interest poi
SET river_mile = sub.computed_mile
FROM (
  SELECT
    poi2.id AS poi_id,
    CASE
      WHEN COALESCE(r.geometry_starts_at_headwaters, TRUE) THEN
        r.length_miles * ST_LineLocatePoint(
          r.geom,
          ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)
        )
      ELSE
        r.length_miles * (1.0 - ST_LineLocatePoint(
          r.geom,
          ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)
        ))
    END AS computed_mile
  FROM points_of_interest poi2
  JOIN rivers r ON r.id = poi2.river_id
  WHERE poi2.river_id IS NOT NULL
    AND poi2.latitude IS NOT NULL
    AND poi2.longitude IS NOT NULL
    AND r.geom IS NOT NULL
    AND r.length_miles IS NOT NULL
) sub
WHERE poi.id = sub.poi_id;
*/
