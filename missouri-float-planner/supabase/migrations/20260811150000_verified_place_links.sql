-- The first human-verified place links, and one bad coordinate.
--
-- Every row here was confirmed by a person against the ground, which is the bar
-- 20260811140000 set for anything that can collapse a marker. Nothing was
-- inferred from a name or a distance.
--
-- ── The parks: located_at, six pairs ──────────────────────────────────────
--
-- A state or national park whose campground and river access are separate areas
-- is ONE FACILITY and TWO DESTINATIONS. Booking and availability route to the
-- access point's sheet; both keep their own marker, because the campground's
-- pin is the only thing on the map that says where the campground is. Meramec is
-- the case that settles it — 2 956 m between the two, so collapsing them would
-- send somebody looking for a campsite to a boat ramp nearly two miles away.
--
-- Three of these already exist as `located_at` from campsite_facilities; they
-- gain a verified_at here rather than a second row.

UPDATE public.access_point_services
   SET verified_at = NOW(), source = 'audit', updated_at = NOW()
 WHERE relationship = 'located_at'
   AND source = 'campsite_facilities'
   AND access_point_id IN (
     SELECT id FROM public.access_points
      WHERE name IN ('Meramec State Park', 'Montauk State Park', 'Onondaga Cave State Park')
   );

-- The three the facility table could not reach: Alley Spring and Round Spring
-- have facility rows with no access_point_id, and Washington State Park's access
-- is a boat launch a kilometre from its campground.
INSERT INTO public.access_point_services
  (access_point_id, nearby_service_id, relationship, source, verified_at)
SELECT ap.id, ns.id, 'located_at', 'audit', NOW()
  FROM public.access_points ap, public.nearby_services ns
 WHERE (ap.name, ns.name) IN (
         ('Alley Spring',                 'Alley Spring Campground'),
         ('Round Spring',                 'Round Spring Campground'),
         ('Washington State Park Access', 'Washington State Park Campground'),
         -- Montauk's SECOND directory row. The park is listed twice — once
         -- `campground`, once `cabin_lodge` — at identical coordinates, so the
         -- access point needs a link to each or the lodge row keeps drawing
         -- unexplained. Reconciling the two directory rows is a separate job;
         -- this only stops the map treating them as unrelated places.
         ('Montauk State Park',           'Montauk State Park')
       )
   AND ap.approved
ON CONFLICT (access_point_id, nearby_service_id) DO NOTHING;

-- ── Patrick Bridge: same_place, and the tag that was missing ──────────────
--
-- Verified from the Missouri Department of Conservation's own area map: the
-- camping area sits INSIDE the Patrick Bridge Access boundary, off the same
-- entrance road as the boat ramp and the parking. The two records are one place
-- you drive to, 281 m apart because one was pinned at the ramp and the other at
-- the sites.
--
-- The access point was carrying an EMPTY `types` array, so it never said it
-- camps — which is why the directory row was the only thing on the campgrounds
-- layer for this place, and why the pair read as two places rather than one
-- badly-tagged one. `boat_ramp` is added on two independent sources: the ramp on
-- the area map, and the directory row's own `boat_ramp` offering.
UPDATE public.access_points
   SET types = ARRAY['access', 'campground', 'boat_ramp'], updated_at = NOW()
 WHERE name = 'Patrick Bridge Access'
   AND approved
   AND COALESCE(array_length(types, 1), 0) = 0;

INSERT INTO public.access_point_services
  (access_point_id, nearby_service_id, relationship, source, verified_at)
SELECT ap.id, ns.id, 'same_place', 'audit', NOW()
  FROM public.access_points ap, public.nearby_services ns
 WHERE ap.name = 'Patrick Bridge Access' AND ap.approved
   AND ns.name = 'Patrick Bridge Campground'
ON CONFLICT (access_point_id, nearby_service_id) DO NOTHING;

-- ── Riverview Ranch: a town centroid wearing `exact` ──────────────────────
--
-- Not an identity question. The directory row sat 10 167 m from the Meramec —
-- a `census` geocode, which resolves to a place name rather than an address, and
-- landed the ranch beside I-44 in Bourbon. The access point of the same name is
-- 42 m from the water.
--
-- `census` is precisely the town-level geocode `geocode-services-mapbox.ts`
-- rejects at ingest, and the row was nonetheless stamped `exact`. Corrected to
-- the access point's position and marked `approximate`, which is what it is: the
-- landing rather than the office. The provenance now says where it came from, so
-- the next audit can tell this apart from a coordinate nobody has checked.
UPDATE public.nearby_services ns
   SET latitude  = ROUND(ST_Y(COALESCE(ap.location_orig, ap.location_snap)::geometry)::numeric, 6),
       longitude = ROUND(ST_X(COALESCE(ap.location_orig, ap.location_snap)::geometry)::numeric, 6),
       geocode_precision = 'approximate',
       geocode_source = 'access_point_verified',
       geocoded_at = NOW(),
       updated_at = NOW()
  FROM public.access_points ap
 WHERE ns.name = 'Riverview Ranch'
   AND ap.name = 'Riverview Ranch'
   AND ap.approved
   AND ns.geocode_source = 'census';
