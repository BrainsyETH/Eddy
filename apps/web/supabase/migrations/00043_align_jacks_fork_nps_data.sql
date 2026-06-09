-- 00043_align_jacks_fork_nps_data.sql
--
-- Align NPS data for Jacks Fork River:
--   1. Fix NPS campground-to-access-point matching (Blue Spring disambiguation, Rymers)
--   2. Add/verify Jacks Fork POIs with deduplication
--
-- Follows the same pattern as the Current River NPS integration
-- (migrations 00038, 00039, 00040).

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix NPS Campground → Access Point Matching
-- ─────────────────────────────────────────────────────────────
-- The generic matching in 00039 uses name-only matching across ALL rivers.
-- This can cause issues:
--   a) "Blue Spring Campground" may link to Current River's Blue Spring
--      instead of Jacks Fork's Blue Spring
--   b) "Rymers Campground" may not match "Rymers Landing" or "Rymers"
--
-- Strategy: For each Jacks Fork NPS campground, use geographic proximity
-- to the Jacks Fork river geometry to disambiguate.

-- Step 1a: Preview — show current Jacks Fork access point campground links
-- (diagnostic only, no changes)
SELECT
  ap.name AS access_point,
  ap.nps_campground_id,
  cg.name AS linked_campground,
  r.name AS river
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
LEFT JOIN nps_campgrounds cg ON cg.id = ap.nps_campground_id
WHERE r.slug = 'jacks-fork'
  AND ap.approved = true
ORDER BY ap.name;

-- Step 1b: Match Jacks Fork campgrounds to access points using
-- name similarity + geographic proximity to Jacks Fork river.
-- Uses DISTINCT ON to prevent duplicate matches.
-- Only updates access points that don't already have a campground linked.
UPDATE access_points ap
SET nps_campground_id = match.nps_campground_id
FROM (
  SELECT DISTINCT ON (ap2.id)
    ap2.id AS access_point_id,
    cg.id AS nps_campground_id,
    cg.name AS cg_name,
    ap2.name AS ap_name
  FROM nps_campgrounds cg
  JOIN access_points ap2 ON ap2.approved = true
  JOIN rivers r ON r.id = ap2.river_id AND r.slug = 'jacks-fork'
  WHERE
    -- Name matching: strip "Campground" / "Group Campground" suffix
    (
      LOWER(TRIM(ap2.name)) = LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      ))
      OR
      -- Space-normalized match (e.g., "Cedargrove" vs "Cedar Grove")
      REPLACE(LOWER(TRIM(ap2.name)), ' ', '') = REPLACE(LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )), ' ', '')
      OR
      -- Contains match (campground name contains access point name)
      LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )) LIKE '%' || LOWER(TRIM(ap2.name)) || '%'
      OR
      -- Contains match (access point name contains campground name)
      LOWER(TRIM(ap2.name)) LIKE '%' || LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )) || '%'
    )
    -- Geographic proximity filter: campground must be within 5km of its
    -- matched access point to prevent cross-river matches (e.g., Blue Spring
    -- on Current River matching Jacks Fork's Blue Spring access point)
    AND cg.latitude IS NOT NULL
    AND cg.longitude IS NOT NULL
    AND ST_DWithin(
      COALESCE(ap2.location_snap, ap2.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography,
      5000  -- 5km max distance between campground and access point
    )
  ORDER BY ap2.id,
    -- Prefer exact name match
    CASE
      WHEN LOWER(TRIM(ap2.name)) = LOWER(TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(cg.name, '\s+Group\s+Campground$', '', 'i'),
          '\s+Campground$', '', 'i'
        )
      )) THEN 0
      ELSE 1
    END,
    -- Then prefer closest distance
    ST_Distance(
      COALESCE(ap2.location_snap, ap2.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(cg.longitude, cg.latitude), 4326)::geography
    )
) match
WHERE ap.id = match.access_point_id
  -- Only update if not already linked (don't overwrite correct links)
  AND ap.nps_campground_id IS NULL;

-- Step 1c: Verify results
SELECT
  ap.name AS access_point,
  cg.name AS linked_campground,
  r.name AS river
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
JOIN nps_campgrounds cg ON cg.id = ap.nps_campground_id
WHERE r.slug = 'jacks-fork'
ORDER BY ap.name;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Add Jacks Fork POIs (with deduplication)
-- ─────────────────────────────────────────────────────────────
-- Some of these may already exist from the NPS /places sync.
-- We use INSERT ... ON CONFLICT DO NOTHING on slug, and a NOT EXISTS
-- guard for manual entries that lack an nps_id.

-- 2a. Blue Spring (Jacks Fork) — river mile 9.6
-- Spring feeding from a cave on river left, hidden by boulders.
-- May already exist from NPS sync.
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Blue Spring',
  'blue-spring-jacks-fork',
  'Cold spring emerging from a cave on river left, nearly hidden by boulders. The narrow run just below the spring can be challenging. One of the scenic highlights of the upper Jacks Fork.',
  'Blue Spring comes from a cave on the left bank, nearly hidden from the river by large boulders. The spring feeds cold, crystal-clear water into the Jacks Fork, creating a beautiful turquoise pool. Just downstream, the river narrows through a constricted run that can be technical in higher water. Don''t confuse this with the larger Blue Spring on the Current River near Powder Mill.',
  'spring',
  'manual',
  37.05355,
  -91.63707,
  9.6,
  r.id,
  true,
  true
FROM rivers r
WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi
    WHERE poi.river_id = r.id
      AND (
        poi.slug = 'blue-spring-jacks-fork'
        OR (poi.name ILIKE '%Blue Spring%' AND poi.river_id = r.id)
      )
  );

