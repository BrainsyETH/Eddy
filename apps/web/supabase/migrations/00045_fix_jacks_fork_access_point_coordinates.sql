-- 00045_match_jacks_fork_nps_campgrounds_by_name.sql
--
-- Match ALL Jacks Fork access points to NPS campgrounds by name only.
-- No geo matching — coordinates are unreliable for most access points.
-- Strip "Campground" / "Group Campground" suffix from NPS name, then
-- check if the access point name contains it or vice versa.
--
-- For Blue Spring specifically, also copy the NPS coordinates to fix
-- the access point location (confirmed wrong from import).

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Name-match all Jacks Fork campgrounds to access points
-- ─────────────────────────────────────────────────────────────
UPDATE access_points ap
SET nps_campground_id = match.cg_id
FROM (
  SELECT DISTINCT ON (cg.id)
    cg.id AS cg_id,
    cg.name AS cg_name,
    ap2.id AS ap_id,
    ap2.name AS ap_name
  FROM nps_campgrounds cg
  JOIN access_points ap2 ON ap2.approved = true
  JOIN rivers r ON r.id = ap2.river_id AND r.slug = 'jacks-fork'
  WHERE (
    -- Strip "Campground" / "Group Campground" suffix, then check contains
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
    -- Prefer exact match over contains
    CASE WHEN LOWER(TRIM(ap2.name)) = LOWER(TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
        '\s+Campground$', '', 'i'
      )
    )) THEN 0 ELSE 1 END
) match
WHERE ap.id = match.ap_id;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Fix Blue Spring access point coordinates from NPS data
-- ─────────────────────────────────────────────────────────────
-- Blue Spring's location_orig is wrong (placed near Winona by import script).
-- Copy verified coordinates from its matched NPS campground.
UPDATE access_points ap
SET location_orig = ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326),
    location_snap = NULL
FROM nps_campgrounds cg
WHERE ap.nps_campground_id = cg.id
  AND ap.river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork')
  AND (ap.slug = 'blue-spring' OR ap.name ILIKE '%Blue Spring%')
  AND cg.latitude IS NOT NULL
  AND cg.longitude IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Verify all matches
-- ─────────────────────────────────────────────────────────────
SELECT
  ap.name AS access_point,
  cg.name AS matched_campground,
  ap.river_mile_downstream AS mile
FROM access_points ap
LEFT JOIN nps_campgrounds cg ON ap.nps_campground_id = cg.id
JOIN rivers r ON ap.river_id = r.id
WHERE r.slug = 'jacks-fork'
ORDER BY ap.river_mile_downstream;
