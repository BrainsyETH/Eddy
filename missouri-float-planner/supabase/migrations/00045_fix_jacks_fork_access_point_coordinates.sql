-- 00045_fix_jacks_fork_access_point_coordinates.sql
--
-- ROOT CAUSE: The Jacks Fork river geometry in rivers.sql is a simplified 19-point
-- linestring that doesn't follow the actual river course. The import-floatmissouri.ts
-- script used get_point_at_mile() to interpolate coordinates along this geometry,
-- placing most access points far from their real locations (up to 21km off).
--
-- Only Alley Spring and Eminence (manually seeded) had correct coordinates.
-- All other access points (South Prong, Buck Hollow, Bluff View, Blue Spring,
-- Rymers, Bay Creek, Shawnee Creek, Two Rivers) got interpolated coordinates
-- that are incorrect.
--
-- This migration fixes coordinates using verified real-world data from:
--   - NPS campground coordinates (from NPS API)
--   - USGS gauge station locations
--   - Satellite/topo map verification
--
-- After fixing coordinates, it re-runs campground-to-access-point matching.

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix Jacks Fork access point coordinates
-- ─────────────────────────────────────────────────────────────
-- Coordinates verified against NPS campground data, USGS topo maps,
-- and satellite imagery.

DO $$
DECLARE
  v_river_id UUID;
  v_updated INT := 0;
BEGIN
  SELECT id INTO v_river_id FROM rivers WHERE slug = 'jacks-fork';
  IF v_river_id IS NULL THEN
    RAISE NOTICE 'Jacks Fork river not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Fixing Jacks Fork access point coordinates (river_id: %)', v_river_id;

  -- South Prong / Highway Y Bridge (mile 0.0)
  -- Location: where State Highway Y crosses the South Prong of Jacks Fork
  -- Verified: USGS topo map, satellite imagery
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6307, 36.9968), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'south-prong' OR name ILIKE '%South Prong%' OR name ILIKE '%Highway Y%')
    AND river_mile_downstream BETWEEN 0 AND 1;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed South Prong (% rows)', v_updated; END IF;

  -- Buck Hollow / Highway 17 (mile 6.8)
  -- Location: where State Highway 17 crosses Jacks Fork at Buck Hollow
  -- Verified: NPS campground nearby, USGS gauge 07065200 nearby
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6284, 37.0145), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'buck-hollow' OR name ILIKE '%Buck Hollow%')
    AND river_mile_downstream BETWEEN 5 AND 8;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Buck Hollow (% rows)', v_updated; END IF;

  -- Bluff View / Salvation Army (mile 9.2)
  -- Location: access near Salvation Army camp, just upstream of Blue Spring
  -- Verified: relative to Blue Spring NPS campground (0.4 miles upstream)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6350, 37.0480), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'bluff-view' OR slug = 'salvation-army' OR name ILIKE '%Bluff View%' OR name ILIKE '%Salvation Army%')
    AND river_mile_downstream BETWEEN 8 AND 10;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Bluff View (% rows)', v_updated; END IF;

  -- Blue Spring (mile 9.6)
  -- Location: NPS Blue Spring Campground
  -- Verified: NPS API campground data (lat 37.0519, lng -91.6326)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6326, 37.0519), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'blue-spring' OR name ILIKE '%Blue Spring%')
    AND river_mile_downstream BETWEEN 9 AND 11;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Blue Spring (% rows)', v_updated; END IF;

  -- Rymers Landing (mile 16.2)
  -- Location: NPS Rymers campground on Jacks Fork
  -- Verified: NPS site data, satellite imagery
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.5762, 37.0635), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'rymers' OR slug = 'rymers-landing' OR name ILIKE '%Rymer%')
    AND river_mile_downstream BETWEEN 15 AND 18;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Rymers (% rows)', v_updated; END IF;

  -- Bay Creek (mile 25.2)
  -- Location: NPS Bay Creek campground, mouth of Bay Creek at Jacks Fork
  -- Verified: NPS site data, satellite imagery
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.4816, 37.1108), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'bay-creek' OR name ILIKE '%Bay Creek%')
    AND river_mile_downstream BETWEEN 24 AND 27;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Bay Creek (% rows)', v_updated; END IF;

  -- Alley Spring (mile 31.0) — already correct from seed data
  -- Coordinates: (-91.4461, 37.1444) — verified, no update needed
  RAISE NOTICE '  Alley Spring — coordinates already correct (seeded)';

  -- Eminence (mile 37.3) — already correct from seed data
  -- Coordinates: (-91.3467, 37.1412) — verified, no update needed
  RAISE NOTICE '  Eminence — coordinates already correct (seeded)';

  -- Shawnee Creek (mile 41.9)
  -- Location: NPS Shawnee Creek campground on Jacks Fork
  -- Verified: NPS site data, satellite imagery
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.2931, 37.1344), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'shawnee-creek' OR name ILIKE '%Shawnee Creek%')
    AND river_mile_downstream BETWEEN 40 AND 43;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Shawnee Creek (% rows)', v_updated; END IF;

  -- Two Rivers / Current River Confluence (mile 44.6)
  -- Location: NPS Two Rivers campground at Jacks Fork/Current River confluence
  -- Verified: NPS site data, satellite imagery
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.2689, 37.1267), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'two-rivers' OR name ILIKE '%Two Rivers%' OR name ILIKE '%confluence%')
    AND river_mile_downstream BETWEEN 43 AND 46;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Two Rivers (% rows)', v_updated; END IF;

  RAISE NOTICE 'Done fixing Jacks Fork access point coordinates';
END $$;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Verify the fixes
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
-- STEP 3: Re-run campground-to-access-point matching
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
          -- Name match required (any variant)
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
