-- 00046_create_access_points_from_nps_campgrounds.sql
--
-- For every NPS campground that has no matching access point, create one.
-- Coordinates come directly from the nps_campgrounds table (NPS API data).
-- Name matching: strip "Campground" / "Group Campground" suffix, then ILIKE contains.

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Preview — show unmatched NPS campgrounds
-- ─────────────────────────────────────────────────────────────
SELECT
  cg.name AS nps_campground,
  cg.latitude,
  cg.longitude,
  cg.total_sites
FROM nps_campgrounds cg
WHERE cg.latitude IS NOT NULL
  AND cg.longitude IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM access_points ap
    WHERE ap.approved = true
      AND (
        LOWER(TRIM(ap.name)) LIKE '%' || LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) || '%'
        OR
        LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) LIKE '%' || LOWER(TRIM(ap.name)) || '%'
      )
  )
ORDER BY cg.name;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Create access points for unmatched NPS campgrounds
-- ─────────────────────────────────────────────────────────────
-- Uses NPS campground coordinates directly. Assigns to the nearest river.
-- Skips "Group Campground" variants (they share a location with the main campground).

INSERT INTO access_points (
  river_id,
  name,
  slug,
  location_orig,
  type,
  is_public,
  ownership,
  description,
  amenities,
  fee_required,
  approved,
  nps_campground_id
)
SELECT
  nearest_river.river_id,
  -- Use the clean name (without "Campground" suffix) as the access point name
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
    '\s+Campground$', '', 'i'
  )) AS name,
  -- Generate slug from clean name
  LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
        '\s+Campground$', '', 'i'
      )),
      '[^a-zA-Z0-9]+', '-', 'g'
    ),
    '^-+|-+$', '', 'g'
  )) AS slug,
  ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326) AS location_orig,
  'campground' AS type,
  true AS is_public,
  'NPS' AS ownership,
  COALESCE(cg.description, 'NPS campground within Ozark National Scenic Riverways.') AS description,
  CASE
    WHEN cg.total_sites > 20 THEN ARRAY['parking', 'restrooms', 'camping']
    ELSE ARRAY['parking', 'camping']
  END AS amenities,
  CASE WHEN COALESCE((cg.fees->0->>'cost')::numeric, 0) > 0 THEN true ELSE false END AS fee_required,
  true AS approved,
  cg.id AS nps_campground_id
FROM nps_campgrounds cg
-- Find the nearest river for each campground
CROSS JOIN LATERAL (
  SELECT r.id AS river_id
  FROM rivers r
  WHERE r.active = true
    AND r.geom IS NOT NULL
  ORDER BY ST_Distance(
    r.geom::geography,
    ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
  )
  LIMIT 1
) nearest_river
WHERE cg.latitude IS NOT NULL
  AND cg.longitude IS NOT NULL
  -- Skip Group Campground variants (share location with main campground)
  AND cg.name !~* '\sGroup\s+Campground$'
  -- Only create if no matching access point exists
  AND NOT EXISTS (
    SELECT 1 FROM access_points ap
    WHERE ap.approved = true
      AND (
        LOWER(TRIM(ap.name)) LIKE '%' || LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) || '%'
        OR
        LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) LIKE '%' || LOWER(TRIM(ap.name)) || '%'
      )
  )
ON CONFLICT (river_id, slug) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- STEP 3: Now run name matching for ALL campgrounds
-- ─────────────────────────────────────────────────────────────
-- This catches both the newly created access points and any
-- previously unmatched ones.

UPDATE access_points ap
SET nps_campground_id = match.cg_id
FROM (
  SELECT DISTINCT ON (cg.id)
    cg.id AS cg_id,
    ap2.id AS ap_id
  FROM nps_campgrounds cg
  JOIN access_points ap2 ON ap2.approved = true
  WHERE (
    LOWER(TRIM(ap2.name)) LIKE '%' || LOWER(TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
        '\s+Campground$', '', 'i'
      )
    )) || '%'
    OR
    LOWER(TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
        '\s+Campground$', '', 'i'
      )
    )) LIKE '%' || LOWER(TRIM(ap2.name)) || '%'
  )
  ORDER BY cg.id,
    CASE WHEN LOWER(TRIM(ap2.name)) = LOWER(TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
        '\s+Campground$', '', 'i'
      )
    )) THEN 0 ELSE 1 END
) match
WHERE ap.id = match.ap_id
  AND ap.nps_campground_id IS NULL;


-- ─────────────────────────────────────────────────────────────
-- STEP 4: Verify — show all campground matches
-- ─────────────────────────────────────────────────────────────
SELECT
  cg.name AS nps_campground,
  ap.name AS access_point,
  r.name AS river,
  ap.river_mile_downstream AS mile,
  ROUND(ST_Y(ap.location_orig)::numeric, 4) AS lat,
  ROUND(ST_X(ap.location_orig)::numeric, 4) AS lng
FROM nps_campgrounds cg
LEFT JOIN access_points ap ON ap.nps_campground_id = cg.id
LEFT JOIN rivers r ON ap.river_id = r.id
ORDER BY r.name NULLS LAST, ap.river_mile_downstream NULLS LAST;
