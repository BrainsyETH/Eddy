-- One-time: link NPS campgrounds to Jacks Fork access points
-- Run this in Supabase SQL Editor AFTER you have:
--   1. Run the NPS sync (POST /api/cron/sync-nps) so nps_campgrounds is populated
--   2. Jacks Fork access points exist (Blue Spring, Alley Spring, etc.)
--
-- If nothing links, run the diagnostic below to see distances/names.

-- Apply links (same logic as 00044 / seed jacks_fork_nps_links)
UPDATE access_points ap
SET nps_campground_id = match.nps_campground_id
FROM (
  SELECT DISTINCT ON (ap2.id)
    ap2.id AS access_point_id,
    cg.id AS nps_campground_id
  FROM nps_campgrounds cg
  JOIN access_points ap2 ON ap2.approved = true
  JOIN rivers r ON r.id = ap2.river_id AND r.slug = 'jacks-fork'
  WHERE
    (
      LOWER(TRIM(ap2.name)) = LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      ))
      OR
      REPLACE(LOWER(TRIM(ap2.name)), ' ', '') = REPLACE(LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )), ' ', '')
      OR
      LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )) LIKE '%' || LOWER(TRIM(ap2.name)) || '%'
      OR
      LOWER(TRIM(ap2.name)) LIKE '%' || LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )) || '%'
    )
    AND cg.latitude IS NOT NULL
    AND cg.longitude IS NOT NULL
    AND ST_DWithin(
      COALESCE(ap2.location_snap, ap2.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography,
      15000
    )
  ORDER BY ap2.id,
    CASE
      WHEN LOWER(TRIM(ap2.name)) = LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )) THEN 0
      ELSE 1
    END,
    ST_Distance(
      COALESCE(ap2.location_snap, ap2.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
    )
) match
WHERE ap.id = match.access_point_id
  AND ap.nps_campground_id IS NULL;

-- Show result: Jacks Fork access points and their NPS link
SELECT
  ap.name AS access_point,
  ap.nps_campground_id,
  cg.name AS nps_campground,
  ROUND((ST_Distance(
    COALESCE(ap.location_snap, ap.location_orig)::geography,
    cg.location::geography
  ) / 1000.0)::numeric, 2) AS distance_km
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id AND r.slug = 'jacks-fork'
LEFT JOIN nps_campgrounds cg ON cg.id = ap.nps_campground_id
WHERE ap.approved = true
ORDER BY ap.name;
