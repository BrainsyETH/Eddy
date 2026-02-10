-- Diagnostic: why Jacks Fork access points might not have NPS campground links
-- Run in Supabase SQL Editor.

-- 1) Jacks Fork access points and current link
SELECT
  ap.name AS access_point,
  ap.nps_campground_id IS NOT NULL AS has_link,
  cg.name AS linked_campground
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id AND r.slug = 'jacks-fork'
LEFT JOIN nps_campgrounds cg ON cg.id = ap.nps_campground_id
WHERE ap.approved = true
ORDER BY ap.name;

-- 2) NPS campgrounds with "Blue" or "Alley" in name (candidates for Jacks Fork)
SELECT
  cg.name,
  cg.latitude,
  cg.longitude,
  cg.latitude IS NOT NULL AND cg.longitude IS NOT NULL AS has_coords
FROM nps_campgrounds cg
WHERE cg.name ILIKE '%blue%' OR cg.name ILIKE '%alley%'
ORDER BY cg.name;

-- 3) Distance from Blue Spring (Jacks Fork) access point to each NPS campground with "Blue" in name
-- If distance_km > 5, the 5km proximity filter is why it didn't link.
SELECT
  cg.name AS nps_campground,
  ROUND((ST_Distance(
    (SELECT COALESCE(ap.location_snap, ap.location_orig) FROM access_points ap
     JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'jacks-fork' AND ap.name ILIKE '%Blue Spring%' LIMIT 1)::geography,
    ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
  ) / 1000.0)::numeric, 2) AS distance_km,
  CASE WHEN ST_Distance(
    (SELECT COALESCE(ap.location_snap, ap.location_orig) FROM access_points ap
     JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'jacks-fork' AND ap.name ILIKE '%Blue Spring%' LIMIT 1)::geography,
    ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
  ) <= 15000 THEN 'would link' ELSE 'too far (>15km)' END AS link_status
FROM nps_campgrounds cg
WHERE cg.name ILIKE '%blue%'
  AND cg.latitude IS NOT NULL
  AND cg.longitude IS NOT NULL;