-- 2b. Jam Up Cave — river mile 12.6
-- One of the most spectacular cave entrances in the state.
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Jam Up Cave',
  'jam-up-cave',
  'One of the most spectacular cave entrances in Missouri — an 80-foot-high arch visible from the river. Explorable by daylight back to an underground lake.',
  'Jam Up Bluff and Cave features a river entrance that is one of the most spectacular cave entrances in the state. The massive arch rises 80 feet high and 100 feet wide. The cave may be explored in daylight back to a lake which is a plunge-basin for falls from the upper part of the cave. The upper section can be entered through a sinkhole in Lost Hollow, reached by climbing up the bluff. Note: All ONSR caves are currently closed to entry to protect bats from White Nose Syndrome.',
  'cave',
  'manual',
  37.03878,
  -91.60622,
  12.6,
  r.id,
  true,
  true
FROM rivers r
WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi
    WHERE poi.river_id = r.id
      AND (
        poi.slug = 'jam-up-cave'
        OR (poi.name ILIKE '%Jam Up%' AND poi.river_id = r.id)
      )
  );

-- 2c. Ebb and Flow Spring — river mile 15.9
-- Intermittent spring, unique geological phenomenon.
-- NOT in NPS places API — manual entry only.
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Ebb and Flow Spring',
  'ebb-and-flow-spring',
  'A rare intermittent spring on river left that pulses in flow on a schedule unrelated to rainfall or barometric pressure. Just upstream from Rymers Landing.',
  'Ebb and Flow Spring is a rather small spring that varies in flow on a timetable unrelated to rainfall or barometric pressure. This type of intermittent or pulsating spring is a relatively rare geological phenomenon. The spring enters the Jacks Fork from the left bank at river mile 15.9, just 0.3 miles upstream from the Rymers Landing access and campground.',
  'spring',
  'manual',
  37.05770,
  -91.56200,
  15.9,
  r.id,
  true,
  true
FROM rivers r
WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi
    WHERE poi.river_id = r.id
      AND (
        poi.slug = 'ebb-and-flow-spring'
        OR (poi.name ILIKE '%Ebb and Flow%' AND poi.river_id = r.id)
      )
  );

-- 2d. Alley Spring & Mill — river mile 31.0
-- 7th largest spring in MO, iconic red Alley Mill.
-- Likely already exists from NPS sync.
INSERT INTO points_of_interest (
  name, slug, description, body_text, type, source,
  latitude, longitude, river_mile,
  river_id, active, is_on_water
)
SELECT
  'Alley Spring and Mill',
  'alley-spring-and-mill',
  'The 7th largest spring in Missouri, pumping 81 million gallons per day. Home to the iconic red Alley Mill, featured on the 2003 Missouri state quarter.',
  'Alley Spring is the crown jewel of the Jacks Fork. The 7th largest spring in Missouri pumps 81 million gallons of crystal-clear water per day into the river, making the lower Jacks Fork floatable year-round. The iconic red Alley Mill, a three-story roller mill built in 1893-1894, sits at the edge of the spring pool and is one of the most photographed structures in the Ozarks. Featured on the 2003 Missouri state quarter. The spring conduit extends at least 3,000 feet underground and reaches at least 155 feet below the surface. Multiple hiking trails, including the Alley Spring Overlook Trail, surround the area.',
  'historical_site',
  'manual',
  37.15374,
  -91.44234,
  31.0,
  r.id,
  true,
  true
