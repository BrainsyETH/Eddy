-- 00044_fix_jacks_fork_gauge_names_and_batch_campground_matching.sql
--
-- 1. Fix Jacks Fork gauge station names to match USGS official names
-- 2. Fix gauge station coordinates for 07065200 (was placed at Alley Spring, should be Mountain View)
-- 3. Add batch campground-to-access-point matching function

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix gauge station names
-- ─────────────────────────────────────────────────────────────
-- The seed file mislabeled 07065200 as "Jacks Fork at Alley Spring"
-- when USGS says it's "Jacks Fork near Mountain View, MO".
-- Subsequent migrations (add_jacks_fork_gauge_stations, fix_jacks_fork_gauge_associations)
-- shifted IDs around, compounding the confusion.
--
-- USGS ground truth:
--   07065200 = Jacks Fork near Mountain View, MO  (upper, ~mile 7, 37.057°N 91.668°W)
--   07065495 = Jacks Fork at Alley Spring, MO     (middle, ~mile 31)
--   07066000 = Jacks Fork at Eminence, MO         (lower, ~mile 37)
--   07066510 = Current River at Eminence, MO       (NOT Jacks Fork)

-- Fix 07065200: wrong name AND wrong coordinates (was placed at Alley Spring coords)
UPDATE gauge_stations
SET
  name = 'Jacks Fork near Mountain View, MO',
  location = ST_SetSRID(ST_MakePoint(-91.668, 37.057), 4326)
WHERE usgs_site_id = '07065200';

-- Fix 07065495: ensure correct name (may have been inserted as "Buck Hollow")
UPDATE gauge_stations
SET name = 'Jacks Fork at Alley Spring, MO'
WHERE usgs_site_id = '07065495';

-- Fix 07066000: ensure correct name
UPDATE gauge_stations
SET name = 'Jacks Fork at Eminence, MO'
WHERE usgs_site_id = '07066000';

-- Fix 07066510: this is Current River, not Jacks Fork
-- Ensure it's named correctly and not associated with Jacks Fork
UPDATE gauge_stations
SET name = 'Current River at Eminence, MO'
WHERE usgs_site_id = '07066510';

-- Remove any incorrect Jacks Fork association for 07066510 (Current River gauge)
DELETE FROM river_gauges
WHERE gauge_station_id IN (SELECT id FROM gauge_stations WHERE usgs_site_id = '07066510')
  AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Verify
SELECT usgs_site_id, name, ST_AsText(location) AS coords
FROM gauge_stations
WHERE usgs_site_id IN ('07065200', '07065495', '07066000', '07066510')
ORDER BY usgs_site_id;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Create batch campground-to-access-point matching function
-- ─────────────────────────────────────────────────────────────
-- The per-campground RPC (match_nps_campground_to_access_point) only
-- matched 1/23 campgrounds when called from sync.ts. This batch function
-- does the matching in a single SQL operation with better name matching
-- and returns diagnostic info.

CREATE OR REPLACE FUNCTION batch_match_campgrounds_to_access_points(
  p_max_distance_meters DOUBLE PRECISION DEFAULT 5000
)
RETURNS TABLE(
  campground_name TEXT,
  access_point_name TEXT,
  access_point_id UUID,
  distance_meters DOUBLE PRECISION,
  match_type TEXT
) AS $$
BEGIN
  -- First, do the matching and return diagnostics
  RETURN QUERY
  WITH campground_matches AS (
    SELECT DISTINCT ON (cg.id)
      cg.id AS cg_id,
      cg.name AS cg_name,
      ap.id AS ap_id,
      ap.name AS ap_name,
      ST_Distance(
        COALESCE(ap.location_snap, ap.location_orig)::geography,
        ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
      ) AS dist_m,
      CASE
        WHEN LOWER(TRIM(ap.name)) = LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) THEN 'exact'
        WHEN REPLACE(LOWER(TRIM(ap.name)), ' ', '') = REPLACE(LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )), ' ', '') THEN 'space_normalized'
        WHEN LOWER(TRIM(ap.name)) LIKE '%' || LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) || '%' THEN 'contains'
        WHEN LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) LIKE '%' || LOWER(TRIM(ap.name)) || '%' THEN 'contained_by'
        ELSE 'proximity_only'
      END AS m_type
    FROM nps_campgrounds cg
    JOIN access_points ap ON (
      ap.approved = true
      AND cg.latitude IS NOT NULL
      AND cg.longitude IS NOT NULL
      AND COALESCE(ap.location_snap, ap.location_orig) IS NOT NULL
      AND ST_DWithin(
        COALESCE(ap.location_snap, ap.location_orig)::geography,
        ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography,
        p_max_distance_meters
      )
      AND (
        -- Name match (any variant)
        LOWER(TRIM(ap.name)) = LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        ))
        OR REPLACE(LOWER(TRIM(ap.name)), ' ', '') = REPLACE(LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )), ' ', '')
        OR LOWER(TRIM(ap.name)) LIKE '%' || LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) || '%'
        OR LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) LIKE '%' || LOWER(TRIM(ap.name)) || '%'
      )
    )
    ORDER BY cg.id,
      -- Prefer exact name match
      CASE
        WHEN LOWER(TRIM(ap.name)) = LOWER(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
            '\s+Campground$', '', 'i'
          )
        )) THEN 0
        ELSE 1
      END,
      -- Then closest distance
      ST_Distance(
        COALESCE(ap.location_snap, ap.location_orig)::geography,
        ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
      )
  )
  SELECT
    cm.cg_name,
    cm.ap_name,
    cm.ap_id,
    cm.dist_m,
    cm.m_type
  FROM campground_matches cm;

  -- Apply the matches
  UPDATE access_points ap
  SET nps_campground_id = cm.cg_id
  FROM (
    SELECT DISTINCT ON (sub.cg_id)
      sub.cg_id,
      sub.ap_id
    FROM (
      SELECT DISTINCT ON (cg2.id)
        cg2.id AS cg_id,
        ap2.id AS ap_id
      FROM nps_campgrounds cg2
      JOIN access_points ap2 ON (
        ap2.approved = true
        AND cg2.latitude IS NOT NULL
        AND cg2.longitude IS NOT NULL
        AND COALESCE(ap2.location_snap, ap2.location_orig) IS NOT NULL
        AND ST_DWithin(
          COALESCE(ap2.location_snap, ap2.location_orig)::geography,
          ST_SetSRID(ST_MakePoint(cg2.longitude, cg2.latitude), 4326)::geography,
          p_max_distance_meters
        )
        AND (
          LOWER(TRIM(ap2.name)) = LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg2.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          ))
          OR REPLACE(LOWER(TRIM(ap2.name)), ' ', '') = REPLACE(LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg2.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          )), ' ', '')
          OR LOWER(TRIM(ap2.name)) LIKE '%' || LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg2.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          )) || '%'
          OR LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg2.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          )) LIKE '%' || LOWER(TRIM(ap2.name)) || '%'
        )
      )
      ORDER BY cg2.id,
        CASE
          WHEN LOWER(TRIM(ap2.name)) = LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg2.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          )) THEN 0
          ELSE 1
        END,
        ST_Distance(
          COALESCE(ap2.location_snap, ap2.location_orig)::geography,
          ST_SetSRID(ST_MakePoint(cg2.longitude, cg2.latitude), 4326)::geography
        )
    ) sub
    ORDER BY sub.cg_id
  ) cm
  WHERE ap.id = cm.ap_id;
END;
$$ LANGUAGE plpgsql;
