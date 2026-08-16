-- Silver Mines joins the campgrounds Eddy reads live.
--
-- ── The report ──────────────────────────────────────────────────────────────
--
-- Silver Mines Recreation Area (St. Francis) shows none of the availability
-- treatment — no fortnight card, no site list, no booking button — while the
-- NPS campgrounds around it do. The suspicion was a missing API for USDA
-- Forest Service sites. It is not: USFS campgrounds book through
-- recreation.gov, the exact source `recgov.ts` already syncs for the NPS and
-- Red Bluff facilities. Silver Mines was simply never enrolled in
-- campsite_facilities — it exists in Eddy only as an access point, with no
-- directory row and no facility row for the sync to work from.
--
-- ── The id, verified live per this table's own bar ─────────────────────────
--
-- 20260803120000 requires every seeded id to have been "fetched live and
-- confirmed to return per-site, per-night data before being written down".
-- Facility 232392 ("SILVER MINES", Mark Twain National Forest, USDA Forest
-- Service) was verified 2026-08-15 against the same month endpoint the sync
-- calls: 49 campsites, each with a per-night calendar. The reservation URL
-- below is the recreation.gov deep link for that facility.
--
-- ── The shape mirrors Red Bluff exactly ────────────────────────────────────
--
-- Red Bluff is the precedent: a USFS campground with no nps_campgrounds row,
-- whose facility names its directory row (for the booking URL) and its access
-- point (for the pin flag and the detail lookup). Same three rows here:
--
--   nearby_services        holds the reservation URL loadBookingLink reads —
--                          it is the only column the Book button trusts.
--   campsite_facilities    what the nightly sync works from; access_point_id
--                          is what puts hasLiveAvailability on the map pin.
--   access_point_services  located_at, so the directory row's content routes
--                          to the sheet a reader actually taps.
--
-- The directory row ships WITHOUT coordinates, deliberately. The access point
-- already wears the campground mark on the map (types = {campground,access}),
-- and a geocoded twin ~270 m away would draw the duplicate-tent problem the
-- Round Spring merge (next migration) exists to end. An ungeocoded row draws
-- no pin and loses nothing else; if a later backfill geocodes it, the link
-- recorded here is what an auditor upgrades to same_place.

-- 1. The directory row, holding the one URL the booking button may trust.
INSERT INTO public.nearby_services
  (name, slug, type, city, state, website, reservation_url, booking_platform,
   managing_agency, status, description)
SELECT
  'Silver Mines Campground',
  'silver-mines-campground-usfs',
  'campground',
  'Fredericktown',
  'MO',
  'https://www.fs.usda.gov/r09/marktwain/recreation/silver-mines-recreation-area',
  'https://www.recreation.gov/camping/campgrounds/232392',
  'recreation_gov',
  'USFS',
  'active',
  'USDA Forest Service campground on the St. Francis River in the Mark Twain National Forest, inside Silver Mines Recreation Area. Single-family and group sites, tent and RV.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.nearby_services WHERE slug = 'silver-mines-campground-usfs'
);

-- 2. It serves the St. Francis, so the river tab can claim it.
INSERT INTO public.service_rivers (service_id, river_id)
SELECT ns.id, r.id
  FROM public.nearby_services ns, public.rivers r
 WHERE ns.slug = 'silver-mines-campground-usfs'
   AND r.slug = 'st-francis'
ON CONFLICT (service_id, river_id) DO NOTHING;

-- 3. The facility the sync reads. Both links set: the directory row is where
--    the booking URL lives, the access point is the row the map pin came from.
INSERT INTO public.campsite_facilities
  (source, source_facility_id, display_name, kind, enabled)
VALUES
  ('recreation_gov', '232392', 'Silver Mines', 'campground', TRUE)
ON CONFLICT (source, source_facility_id) DO NOTHING;

UPDATE public.campsite_facilities f
   SET nearby_service_id = ns.id,
       updated_at = NOW()
  FROM public.nearby_services ns
 WHERE f.source = 'recreation_gov'
   AND f.source_facility_id = '232392'
   AND f.nearby_service_id IS NULL
   AND ns.slug = 'silver-mines-campground-usfs';

UPDATE public.campsite_facilities f
   SET access_point_id = ap.id,
       updated_at = NOW()
  FROM public.access_points ap, public.rivers r
 WHERE f.source = 'recreation_gov'
   AND f.source_facility_id = '232392'
   AND f.access_point_id IS NULL
   AND ap.river_id = r.id
   AND r.slug = 'st-francis'
   AND ap.slug = 'silver-mines-recreation-area-hwy-d'
   AND ap.approved;

-- 4. located_at: one recreation area, and the relationship that routes the
--    directory row's booking URL and availability to the access point's sheet
--    (linked-services.ts). NOT same_place — that claim collapses a marker and
--    is reserved for a person confirming one arrival point, which nobody has
--    stood at D-Bridge and done. With no coordinates on the directory row the
--    distinction draws nothing today; it is recorded so the next audit starts
--    from the honest relationship.
INSERT INTO public.access_point_services
  (access_point_id, nearby_service_id, relationship, source, verified_at)
SELECT ap.id, ns.id, 'located_at', 'audit', NOW()
  FROM public.access_points ap
  JOIN public.rivers r ON r.id = ap.river_id
  CROSS JOIN public.nearby_services ns
 WHERE r.slug = 'st-francis'
   AND ap.slug = 'silver-mines-recreation-area-hwy-d'
   AND ap.approved
   AND ns.slug = 'silver-mines-campground-usfs'
ON CONFLICT (access_point_id, nearby_service_id) DO NOTHING;
