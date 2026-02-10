-- 00045_fix_jacks_fork_access_point_coordinates.sql
--
-- Fixes the Blue Spring access point coordinates on Jacks Fork.
-- The import script interpolated coordinates from the simplified river geometry,
-- placing Blue Spring near Winona (~21km away from reality).
--
-- Only fixing Blue Spring here because it has verified NPS API coordinates.
-- Other access points may also be off, but should only be corrected with
-- verified source data (NPS API, USGS, etc.) — not estimates.

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix Blue Spring access point coordinates
-- ─────────────────────────────────────────────────────────────
-- Verified: NPS API campground data (lat 37.0519, lng -91.6326)
UPDATE access_points
SET location_orig = ST_SetSRID(ST_MakePoint(-91.6326, 37.0519), 4326),
    location_snap = NULL
WHERE (slug = 'blue-spring' OR name ILIKE '%Blue Spring%')
  AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork')
  AND river_mile_downstream BETWEEN 9 AND 11;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Verify the fix
-- ─────────────────────────────────────────────────────────────
SELECT
  ap.name,
  ap.slug,
  ap.river_mile_downstream AS mile,
  ST_X(ap.location_orig) AS lng,
  ST_Y(ap.location_orig) AS lat,
  ap.approved
FROM access_points ap
JOIN rivers r ON ap.river_id = r.id
WHERE r.slug = 'jacks-fork'
ORDER BY ap.river_mile_downstream;


-- ─────────────────────────────────────────────────────────────
-- STEP 3: Re-run campground-to-access-point matching for Jacks Fork
-- ─────────────────────────────────────────────────────────────
-- Clear previous matches so they can be re-evaluated with corrected coordinates
UPDATE access_points
SET nps_campground_id = NULL
WHERE river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork')
  AND nps_campground_id IS NOT NULL;

-- If batch_match function exists (from migration 00044), use it.
-- Otherwise, do inline matching.
DO $$
DECLARE
  v_match RECORD;
  v_count INT := 0;
BEGIN
  -- Try using batch function
  BEGIN
    FOR v_match IN
      SELECT * FROM batch_match_campgrounds_to_access_points(5000.0)
    LOOP
      v_count := v_count + 1;
      RAISE NOTICE 'Matched: % → % (% m, %)',
        v_match.campground_name,
        v_match.access_point_name,
        ROUND(v_match.distance_meters::numeric),
        v_match.match_type;
    END LOOP;
    RAISE NOTICE 'Batch matching complete: % matches', v_count;
    RETURN;
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'Batch function not available, using inline matching...';
  END;

  -- Inline fallback matching (same logic as batch function)
  FOR v_match IN
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
          5000
        )
        AND (
          LOWER(TRIM(ap.name)) = LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          ))
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
        CASE
          WHEN LOWER(TRIM(ap.name)) = LOWER(TRIM(
            REGEXP_REPLACE(
              REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
              '\s+Campground$', '', 'i'
            )
          )) THEN 0
          ELSE 1
        END,
        ST_Distance(
          COALESCE(ap.location_snap, ap.location_orig)::geography,
          ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
        )
    )
    SELECT * FROM campground_matches
  LOOP
    UPDATE access_points
    SET nps_campground_id = v_match.cg_id
    WHERE id = v_match.ap_id;

    v_count := v_count + 1;
    RAISE NOTICE 'Matched: % → % (% m, %)',
      v_match.cg_name,
      v_match.ap_name,
      ROUND(v_match.dist_m::numeric),
      v_match.m_type;
  END LOOP;

  RAISE NOTICE 'Inline matching complete: % matches', v_count;
END $$;


-- ─────────────────────────────────────────────────────────────
-- STEP 4: Show matching results
-- ─────────────────────────────────────────────────────────────
SELECT
  cg.name AS campground,
  ap.name AS access_point,
  ap.slug,
  ROUND(ST_Distance(
    COALESCE(ap.location_snap, ap.location_orig)::geography,
    ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
  )::numeric) AS distance_m,
  ap.river_mile_downstream AS mile
FROM access_points ap
JOIN nps_campgrounds cg ON ap.nps_campground_id = cg.id
JOIN rivers r ON ap.river_id = r.id
WHERE r.slug = 'jacks-fork'
ORDER BY ap.river_mile_downstream;
