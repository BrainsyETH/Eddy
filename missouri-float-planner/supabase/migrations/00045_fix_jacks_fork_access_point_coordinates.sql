-- 00045_fix_blue_spring_jacks_fork.sql
--
-- Directly match Blue Spring access point to Blue Spring Campground
-- from the nps_campgrounds table by name, and copy the NPS coordinates
-- to fix the access point location. No geo guessing.

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Link Blue Spring access point → Blue Spring Campground
-- ─────────────────────────────────────────────────────────────
UPDATE access_points ap
SET nps_campground_id = cg.id
FROM nps_campgrounds cg
WHERE cg.name ILIKE '%Blue Spring%Campground%'
  AND ap.river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork')
  AND (ap.slug = 'blue-spring' OR ap.name ILIKE '%Blue Spring%')
  AND ap.river_mile_downstream BETWEEN 9 AND 11;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Copy NPS campground coordinates to access point
-- ─────────────────────────────────────────────────────────────
-- Use the verified NPS API lat/lng from nps_campgrounds
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
-- STEP 3: Verify
-- ─────────────────────────────────────────────────────────────
SELECT
  ap.name AS access_point,
  cg.name AS matched_campground,
  cg.latitude AS nps_lat,
  cg.longitude AS nps_lng,
  ST_Y(ap.location_orig) AS ap_lat,
  ST_X(ap.location_orig) AS ap_lng
FROM access_points ap
JOIN nps_campgrounds cg ON ap.nps_campground_id = cg.id
JOIN rivers r ON ap.river_id = r.id
WHERE r.slug = 'jacks-fork';
