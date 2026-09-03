-- APPLIED to production (ilefwfpvphadsbptiaur) as version 20260826174017, the
-- version the recording assigned, not the 20260826130000 this file was authored as.
-- Renamed 2026-09-02 to match. The ledger is supabase/production-migrations.txt.
--
-- Echo Bluff State Park is on Sinking Creek, off the Current. Not on the Jacks Fork.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────────────
--
-- The park's mailing address is Eminence, MO 65466. That is its POST OFFICE.
-- The park itself is ~15 road miles north of Eminence on Hwy 19, on Sinking
-- Creek, across from Round Spring.
--
-- 00073_seed_nearby_services.sql took the address literally and wrote
-- 37.1590, -91.4060 — an Eminence-area point about nine miles south of the
-- park. Measured against Eddy's own river geometry:
--
--   coordinate                     to Jacks Fork   to Current
--   37.1590, -91.4060  (seeded)         0.07 mi       5.79 mi
--   37.2903, -91.4056  (the park)       8.81 mi       0.34 mi
--
-- So the pin was drawn essentially ON the Jacks Fork bank, 2.28 mi from Alley
-- Spring and 2.71 mi from Eminence City Access. The corrected point lands
-- 0.49 mi from the Round Spring access and 1.04 mi from Sinking Creek
-- Campground, which is where the park is.
--
-- The same "near Eminence" premise also wrote an explicit service_rivers row
-- against the Jacks Fork (00073:264), so this was never only a rounding error
-- in a coordinate — the wrong river was recorded as a fact. That row is
-- deleted here; see step 2.
--
-- ── WHY NO GUARDRAIL CAUGHT IT, WHICH IS THE PART WORTH FIXING ───────────
--
-- The geocoding backfill exists to catch exactly this: it measures every
-- candidate against the river the service serves and refuses to write a
-- coordinate it cannot corroborate. It never ran here. fetchRows() in
-- scripts/ingestion/geocode-services-mapbox.ts selects `?latitude=is.null`,
-- and this row has carried a latitude since the 2026-03 seed. Its
-- geocode_precision, geocode_source and geocoded_at are all still NULL.
--
-- And had it run, IT WOULD HAVE PASSED. The river test asks how far the
-- candidate is from any river the service is linked to, and the bad
-- coordinate is 0.07 mi from a river it was linked to. A wrong link launders
-- a wrong coordinate — the two corroborate each other and the check sees a
-- clean row. The tell is elsewhere, and it is sharp: this row sat 0.07 mi
-- from its SECONDARY river and 5.79 mi from its PRIMARY one. Across every
-- pre-geocoder row in the table, only Echo Bluff and its child inverted that
-- way.
--
-- ── AND IT PROPAGATED ────────────────────────────────────────────────────
--
-- 20260803140000_campsite_availability_loops.sql mirrors a parent's river
-- links onto the campground row it creates, and its comment states the error
-- as if it were the specification: "Echo Bluff on the Current and the Jacks
-- Fork". Timbuktu Campground inherited both the coordinate and the link. That
-- comment is wrong and cannot be edited in an applied migration; this is the
-- correction it should be read against.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. The coordinates
-- ─────────────────────────────────────────────────────────────
--
-- The park point is corroborated three ways rather than asserted: 0.34 mi
-- from Eddy's Current geometry, 0.49 mi from the Round Spring access and
-- 1.04 mi from Sinking Creek Campground. It is recorded 'exact'.
--
-- Timbuktu is a different matter and is recorded honestly as such. It is the
-- park's campground, north-west of the lodge along Sinking Creek, but this
-- coordinate is DERIVED from the parent rather than independently sourced —
-- it exists so the two rows stop stacking into one unreadable pin, and it is
-- marked 'approximate' with a geocode_source that says where it came from.
-- If somebody sources the real campground entrance, overwrite it.