FROM rivers r
WHERE r.slug = 'jacks-fork'
  AND NOT EXISTS (
    SELECT 1 FROM points_of_interest poi
    WHERE poi.river_id = r.id
      AND (
        poi.slug IN ('alley-spring-and-mill', 'alley-spring-and-alley-mill', 'alley-spring')
        OR (poi.name ILIKE '%Alley Spring%' AND poi.river_id = r.id)
      )
  );


-- ─────────────────────────────────────────────────────────────
-- STEP 3: Set PostGIS location columns for newly inserted POIs
-- ─────────────────────────────────────────────────────────────
UPDATE points_of_interest
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE location IS NULL
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND slug IN (
    'blue-spring-jacks-fork',
    'jam-up-cave',
    'ebb-and-flow-spring',
    'alley-spring-and-mill'
  );


-- ─────────────────────────────────────────────────────────────
-- STEP 4: Recompute river_mile for any Jacks Fork POIs that have
-- a river_id but no river_mile (catches NPS-synced POIs too)
-- ─────────────────────────────────────────────────────────────
UPDATE points_of_interest poi
SET river_mile = sub.computed_mile
FROM (
  SELECT
    poi2.id AS poi_id,
    CASE
      WHEN COALESCE(r.geometry_starts_at_headwaters, TRUE) THEN
        r.length_miles * ST_LineLocatePoint(
          r.geom,
          ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)
        )
      ELSE
        r.length_miles * (1.0 - ST_LineLocatePoint(
          r.geom,
          ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)
        ))
    END AS computed_mile
  FROM points_of_interest poi2
  JOIN rivers r ON r.id = poi2.river_id AND r.slug = 'jacks-fork'
  WHERE poi2.latitude IS NOT NULL
    AND poi2.longitude IS NOT NULL
    AND r.geom IS NOT NULL
    AND r.length_miles IS NOT NULL
    AND poi2.river_mile IS NULL
) sub
WHERE poi.id = sub.poi_id;


-- ─────────────────────────────────────────────────────────────
-- STEP 5: Ensure any NPS-synced POIs near Jacks Fork are assigned
-- to the correct river (catches orphaned POIs from sync)
-- ─────────────────────────────────────────────────────────────
UPDATE points_of_interest poi
SET
  river_id = sub.river_id,
  is_on_water = true,
  active = true
FROM (
  SELECT
    poi2.id AS poi_id,
    r.id AS river_id
  FROM points_of_interest poi2
  CROSS JOIN LATERAL (
    SELECT r2.id, r2.geom
    FROM rivers r2
    WHERE r2.slug = 'jacks-fork'
      AND r2.active = true
      AND r2.geom IS NOT NULL
      AND ST_DWithin(
        r2.geom::geography,
        ST_SetSRID(ST_MakePoint(poi2.longitude, poi2.latitude), 4326)::geography,
        2000  -- 2km buffer for springs/caves off the main channel
      )
    LIMIT 1
  ) r
  WHERE poi2.river_id IS NULL
    AND poi2.latitude IS NOT NULL
    AND poi2.longitude IS NOT NULL
    AND poi2.source = 'nps'
) sub
WHERE poi.id = sub.poi_id;


-- ─────────────────────────────────────────────────────────────
-- Final verification: Show all Jacks Fork POIs
-- ─────────────────────────────────────────────────────────────
SELECT
  poi.name,
  poi.type,
  poi.source,
  poi.river_mile,
  poi.latitude,
  poi.longitude,
  poi.active,
  poi.is_on_water,
  r.name AS river
FROM points_of_interest poi
JOIN rivers r ON r.id = poi.river_id
WHERE r.slug = 'jacks-fork'
ORDER BY poi.river_mile NULLS LAST;
