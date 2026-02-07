-- Migration: Permanently link NPS campgrounds to access points by name
-- Run the SELECT first to verify matches, then uncomment the UPDATE block.

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Preview matches (run this first to confirm)
-- ─────────────────────────────────────────────────────────────
SELECT
  cg.name AS nps_campground,
  ap.name AS access_point,
  ap.id AS access_point_id,
  cg.id AS nps_campground_id
FROM nps_campgrounds cg
JOIN access_points ap ON (
  -- Exact match after stripping "Campground" / "Group Campground" suffix
  LOWER(TRIM(ap.name)) = LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
      '\s+Campground$', '', 'i'
    )
  ))
  OR
  -- Access point name is contained in campground name (minus suffix)
  LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
      '\s+Campground$', '', 'i'
    )
  )) LIKE '%' || LOWER(TRIM(ap.name)) || '%'
  OR
  -- Campground name (minus suffix) is contained in access point name
  LOWER(TRIM(ap.name)) LIKE '%' || LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
      '\s+Campground$', '', 'i'
    )
  )) || '%'
)
WHERE ap.approved = true
ORDER BY cg.name;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Apply the matches (run after confirming STEP 1)
-- ─────────────────────────────────────────────────────────────
UPDATE access_points ap
SET nps_campground_id = match.nps_campground_id
FROM (
  SELECT DISTINCT ON (ap2.id)
    ap2.id AS access_point_id,
    cg.id AS nps_campground_id
  FROM nps_campgrounds cg
  JOIN access_points ap2 ON (
    LOWER(TRIM(ap2.name)) = LOWER(TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
        '\s+Campground$', '', 'i'
      )
    ))
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
  WHERE ap2.approved = true
  ORDER BY ap2.id, cg.name
) match
WHERE ap.id = match.access_point_id;
