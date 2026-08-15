-- Round Spring stops being two pins.
--
-- ── The report ──────────────────────────────────────────────────────────────
--
-- The map draws "Round Spring" (the access point, types {campground, access,
-- park, boat_ramp}) and "Round Spring Campground" (the directory row) as two
-- tents a few hundred metres apart, and the product call — 2026-08-15 — is
-- that they read as one place and should be one marker.
--
-- ── Why the link was located_at, and why it changes ────────────────────────
--
-- 20260811150000 recorded the pair as located_at under the parks rule: "one
-- facility, two destinations", written for Meramec, whose campground is
-- 2 956 m from its boat ramp. Round Spring is not that case. The two records
-- sit ~415 m apart, both reached from the same Highway 19 entrance to the same
-- NPS unit — within sight of the Patrick Bridge precedent (281 m, same_place),
-- and nothing like the two-destination distance the rule was written for.
-- Collapsing Meramec would send a camper to a boat ramp two miles away;
-- collapsing Round Spring sends them to Round Spring.
--
-- ── What changes on the map, and what cannot break ─────────────────────────
--
-- same_place is the one relationship /api/services ships as `accessPointId`,
-- so the app stops drawing the directory row's own marker and folds its marks
-- into the access point's pin (accessLayers.ts). Nothing else moves:
--
--   - The access point keeps the campground tent — its own types carry it.
--   - The peek's availability card survives: the pin flag rides on the access
--     point's nps_campground_id, which the facility row (234045) also names.
--   - Booking and availability already route through this link either way —
--     linked-services.ts reads located_at and same_place alike.
--
-- The row keeps its 2026-08-11 verified_at, which the same_place CHECK
-- (access_point_services_same_place_is_verified) requires; this migration
-- changes the relationship's strength, not its provenance.

UPDATE public.access_point_services aps
   SET relationship = 'same_place',
       source = 'audit',
       updated_at = NOW()
  FROM public.access_points ap, public.nearby_services ns
 WHERE aps.access_point_id = ap.id
   AND aps.nearby_service_id = ns.id
   AND ap.name = 'Round Spring'
   AND ap.approved
   AND ns.name = 'Round Spring Campground'
   AND aps.relationship = 'located_at'
   AND aps.verified_at IS NOT NULL;