UPDATE public.nearby_services
   SET latitude = 37.290300, longitude = -91.405600,
       geocode_precision = 'exact',
       geocode_source = 'mostateparks.com + round-spring/sinking-creek cross-check',
       geocoded_at = NOW(),
       notes = 'Opened 2016. Very popular — book early for summer weekends. On Sinking Creek off the Current, across from Round Spring, ~15 road miles north of Eminence on Hwy 19. The Eminence address is the post office, not the location.',
       description = 'Newest Missouri state park (opened 2016), on Sinking Creek just off the Current River near Round Spring. Lodge rooms, cabins, campground, dining hall and a swimming pool. Popular base camp for ONSR floaters on both the Current and the Jacks Fork.',
       updated_at = NOW()
 WHERE slug = 'echo-bluff-state-park';

UPDATE public.nearby_services
   SET latitude = 37.293500, longitude = -91.408800,
       geocode_precision = 'approximate',
       geocode_source = 'derived_from_parent:echo-bluff-state-park',
       geocoded_at = NOW(),
       updated_at = NOW()
 WHERE slug = 'timbuktu-campground';

-- ─────────────────────────────────────────────────────────────
-- 2. The river links
-- ─────────────────────────────────────────────────────────────
--
-- The Jacks Fork link GOES. Echo Bluff is a Current River place: it sits on
-- Sinking Creek a third of a mile off the Current, its access point is on the
-- Current, and it belongs to that river's directory. It is 8.8 miles from the
-- Jacks Fork with a state highway in between.
--
-- Keeping a softened version of the link was considered and rejected. Being
-- listed against a river is Eddy's claim that a place SERVES that river, and
-- the directory has no tier that means "useful from here but not on it" — a
-- reader scanning the Jacks Fork lodging list has no way to see that one of
-- its entries is a different river's park. Every honest version of that row is
-- a sentence in a description, not a row in service_rivers.
--
-- This also restores the invariant the whole defect violated: a service's
-- links should be rivers it is actually near. Echo Bluff now has exactly one,
-- and it is 0.34 mi away.

DELETE FROM public.service_rivers sr
 USING public.nearby_services ns, public.rivers r
 WHERE sr.service_id = ns.id
   AND sr.river_id = r.id
   AND r.slug = 'jacks-fork'
   AND ns.slug IN ('echo-bluff-state-park', 'timbuktu-campground');

UPDATE public.service_rivers sr
   SET section_description = 'Round Spring / Sinking Creek'
  FROM public.nearby_services ns, public.rivers r
 WHERE sr.service_id = ns.id
   AND sr.river_id = r.id
   AND r.slug = 'current'
   AND ns.slug IN ('echo-bluff-state-park', 'timbuktu-campground');

-- ─────────────────────────────────────────────────────────────
-- 3. Echo Bluff becomes a place on the Current
-- ─────────────────────────────────────────────────────────────
--
-- This is what makes the park reachable the way Onondaga Cave State Park is:
-- an access_points row, a same_place link to its directory rows, and a
-- campsite_facilities row pointing at it. Onondaga has all three and gets one
-- pin, a Camping tab and live nights; Echo Bluff had none of them, so its 21
-- synced nights could reach a river directory and no map sheet at all.
--
-- ── is_float_endpoint = FALSE, and types WITHOUT a launch role ───────────
--
-- The park is off the river, up Sinking Creek. It is a place you stay and
-- drive from, not a place you put a boat in — the launch is Round Spring or
-- Sinking Creek Campground, both already endpoints.
--
-- This is the Montauk shape (20260823200007) with one deliberate difference.
-- Montauk KEEPS the `access` role while ineligible, because it genuinely is a
-- launch waiting on river geometry, and the resulting `launch_not_selectable`
-- finding is how it comes back. Echo Bluff must NOT carry `access`: it is not
-- a launch and never will be, so the same finding here would be permanently
-- false and would eventually be silenced by flipping the wrong flag. With
-- types = {campground,park} and is_float_endpoint = FALSE, neither rule in
-- float-endpoint-eligibility.ts fires — which is the correct silence, arrived
-- at by the row being accurate rather than by exempting it.
--
-- approved = TRUE: the pin, the detail page and the sitemap entry are all
-- keyed on it, and the point of this row is to be visible.
--
-- river_mile 34.9 places it between Sinking Creek Campground (33.8) and Round
-- Spring (35.2), interpolated from where the park projects onto the Current
-- line, so it sorts into the access list where it physically belongs.
--
-- location_snap and snap_distance_m are supplied but NOT authoritative: the
-- `access_points_auto_snap` BEFORE INSERT trigger recomputes both from
-- rivers.geom and overwrote them on apply (540 -> 551.51 m). They are passed
-- anyway so the statement is complete and correct if run where the trigger is
-- absent. The point either way is that the row states "off the river" in a
-- column and not only in prose — ~552 m of it.

