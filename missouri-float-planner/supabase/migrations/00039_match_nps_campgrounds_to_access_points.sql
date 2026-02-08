-- Migration: Permanently link NPS campgrounds to access points by name
-- Handles edge cases like "Cedargrove" vs "Cedar Grove Campground"

-- Helper: strip suffix and normalize campground name
-- e.g. "Cedar Grove Campground" → "cedar grove"
--      "Akers Group Campground" → "akers"

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Preview matches
-- ─────────────────────────────────────────────────────────────
SELECT
  cg.name AS nps_campground,
  ap.name AS access_point,
  ap.id AS access_point_id,
  cg.id AS nps_campground_id
FROM nps_campgrounds cg
JOIN access_points ap ON (
  -- Match after stripping suffix
  LOWER(TRIM(ap.name)) = LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
      '\s+Campground$', '', 'i'
    )
  ))
  OR
  -- Match with ALL spaces removed (handles "Cedargrove" vs "Cedar Grove")
  REPLACE(LOWER(TRIM(ap.name)), ' ', '') = REPLACE(LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
      '\s+Campground$', '', 'i'
    )
  )), ' ', '')
  OR
  -- Contains match (campground name minus suffix contains access point name)
  LOWER(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
      '\s+Campground$', '', 'i'
    )
  )) LIKE '%' || LOWER(TRIM(ap.name)) || '%'
  OR
  -- Contains match (access point name contains campground name minus suffix)
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
-- STEP 2: Apply the matches
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
  WHERE ap2.approved = true
  ORDER BY ap2.id, cg.name
) match
WHERE ap.id = match.access_point_id;
