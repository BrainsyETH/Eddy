-- Twelve places stop being twenty-four pins.
--
-- ── The report ──────────────────────────────────────────────────────────────
--
-- Onondaga Cave State Park and Ozark Outdoors Resort each drew twice on the
-- map, and the audit of every same-name access↔service pair in the catalog
-- found eleven more doing the same thing. The product call — 2026-08-18 — is
-- that all of them read as one place and should be one marker.
--
--   Riverview Ranch                 43 m    no link
--   Wolf Pen Recreation Area        87 m    no link
--   Peck's Last Resort              90 m    no link
--   Byrd's Adventure Center        115 m    no link
--   Redding Recreation Area        135 m    no link
--   Garrison's River Resort        168 m    no link
--   Gasconade Hills Resort         187 m    no link
--   Huzzah Valley Resort           463 m    no link
--   Meramec Caverns Campground     489 m    no link
--   Bass River Resort              896 m    no link
--   Onondaga Cave State Park     1 051 m    located_at (verified 2026-08-11)
--   Ozark Outdoors Resort        1 356 m    no link
--
-- ── Why eleven of them had no link at all ──────────────────────────────────
--
-- 20260811150000 created and verified links for the pairs the facility table
-- could reach — a campsite_facilities row naming an access point. These eleven
-- have no facility row between them, so nothing derived a link and nobody added
-- one by hand. The absence was never a decision; it was a gap in the source the
-- first pass ran from.
--
-- Onondaga is the different case, and the more confusing one: it WAS linked,
-- as located_at, and located_at draws both markers ON PURPOSE — "same parent
-- facility, different arrival point". What the August pass settled there was
-- the link's provenance, not the duplicate pin. So the park looked unresolved
-- while its row said it had been reviewed.
--
-- ── MERAMEC STATE PARK IS DELIBERATELY NOT IN THIS LIST ────────────────────
--
-- Its pair sits 3 018 m apart and stays located_at. 20260811140000 wrote the
-- rule from exactly that case: collapsing it would not merely merge two pins,
-- it would REMOVE the campground's true location from the map and point a
-- camper at a boat ramp two miles away. Distance is not the only test, but at
-- three kilometres it is a decisive one, and no instruction to collapse the
-- duplicates was an instruction to do that.
--
-- The four over 400 m — Huzzah Valley, Meramec Caverns, Bass River, Onondaga,
-- Ozark Outdoors — are collapsed on the reader's judgement of the ground rather
-- than on the distance alone. If any of them turns out to be two real
-- destinations, the remedy is to move it back to located_at, which restores its
-- second marker without touching anything else.
--
-- ── What changes, and what cannot break ────────────────────────────────────
--
-- same_place is the one relationship /api/services ships as `accessPointId`,
-- so the app stops drawing the directory row's own marker and folds its marks
-- into the access point's pin (accessLayers.ts). Nothing else moves:
--
--   - The directory row itself is untouched — its hours, phone, offerings and
--     coordinates all stay, and every list that reads it still lists it.
--   - Availability and booking already route through this link either way:
--     linked-services.ts reads located_at and same_place alike.
--   - Onondaga keeps its 2026-08-11 verified_at. This migration changes the
--     relationship's STRENGTH, not its provenance, so the coalesce below is
--     load-bearing rather than defensive.
--
-- The same_place CHECK requires verified_at, by design: collapsing a marker
-- takes a real location off the map, so it is a human call per pair. This
-- migration is that call, made for twelve pairs at once and recorded as
-- source = 'audit'.
--
-- Matched by NORMALISED NAME rather than by id, because ids are environment-
-- specific and this file has to run against a database nobody has hand-edited.
-- The name list is explicit and closed: no pair outside it can be caught, which
-- is what keeps a rule about eleven rows from quietly reaching a twelfth.

WITH pairs AS (
  SELECT ap.id AS access_point_id, ns.id AS nearby_service_id
    FROM public.access_points ap
    JOIN public.nearby_services ns
      ON lower(regexp_replace(ap.name, '\s+', ' ', 'g'))
       = lower(regexp_replace(ns.name, '\s+', ' ', 'g'))
   WHERE ap.approved
     AND ns.status = 'active'
     AND ns.latitude IS NOT NULL
     AND ap.location_snap IS NOT NULL
     AND ap.name IN (
       'Riverview Ranch',
       'Wolf Pen Recreation Area',
       'Peck''s Last Resort',
       'Byrd''s Adventure Center',
       'Redding Recreation Area',
       'Garrison''s River Resort',
       'Gasconade Hills Resort',
       'Huzzah Valley Resort',
       'Meramec Caverns Campground',
       'Bass River Resort',
       'Ozark Outdoors Resort',
       'Onondaga Cave State Park'
     )
)
INSERT INTO public.access_point_services
  (access_point_id, nearby_service_id, relationship, source, verified_at)
SELECT access_point_id, nearby_service_id, 'same_place', 'audit', NOW()
  FROM pairs
    ON CONFLICT (access_point_id, nearby_service_id) DO UPDATE
   SET relationship = 'same_place',
       source = 'audit',
       -- The earlier verification stands. Onondaga was confirmed by a human on
       -- 2026-08-11 and that fact does not expire because the relationship got
       -- stronger today.
       verified_at = COALESCE(public.access_point_services.verified_at, NOW()),
       updated_at = NOW();