INSERT INTO public.access_points (
  river_id, name, slug, location_orig, location_snap, snap_distance_m,
  river_mile_downstream, type, types, is_public, is_float_endpoint, approved,
  approved_at, ownership, managing_agency, official_site_url, fee_required,
  fee_notes, description, road_access, road_surface, parking_info, facilities,
  amenities, local_tips
)
SELECT
  r.id,
  'Echo Bluff State Park',
  'echo-bluff-state-park',
  ST_SetSRID(ST_MakePoint(-91.405600, 37.290300), 4326),
  ST_SetSRID(ST_MakePoint(-91.408553, 37.285927), 4326),
  540,
  34.9,
  'park',
  ARRAY['campground', 'park']::text[],
  TRUE,
  FALSE,
  TRUE,
  NOW(),
  'State Park',
  'State Park',
  'https://mostateparks.com/park/echo-bluff-state-park',
  FALSE,
  'No day-use or launch fee. Camping, cabins, lodge rooms and dining are paid amenities booked through icampmo.com.',
  'Missouri''s newest state park (2016), on Sinking Creek about a third of a mile off the Current River and directly across Hwy 19 from the Round Spring access. Betty Lehman Lodge, cabins, Timbuktu Campground, a dining hall and a pool, with trails along the creek. It is a base camp rather than a launch — float parties staying here put in at Round Spring or Sinking Creek Campground, each a few minutes'' drive, or shuttle south to the Jacks Fork at Alley Spring.',
  'Paved. Signed entrance directly off Hwy 19, ~15 miles north of Eminence and ~18 miles south of Salem.',
  ARRAY['paved']::text[],
  'Large paved lots at the lodge, the campground and the trailhead.',
  'Lodge rooms, cabins, campground with electric and walk-in sites, showers, dining hall, camp store, swimming pool, trails.',
  -- The declared vocabulary only (accessAmenities.ts): parking, restrooms,
  -- camping, boat_ramp, picnic, store. The lodge, dining hall, showers and pool
  -- are real but have no slug, and inventing one drifts an unconstrained column
  -- that file already flags as drifting. They are in `facilities` prose, which
  -- drawableAmenitiesFor reads anyway.
  ARRAY['parking', 'restrooms', 'camping', 'store', 'picnic']::text[],
  '<p><strong>This is a base, not a put-in.</strong> Echo Bluff sits on Sinking Creek, a short way up from where it meets the Current — there is no float access from the park itself. Round Spring is directly across Hwy 19 and Sinking Creek Campground is a couple of minutes north; both are on the Current and both are in the planner.</p><p>It is also within reach of the Jacks Fork if you do not mind driving: Alley Spring is about 25 minutes south on Hwy 19. The park is listed under the Current, which is the river it is actually on.</p>'
FROM public.rivers r
WHERE r.slug = 'current'
  AND NOT EXISTS (
    SELECT 1 FROM public.access_points x
     WHERE x.river_id = r.id AND x.slug = 'echo-bluff-state-park'
  );

-- ─────────────────────────────────────────────────────────────
-- 4. The identity link — now an honest same_place
-- ─────────────────────────────────────────────────────────────
--
-- 20260811140000 is explicit that same_place is a claim about ONE ARRIVAL
-- POINT and that proximity may never stand in for it. Linking Echo Bluff to
-- an NPS access point would have failed that test outright — different park,
-- different agency, different gate — which is why this migration creates the
-- park's OWN access point first. The claim being made here is that the
-- access_points row named "Echo Bluff State Park" and the directory rows
-- named "Echo Bluff State Park" and "Timbuktu Campground" are the same place
-- you drive to, which is true by construction: they were written here from
-- one coordinate.
--
-- ── The two rows get DIFFERENT verbs, and the difference is the point ────
--
-- The park's directory row and the access point are the same arrival point —
-- same coordinate, same entrance off Hwy 19 — so that one is `same_place` and
-- collapses into a single marker.
--
-- Timbuktu is NOT that. It is the campground loop inside the park, ~455 m from
-- the lodge, with its own turn once you are through the gate. That is exactly
-- what `located_at` was defined for: same parent facility, different arrival
-- point, routes availability and booking, DRAWS BOTH MARKERS. Marking it
-- same_place would collapse the campground into the lodge pin and undo the
-- separate coordinate written in step 1 — the same mistake in miniature that
-- 20260811140000 refuses to make at Meramec.
--
-- Both verbs are in CONTENT_RELATIONSHIPS (linked-services.ts), so the Camping
-- tab and the booking button reach the sheet either way. The choice only
-- decides how many pins the reader sees, and the honest answer is two.
--
-- verified_at is set on the same_place row because
-- access_point_services_same_place_is_verified requires it, and it is honest:
-- the identity is asserted here with the evidence in the header, not derived
-- by a proximity sweep.

