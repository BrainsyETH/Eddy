-- ═══════════════════════════════════════════════════════════════
-- CONSOLIDATED JACKS FORK FIXES
-- ═══════════════════════════════════════════════════════════════
-- Paste this entire script into the Supabase SQL Editor and run it.
-- Combines migrations 00043, 00044, and 00045 into one script.
--
-- What this does:
--   1. Fixes gauge station names to match USGS official names
--   2. Fixes Jacks Fork access point coordinates (were wrong from import)
--   3. Adds Jacks Fork POIs (Blue Spring, Jam Up Cave, Ebb & Flow, Alley Spring)
--   4. Creates batch campground matching function
--   5. Runs campground-to-access-point matching
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- PART 1: Fix gauge station names (from migration 00044)
-- ─────────────────────────────────────────────────────────────

-- Fix 07065200: wrong name AND wrong coordinates
UPDATE gauge_stations
SET
  name = 'Jacks Fork near Mountain View, MO',
  location = ST_SetSRID(ST_MakePoint(-91.668, 37.057), 4326)
WHERE usgs_site_id = '07065200';

-- Fix 07065495: ensure correct name
UPDATE gauge_stations
SET name = 'Jacks Fork at Alley Spring, MO'
WHERE usgs_site_id = '07065495';

-- Fix 07066000: ensure correct name
UPDATE gauge_stations
SET name = 'Jacks Fork at Eminence, MO'
WHERE usgs_site_id = '07066000';

-- Fix 07066510: this is Current River, not Jacks Fork
UPDATE gauge_stations
SET name = 'Current River at Eminence, MO'
WHERE usgs_site_id = '07066510';

-- Remove incorrect Jacks Fork association for 07066510
DELETE FROM river_gauges
WHERE gauge_station_id IN (SELECT id FROM gauge_stations WHERE usgs_site_id = '07066510')
  AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');


-- ─────────────────────────────────────────────────────────────
-- PART 2: Fix Jacks Fork access point coordinates (from migration 00045)
-- ─────────────────────────────────────────────────────────────
-- The import script interpolated coordinates from a simplified river geometry,
-- placing most access points far from their real locations.

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

  RAISE NOTICE 'Fixing Jacks Fork access point coordinates...';

  -- South Prong / Highway Y Bridge (mile 0.0)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6307, 36.9968), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'south-prong' OR name ILIKE '%South Prong%' OR name ILIKE '%Highway Y%')
    AND river_mile_downstream BETWEEN 0 AND 1;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed South Prong (% rows)', v_updated; END IF;

  -- Buck Hollow / Highway 17 (mile 6.8)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6284, 37.0145), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'buck-hollow' OR name ILIKE '%Buck Hollow%')
    AND river_mile_downstream BETWEEN 5 AND 8;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Buck Hollow (% rows)', v_updated; END IF;

  -- Bluff View / Salvation Army (mile 9.2)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6350, 37.0480), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'bluff-view' OR slug = 'salvation-army' OR name ILIKE '%Bluff View%' OR name ILIKE '%Salvation Army%')
    AND river_mile_downstream BETWEEN 8 AND 10;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Bluff View (% rows)', v_updated; END IF;

  -- Blue Spring (mile 9.6) — verified from NPS API
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.6326, 37.0519), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'blue-spring' OR name ILIKE '%Blue Spring%')
    AND river_mile_downstream BETWEEN 9 AND 11;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Blue Spring (% rows)', v_updated; END IF;

  -- Rymers Landing (mile 16.2)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.5762, 37.0635), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'rymers' OR slug = 'rymers-landing' OR name ILIKE '%Rymer%')
    AND river_mile_downstream BETWEEN 15 AND 18;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Rymers (% rows)', v_updated; END IF;

  -- Bay Creek (mile 25.2)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.4816, 37.1108), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'bay-creek' OR name ILIKE '%Bay Creek%')
    AND river_mile_downstream BETWEEN 24 AND 27;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Bay Creek (% rows)', v_updated; END IF;

  -- Alley Spring (mile 31.0) — already correct from seed
  RAISE NOTICE '  Alley Spring — already correct';

  -- Eminence (mile 37.3) — already correct from seed
  RAISE NOTICE '  Eminence — already correct';

  -- Shawnee Creek (mile 41.9)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.2931, 37.1344), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'shawnee-creek' OR name ILIKE '%Shawnee Creek%')
    AND river_mile_downstream BETWEEN 40 AND 43;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Shawnee Creek (% rows)', v_updated; END IF;

  -- Two Rivers (mile 44.6)
  UPDATE access_points
  SET location_orig = ST_SetSRID(ST_MakePoint(-91.2689, 37.1267), 4326),
      location_snap = NULL
  WHERE river_id = v_river_id
    AND (slug = 'two-rivers' OR name ILIKE '%Two Rivers%' OR name ILIKE '%confluence%')
    AND river_mile_downstream BETWEEN 43 AND 46;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN RAISE NOTICE '  Fixed Two Rivers (% rows)', v_updated; END IF;

  RAISE NOTICE 'Done fixing coordinates';
END $$;


-- ─────────────────────────────────────────────────────────────
-- PART 3: Add Jacks Fork POIs (from migration 00043)
-- ─────────────────────────────────────────────────────────────

