-- Link NPS campgrounds to Jacks Fork access points by name + proximity.
-- Run after access_points seed (and after nps_campgrounds is populated by sync).
-- Idempotent: only sets nps_campground_id where it is NULL.

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