INSERT INTO public.access_point_services
  (access_point_id, nearby_service_id, relationship, source, verified_at)
SELECT ap.id, ns.id, v.relationship, 'migration:echo_bluff_is_on_sinking_creek',
       CASE WHEN v.relationship = 'same_place' THEN NOW() END
FROM public.access_points ap
JOIN public.rivers r ON r.id = ap.river_id AND r.slug = 'current'
JOIN (VALUES
  ('echo-bluff-state-park', 'same_place'),
  ('timbuktu-campground',   'located_at')
) AS v(service_slug, relationship) ON TRUE
JOIN public.nearby_services ns ON ns.slug = v.service_slug
WHERE ap.slug = 'echo-bluff-state-park'
ON CONFLICT (access_point_id, nearby_service_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 5. Route the availability that was already syncing
-- ─────────────────────────────────────────────────────────────
--
-- The UseDirect facility (mo_state_parks/111) has been enabled and pulling
-- nights since 20260803140000 — 21 of them at the time of writing, the same
-- count Onondaga carries. It named a nearby_service and no access point, so
-- detail.ts could not reach it from a pin. Onondaga's row carries both. Now
-- this one does too.

UPDATE public.campsite_facilities f
   SET access_point_id = ap.id, updated_at = NOW()
  FROM public.access_points ap
  JOIN public.rivers r ON r.id = ap.river_id AND r.slug = 'current'
 WHERE ap.slug = 'echo-bluff-state-park'
   AND f.source = 'mo_state_parks'
   AND f.source_facility_id = '111'
   AND f.access_point_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 6. Assertions
-- ─────────────────────────────────────────────────────────────
--
-- The distance assertions are the point. A future edit that reintroduces an
-- Eminence-area coordinate fails here rather than four months later on a map.

DO $$
DECLARE
  populated  boolean;
  ap         record;
  mi_current numeric;
  mi_jacks   numeric;
  n_links    integer;
  n_fac      integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
  IF NOT populated THEN
    RAISE NOTICE 'empty access_points (from-scratch build); nothing to assert.';
    RETURN;
  END IF;

  -- The coordinate now corroborates against the right river.
  SELECT round((ST_Distance(
           ST_SetSRID(ST_MakePoint(ns.longitude, ns.latitude), 4326)::geography,
           r.geom::geography) / 1609.34)::numeric, 2)
    INTO mi_current
    FROM public.nearby_services ns, public.rivers r
   WHERE ns.slug = 'echo-bluff-state-park' AND r.slug = 'current';

  SELECT round((ST_Distance(
           ST_SetSRID(ST_MakePoint(ns.longitude, ns.latitude), 4326)::geography,
           r.geom::geography) / 1609.34)::numeric, 2)
    INTO mi_jacks
    FROM public.nearby_services ns, public.rivers r
   WHERE ns.slug = 'echo-bluff-state-park' AND r.slug = 'jacks-fork';

  IF mi_current IS NULL OR mi_current > 1 THEN
    RAISE EXCEPTION
      'echo-bluff-state-park is % mi from the Current; the park is a third of a mile off it. The coordinate is wrong again.', mi_current;
  END IF;

  IF mi_jacks IS NULL OR mi_jacks < 5 THEN
    RAISE EXCEPTION
      'echo-bluff-state-park is % mi from the Jacks Fork. It is ~8.8 mi away; anything close to the bank is the 2026-03 seed coordinate returning.', mi_jacks;
  END IF;

  -- No Jacks Fork link survives, for either row.
  IF EXISTS (
    SELECT 1 FROM public.service_rivers sr
      JOIN public.nearby_services ns ON ns.id = sr.service_id
      JOIN public.rivers r ON r.id = sr.river_id
     WHERE r.slug = 'jacks-fork'
       AND ns.slug IN ('echo-bluff-state-park', 'timbuktu-campground')
  ) THEN
    RAISE EXCEPTION
      'a jacks-fork service_rivers row survives for echo-bluff-state-park or timbuktu-campground. Echo Bluff is a Current River place; being listed against a river is a claim that it serves that river.';
  END IF;

  -- The primary river must be the nearest linked river. This inversion is
  -- what the original bug looked like from the database's side.
  IF (SELECT sr.is_primary
        FROM public.service_rivers sr
        JOIN public.nearby_services ns ON ns.id = sr.service_id
        JOIN public.rivers r ON r.id = sr.river_id
       WHERE ns.slug = 'echo-bluff-state-park'
       ORDER BY ST_Distance(
         ST_SetSRID(ST_MakePoint(ns.longitude, ns.latitude), 4326)::geography,
         r.geom::geography) ASC
       LIMIT 1) IS NOT TRUE THEN
    RAISE EXCEPTION
      'echo-bluff-state-park''s nearest linked river is not its primary one. That inversion IS the original defect.';
  END IF;

  -- The access point exists and is the right kind of thing.
  SELECT a.approved, a.is_float_endpoint, a.types, a.type
    INTO ap
    FROM public.access_points a
    JOIN public.rivers r ON r.id = a.river_id AND r.slug = 'current'
   WHERE a.slug = 'echo-bluff-state-park';

  IF ap IS NULL THEN
    RAISE EXCEPTION 'echo-bluff-state-park access point was not created on the Current.';
  END IF;

  IF NOT ap.approved THEN
    RAISE EXCEPTION 'echo-bluff-state-park is unapproved; the pin, page and sitemap entry all key on approved.';
  END IF;

  IF ap.is_float_endpoint THEN
    RAISE EXCEPTION 'echo-bluff-state-park is marked a float endpoint. It is on Sinking Creek off the river; the launches are Round Spring and Sinking Creek Campground.';
  END IF;

  IF ap.types && ARRAY['access', 'boat_ramp', 'gravel_bar', 'bridge']::text[] THEN
    RAISE EXCEPTION
      'echo-bluff-state-park carries a launch role (%). It would then be reported as "a launch nobody can choose" every day, forever, and the fix somebody eventually applies would be to flip is_float_endpoint.', ap.types;
  END IF;

  SELECT count(*) INTO n_links
    FROM public.access_point_services aps
    JOIN public.access_points a ON a.id = aps.access_point_id
    JOIN public.nearby_services s ON s.id = aps.nearby_service_id
   WHERE a.slug = 'echo-bluff-state-park'
     AND (   (s.slug = 'echo-bluff-state-park' AND aps.relationship = 'same_place')
          OR (s.slug = 'timbuktu-campground'   AND aps.relationship = 'located_at'));

  IF n_links <> 2 THEN
    RAISE EXCEPTION
      'expected the park linked same_place and Timbuktu located_at, found % of those 2. Collapsing Timbuktu into same_place would merge the campground pin into the lodge and waste its separate coordinate.', n_links;
  END IF;

  SELECT count(*) INTO n_fac
    FROM public.campsite_facilities f
    JOIN public.access_points a ON a.id = f.access_point_id
   WHERE a.slug = 'echo-bluff-state-park';

  IF n_fac <> 1 THEN
    RAISE EXCEPTION
      'mo_state_parks/111 is not routed to the echo-bluff-state-park access point (found % facility rows); its synced nights would reach no map sheet.', n_fac;
  END IF;

  RAISE NOTICE
    'echo-bluff-state-park: % mi from the Current, % mi from the Jacks Fork (link dropped); access point created (non-launch), park same_place + Timbuktu located_at, availability routed.',
    mi_current, mi_jacks;
END $$;

COMMIT;