-- Blue Spring (mile 9.6)
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Blue Spring', 'blue-spring-jacks-fork',
  'Cold spring emerging from a cave on river left, nearly hidden by boulders.',
  'Blue Spring comes from a cave on the left bank, nearly hidden from the river by large boulders. The spring feeds cold, crystal-clear water into the Jacks Fork, creating a beautiful turquoise pool. Just downstream, the river narrows through a constricted run that can be technical in higher water. Don''t confuse this with the larger Blue Spring on the Current River near Powder Mill.',
  'spring', 'manual', 37.05355, -91.63707, 9.6,
  r.id, true, true
FROM rivers r WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi WHERE poi.river_id = r.id
      AND (poi.slug = 'blue-spring-jacks-fork' OR (poi.name ILIKE '%Blue Spring%' AND poi.river_id = r.id))
  );

-- Jam Up Cave (mile 12.6)
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Jam Up Cave', 'jam-up-cave',
  'One of the most spectacular cave entrances in Missouri — an 80-foot-high arch visible from the river.',
  'Jam Up Bluff and Cave features a river entrance that is one of the most spectacular cave entrances in the state. The massive arch rises 80 feet high and 100 feet wide. The cave may be explored in daylight back to a lake which is a plunge-basin for falls from the upper part of the cave. Note: All ONSR caves are currently closed to entry to protect bats from White Nose Syndrome.',
  'cave', 'manual', 37.03878, -91.60622, 12.6,
  r.id, true, true
FROM rivers r WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi WHERE poi.river_id = r.id
      AND (poi.slug = 'jam-up-cave' OR (poi.name ILIKE '%Jam Up%' AND poi.river_id = r.id))
  );

-- Ebb and Flow Spring (mile 15.9)
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Ebb and Flow Spring', 'ebb-and-flow-spring',
  'A rare intermittent spring on river left that pulses in flow on a schedule unrelated to rainfall.',
  'Ebb and Flow Spring is a rather small spring that varies in flow on a timetable unrelated to rainfall or barometric pressure. This type of intermittent or pulsating spring is a relatively rare geological phenomenon. The spring enters the Jacks Fork from the left bank at river mile 15.9.',
  'spring', 'manual', 37.05770, -91.56200, 15.9,
  r.id, true, true
FROM rivers r WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi WHERE poi.river_id = r.id
      AND (poi.slug = 'ebb-and-flow-spring' OR (poi.name ILIKE '%Ebb and Flow%' AND poi.river_id = r.id))
  );

-- Alley Spring & Mill (mile 31.0)
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Alley Spring and Mill', 'alley-spring-and-mill',
  'The 7th largest spring in Missouri, pumping 81 million gallons per day. Home to the iconic red Alley Mill.',
  'Alley Spring is the crown jewel of the Jacks Fork. The 7th largest spring in Missouri pumps 81 million gallons of crystal-clear water per day into the river. The iconic red Alley Mill, built in 1893-1894, is one of the most photographed structures in the Ozarks. Featured on the 2003 Missouri state quarter.',
  'historical_site', 'manual', 37.15374, -91.44234, 31.0,
  r.id, true, true
FROM rivers r WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi WHERE poi.river_id = r.id
      AND (poi.slug IN ('alley-spring-and-mill', 'alley-spring-and-alley-mill', 'alley-spring')
           OR (poi.name ILIKE '%Alley Spring%' AND poi.river_id = r.id))
  );

-- Set PostGIS location for new POIs
UPDATE points_of_interest
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE location IS NULL
  AND latitude IS NOT NULL AND longitude IS NOT NULL
  AND slug IN ('blue-spring-jacks-fork', 'jam-up-cave', 'ebb-and-flow-spring', 'alley-spring-and-mill');


-- ─────────────────────────────────────────────────────────────
-- PART 4: Create batch campground matching function (from migration 00044)
-- ─────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────
-- PART 5: Run campground matching with corrected coordinates
-- ─────────────────────────────────────────────────────────────

-- Clear previous (possibly wrong) matches for Jacks Fork
UPDATE access_points
SET nps_campground_id = NULL
WHERE river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork')
  AND nps_campground_id IS NOT NULL;

-- Run the batch matching function
SELECT * FROM batch_match_campgrounds_to_access_points(5000.0);


-- ─────────────────────────────────────────────────────────────
-- PART 6: Verification queries
-- ─────────────────────────────────────────────────────────────

-- Verify gauge stations
SELECT usgs_site_id, name, ST_AsText(location) AS coords
FROM gauge_stations
WHERE usgs_site_id IN ('07065200', '07065495', '07066000', '07066510')
ORDER BY usgs_site_id;

-- Verify access point coordinates
SELECT
  ap.name,
  ap.slug,
  ap.river_mile_downstream AS mile,
  ROUND(ST_X(ap.location_orig)::numeric, 4) AS lng,
  ROUND(ST_Y(ap.location_orig)::numeric, 4) AS lat,
  cg.name AS matched_campground,
  ap.approved
FROM access_points ap
JOIN rivers r ON ap.river_id = r.id
LEFT JOIN nps_campgrounds cg ON ap.nps_campground_id = cg.id
WHERE r.slug = 'jacks-fork'
ORDER BY ap.river_mile_downstream;

-- Verify POIs
SELECT
  poi.name, poi.type, poi.source, poi.river_mile,
  poi.latitude, poi.longitude, poi.active
FROM points_of_interest poi
JOIN rivers r ON r.id = poi.river_id
WHERE r.slug = 'jacks-fork'
ORDER BY poi.river_mile NULLS LAST;
