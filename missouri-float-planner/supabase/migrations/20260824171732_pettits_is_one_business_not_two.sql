-- Pettit's is one canoe livery, filed twice.
--
-- APPLIED to production 2026-08-24 as 20260824171732.
--
-- pettits-canoe-campground and pettits-canoe-rental are both typed outfitter,
-- share phone 417-284-3290, and are both linked to north-fork-white — so the
-- same business has been rendering twice on that river page. This is not the
-- deliberate tier split used for Dawt Mill and Montauk, where one facility is
-- filed under two DIFFERENT types so it reaches both the lodging and camping
-- directories. serviceTiers() unions the offerings-derived tiers with the type
-- floor, so a single outfitter row carrying camping offerings already appears
-- in both tiers; the second row buys nothing and costs a duplicate.
--
-- Settled against the operator's own site (pettitscanoerental.wixsite.com,
-- read 2026-08-24), which describes a single location at 9000 CR 354,
-- Caulfield MO 65626, by Blair Bridge south of Dora, running since 1972.
--
-- The surviving row is pettits-canoe-rental: its slug and name are what the
-- business calls itself, and its website is the one that answers — the .com on
-- the other row returns 503. Everything the other row knew that this one did
-- not (address, coordinates, description, camping and site amenities, cabins,
-- curated display order) moves across first.
--
-- Three corrections beyond the merge, all from the operator:
--   · city was Gainesville; it is Caulfield, and the coordinates were a
--     ~13 km geocode of the wrong town.
--   · the bryant-creek link goes. Their two float trips are Hammond Mill to
--     Blair Bridge and Blair Bridge to The Take Out, both North Fork; Bryant
--     Creek appears nowhere on their site.
--   · the old description claimed a "Pettit's to Dawt Mill (7 mi)" trip the
--     operator does not list.

UPDATE public.nearby_services SET
  alt_names = ARRAY['Pettit''s Canoe & Campground', 'Pettit Canoe Rental',
                    'Pettit''s Canoe Rental, LLC'],
  address_line1 = '9000 County Road 354',
  city = 'Caulfield',
  state = 'MO',
  zip = '65626',
  latitude = 36.614478,
  longitude = -92.113698,
  geocode_precision = 'approximate',
  description =
    'Third-generation family canoe livery on the North Fork of the White River '
    'at Blair Bridge, south of Dora, running since 1972. Canoe, kayak, raft and '
    'tube rentals with shuttle; tent and RV camping with hot showers, flush '
    'toilets, hookups, fire pits and firewood; cabins sleeping six to eight. '
    'Float trips: Hammond Mill to Blair Bridge (about five hours) and Blair '
    'Bridge to The Take Out (about four hours).',
  services_offered = ARRAY[
    'canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle',
    'camping_primitive','camping_rv','cabins','showers','flush_toilets',
    'fire_rings','picnic_tables']::service_offering[],
  cabin_count = 4,
  fee_range = '$50 per canoe per day; cabins $70-250 per night',
  season_open_month = 1,
  season_close_month = 12,
  display_order = 3,
  verified_source = 'https://pettitscanoerental.wixsite.com/home',
  last_verified_at = '2026-08-24T00:00:00Z',
  updated_at = now()
 WHERE slug = 'pettits-canoe-rental';

-- Which source established which field. cabin_count is the one fact the
-- operator's own pages do not state outright — their lodging page names Big
-- Oak, Eagle's Retreat and "sleeper cabins" without a total — so it is
-- attributed to the newspaper that counted them, not to the operator.
INSERT INTO public.service_field_sources (service_id, field, source, checked_at)
SELECT ns.id, v.field, v.source, DATE '2026-08-24'
  FROM public.nearby_services ns,
       (VALUES
         ('address_line1',    'https://pettitscanoerental.wixsite.com/home'),
         ('city',             'https://pettitscanoerental.wixsite.com/home'),
         ('zip',              'https://pettitscanoerental.wixsite.com/home'),
         ('phone',            'https://pettitscanoerental.wixsite.com/home'),
         ('email',            'https://pettitscanoerental.wixsite.com/home'),
         ('website',          'https://pettitscanoerental.wixsite.com/home'),
         ('description',      'https://pettitscanoerental.wixsite.com/home/canoe-rentals'),
         ('services_offered', 'https://pettitscanoerental.wixsite.com/home/lodging'),
         ('fee_range',        'https://pettitscanoerental.wixsite.com/home/canoe-rentals'),
         ('cabin_count',      'https://www.ozarkcountytimes.com/news-local-news/north-fork-float-trip-guide-float-trip-options-north-fork-river-provide-summer-fun')
       ) AS v(field, source)
 WHERE ns.slug = 'pettits-canoe-rental'
    ON CONFLICT (service_id, field) DO UPDATE
   SET source = excluded.source, checked_at = excluded.checked_at, updated_at = now();

-- Bryant Creek is not theirs.
DELETE FROM public.service_rivers sr
 USING public.nearby_services ns, public.rivers r
 WHERE sr.service_id = ns.id AND sr.river_id = r.id
   AND ns.slug = 'pettits-canoe-rental' AND r.slug = 'bryant-creek';

-- The North Fork link is the one that remains, and it is primary.
UPDATE public.service_rivers sr
   SET is_primary = true
  FROM public.nearby_services ns, public.rivers r
 WHERE sr.service_id = ns.id AND sr.river_id = r.id
   AND ns.slug = 'pettits-canoe-rental' AND r.slug = 'north-fork-white';

-- The duplicate goes. service_rivers cascades; nothing else referenced it
-- (access_point_services 0, campsite_facilities 0, service_field_sources 0).
DELETE FROM public.nearby_services WHERE slug = 'pettits-canoe-campground';

DO $$
DECLARE
  v_rows int; v_links int; v_primaries int; v_sources int; v_city text;
BEGIN
  SELECT count(*) INTO v_rows FROM public.nearby_services
   WHERE slug IN ('pettits-canoe-campground', 'pettits-canoe-rental');
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'expected exactly one Pettit''s row, found %', v_rows;
  END IF;

  SELECT ns.city, count(sr.*), count(sr.*) FILTER (WHERE sr.is_primary)
    INTO v_city, v_links, v_primaries
    FROM public.nearby_services ns
    LEFT JOIN public.service_rivers sr ON sr.service_id = ns.id
   WHERE ns.slug = 'pettits-canoe-rental'
   GROUP BY ns.city;

  IF v_city <> 'Caulfield' THEN
    RAISE EXCEPTION 'city is %, expected Caulfield', v_city;
  END IF;
  IF v_links <> 1 OR v_primaries <> 1 THEN
    RAISE EXCEPTION 'expected one primary river link, found % link(s) / % primary',
      v_links, v_primaries;
  END IF;

  SELECT count(*) INTO v_sources FROM public.service_field_sources sfs
    JOIN public.nearby_services ns ON ns.id = sfs.service_id
   WHERE ns.slug = 'pettits-canoe-rental';
  IF v_sources <> 10 THEN
    RAISE EXCEPTION 'expected 10 field sources, found %', v_sources;
  END IF;
END $$;
