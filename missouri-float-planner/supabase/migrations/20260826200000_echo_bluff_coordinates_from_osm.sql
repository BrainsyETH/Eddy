-- Echo Bluff's coordinates, from OSM this time instead of from memory.
--
-- ── WHAT WAS WRONG, AND IT WAS MINE ──────────────────────────────────────
--
-- 20260826130000 moved Echo Bluff off the Jacks Fork, which was right, and
-- put it at 37.2903, -91.4056, which was not. That coordinate was ESTIMATED
-- and then cross-checked, rather than sourced: it sat 0.34 mi from the Current
-- and 0.49 mi from the Round Spring access, both plausible, so it passed every
-- test that migration applied to it. It is still about 1.5 miles south of the
-- park, which is obvious the moment the pin is drawn next to a basemap that
-- labels the park from OSM — the pins sat well south of their own labels.
--
-- Plausible-and-corroborated is not the same as sourced. Two distances that
-- agree with a guess only tell you the guess is in the right valley.
--
-- ── THE COORDINATES, AND WHY THESE ARE TRUSTWORTHY ───────────────────────
--
-- From OpenStreetMap via Nominatim, which is also what the app's Mapbox
-- basemap renders, so the pin now lands on its own label rather than beside it:
--
--   Betty Lea Lodge     tourism=hotel        37.3123606, -91.4056476
--   Timbuktu Campground tourism=caravan_site 37.3139999, -91.4001555
--
-- The lodge's OSM address is 34489 Echo Bluff Drive — character-for-character
-- the address_line1 already on the nearby_services row, which is what ties
-- that record to that building rather than to the park in general.
--
-- Timbuktu is now SOURCED. 20260826130000 wrote it as
-- 'derived_from_parent:echo-bluff-state-park' with an invented offset, and
-- said so; it is replaced here by the real campground node. That offset also
-- had the direction wrong — Timbuktu is 520 m EAST-NORTHEAST of the lodge, and
-- the derived point put it north-west.
--
-- ── EVERY DISTANCE IN THE PROSE WAS RE-MEASURED ──────────────────────────
--
-- The old text said the park is "directly across Hwy 19 from the Round Spring
-- access" and that Sinking Creek Campground is "a couple of minutes north".
-- Measured from the real lodge coordinate:
--
--   Sinking Creek Campground   0.76 mi   bearing 225  (south-WEST)
--   Round Spring               2.01 mi   bearing 180  (due south, not across)
--   Alley Spring              11.54 mi   bearing 193
--   the Current itself         0.62 mi   (not the "third of a mile" claimed)
--
-- ── AND THE RIVER MILE, WHICH WAS DERIVED FROM THE BAD POINT ─────────────
--
-- 34.9 came from projecting the wrong coordinate onto the Current, which put
-- the park between Sinking Creek Campground (33.8) and Round Spring (35.2).
-- The real lodge projects to line fraction 0.19360, which is just UPSTREAM of
-- Sinking Creek Campground at 0.19453. Interpolating on the two nearest pairs
-- — Pulltite/Sinking Creek and Sinking Creek/Round Spring — gives 33.64 and
-- 33.66. 33.7 is recorded. The column orders a non-launch in a list, and the
-- park is two-thirds of a mile off the mainstem, so tenths are the honest
-- precision here.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. The two directory rows
-- ─────────────────────────────────────────────────────────────

UPDATE public.nearby_services
   SET latitude = 37.3123606, longitude = -91.4056476,
       geocode_precision = 'exact',
       geocode_source = 'osm:way/732153993 + node Betty Lea Lodge, address match on 34489 Echo Bluff Drive',
       geocoded_at = NOW(),
       description = 'Newest Missouri state park (opened 2016), on Sinking Creek about two-thirds of a mile off the Current River and two miles north of Round Spring. Betty Lea Lodge rooms, cabins, Timbuktu Campground, a dining hall and a swimming pool. Popular base camp for ONSR floaters on both the Current and the Jacks Fork.',
       notes = 'Opened 2016. Very popular — book early for summer weekends. On Sinking Creek off the Current, about 2 mi north of Round Spring on Hwy 19. The Eminence mailing address is the post office, not the location: the park is well north of town.',
       updated_at = NOW()
 WHERE slug = 'echo-bluff-state-park';

UPDATE public.nearby_services
   SET latitude = 37.3139999, longitude = -91.4001555,
       geocode_precision = 'exact',
       geocode_source = 'osm:Timbuktu Campground (tourism=caravan_site), Echo Bluff Drive',
       geocoded_at = NOW(),
       updated_at = NOW()
 WHERE slug = 'timbuktu-campground';

-- ─────────────────────────────────────────────────────────────
-- 2. The access point, and the prose that described the old spot
-- ─────────────────────────────────────────────────────────────
--
-- location_snap and snap_distance_m are left to access_points_auto_snap, which
-- recomputes both from rivers.geom on any update of location_orig. Writing
-- them by hand here would be writing a number the trigger is about to replace.

UPDATE public.access_points ap
   SET location_orig = ST_SetSRID(ST_MakePoint(-91.4056476, 37.3123606), 4326),
       river_mile_downstream = 33.7,
       description = 'Missouri''s newest state park (2016), on Sinking Creek about two-thirds of a mile off the Current River. Betty Lea Lodge, cabins, Timbuktu Campground, a dining hall and a pool, with trails along the creek. It is a base camp rather than a launch — float parties staying here put in at Sinking Creek Campground, 0.8 mi south-west, or Round Spring, 2 mi due south on Hwy 19, or drive south to the Jacks Fork at Alley Spring.',
       road_access = 'Paved. Signed entrance directly off Hwy 19, between Eminence to the south and Salem to the north.',
       local_tips = '<p><strong>This is a base, not a put-in.</strong> Echo Bluff sits on Sinking Creek, about two-thirds of a mile up from where it meets the Current — there is no float access from the park itself. The nearest launches are Sinking Creek Campground, 0.8 mi south-west, and Round Spring, 2 mi due south on Hwy 19; both are on the Current and both are in the planner.</p><p>It is also within reach of the Jacks Fork if you do not mind driving: Alley Spring is about 11 miles south. The park is listed under the Current, which is the river it is actually on.</p>',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'echo-bluff-state-park';

-- ─────────────────────────────────────────────────────────────
-- 3. Assertions — the ones that would have caught the first attempt
-- ─────────────────────────────────────────────────────────────
--
-- The distance checks in 20260826130000 all PASSED on the wrong coordinate,
-- because a point 1.5 miles south of the park is still near the Current and
-- still far from the Jacks Fork. So the check that matters here is a different
-- kind: the point must fall inside the park's own OSM boundary
-- (way/732153993), which a guess in the next valley cannot satisfy.

DO $$
DECLARE
  populated boolean;
  -- Bounding box of OSM way/732153993, Echo Bluff State Park.
  min_lat CONSTANT numeric := 37.3019934;
  max_lat CONSTANT numeric := 37.3172170;
  min_lon CONSTANT numeric := -91.4136643;
  max_lon CONSTANT numeric := -91.3968746;
  bad     integer;
  mile    numeric;
  ap_in   boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
  IF NOT populated THEN
    RAISE NOTICE 'empty access_points (from-scratch build); nothing to assert.';
    RETURN;
  END IF;

  -- Both directory rows inside the park boundary.
  SELECT count(*) INTO bad
    FROM public.nearby_services ns
   WHERE ns.slug IN ('echo-bluff-state-park', 'timbuktu-campground')
     AND NOT (ns.latitude BETWEEN min_lat AND max_lat
          AND ns.longitude BETWEEN min_lon AND max_lon);

  IF bad > 0 THEN
    RAISE EXCEPTION
      '% Echo Bluff row(s) sit outside the park''s OSM bounding box (lat %..%, lon %..%). The 2026-08-26 estimate failed exactly here: it was near the right river and 1.5 mi from the park.',
      bad, min_lat, max_lat, min_lon, max_lon;
  END IF;

  -- The access point too.
  SELECT (ST_Y(ap.location_orig::geometry) BETWEEN min_lat AND max_lat
      AND ST_X(ap.location_orig::geometry) BETWEEN min_lon AND max_lon),
         ap.river_mile_downstream
    INTO ap_in, mile
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id AND r.slug = 'current'
   WHERE ap.slug = 'echo-bluff-state-park';

  IF ap_in IS NOT TRUE THEN
    RAISE EXCEPTION
      'the echo-bluff-state-park access point is outside the park''s OSM bounding box.';
  END IF;

  -- Upstream of Sinking Creek Campground (33.8), which is what the corrected
  -- projection says and the old 34.9 did not.
  IF mile IS NULL OR mile <= 32.5 OR mile >= 33.8 THEN
    RAISE EXCEPTION
      'echo-bluff-state-park is at mile %; the lodge projects just upstream of Sinking Creek Campground at 33.8, so this should be ~33.7.', mile;
  END IF;

  -- The two pins must stay far enough apart to read as two places. 520 m.
  IF (SELECT round(ST_Distance(
        ST_SetSRID(ST_MakePoint(a.longitude, a.latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(b.longitude, b.latitude), 4326)::geography)::numeric, 0)
      FROM public.nearby_services a, public.nearby_services b
     WHERE a.slug = 'echo-bluff-state-park' AND b.slug = 'timbuktu-campground') < 200 THEN
    RAISE EXCEPTION
      'the lodge and Timbuktu are under 200 m apart; they are two pins and would stack.';
  END IF;

  RAISE NOTICE
    'echo-bluff-state-park: lodge and Timbuktu inside the park boundary, access point at mile %.', mile;
END $$;

COMMIT;
