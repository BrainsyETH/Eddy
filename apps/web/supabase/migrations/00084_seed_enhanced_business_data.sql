-- File: supabase/migrations/00084_seed_enhanced_business_data.sql
-- Enhances existing nearby_services entries with booking, capacity, and agency data
-- from the business database PDF. Also inserts new businesses for rivers already in DB.
-- Scope: meramec, huzzah, courtois, current, jacks-fork, eleven-point, big-piney only.

BEGIN;

-- ============================================
-- PART 1: UPDATE EXISTING BUSINESSES
-- Add managing_agency, booking_platform, capacity, fees, reservation_url, details
-- ============================================

-- HUZZAH / COURTOIS / MERAMEC corridor

UPDATE nearby_services SET
  email = COALESCE(email, 'jab10bass@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'proprietary',
  cabin_count = 20,
  details = '{"hookups": "full hookup available"}'::jsonb
WHERE slug = 'bass-river-resort';

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'campspot',
  tent_sites = 300,
  rv_sites = 125,
  cabin_count = 57,
  max_guests = 328,
  details = '{"hookups": "20/30/50 amp", "notes": "1 mile riverfront"}'::jsonb
WHERE slug = 'ozark-outdoors-resort';

UPDATE nearby_services SET
  email = COALESCE(email, 'vacation@huzzahvalley.com'),
  managing_agency = 'Private',
  booking_platform = 'proprietary',
  cabin_count = 44,
  details = '{"hookups": "W/E and full hookup, 30/50 amp", "notes": "2.5 miles riverfront, family-run since 1979"}'::jsonb
WHERE slug = 'huzzah-valley-resort';

UPDATE nearby_services SET
  email = COALESCE(email, 'rafting@theraftingco.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only',
  details = '{"hookups": "electric, W/E, full hookup, 20/30/50 amp", "camping": "tent + RV sites"}'::jsonb
WHERE slug = 'the-rafting-company';

UPDATE nearby_services SET
  email = COALESCE(email, '3bridgesraft@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only'
WHERE slug = '3-bridges-raft-rental';

UPDATE nearby_services SET
  email = COALESCE(email, 'oldcove@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'fareharbor',
  tent_sites = 1,
  details = '{"camping": "1 primitive group site"}'::jsonb
WHERE slug = 'old-cove-canoe-kayak';

UPDATE nearby_services SET
  email = COALESCE(email, 'indianspringsfamily@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'woocommerce',
  tent_sites = 32,
  cabin_count = 17,
  details = '{"site_types": "basic/tent, W/E, pull-through, full hookup"}'::jsonb
WHERE slug = 'indian-springs-resort';

UPDATE nearby_services SET
  email = COALESCE(email, 'info@meramecriverresort.com'),
  managing_agency = 'Private',
  booking_platform = 'woocommerce',
  cabin_count = 13,
  max_guests = 500,
  details = '{"notes": "large group area capacity 500"}'::jsonb
WHERE slug = 'birds-nest-lodge';

UPDATE nearby_services SET
  managing_agency = 'USFS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/232391'
WHERE slug = 'red-bluff-campground-usfs';

UPDATE nearby_services SET
  managing_agency = 'MO State Parks',
  booking_platform = 'icampmo',
  reservation_url = 'https://icampmo.com'
WHERE slug = 'onondaga-cave-state-park';

UPDATE nearby_services SET
  managing_agency = 'MO State Parks',
  booking_platform = 'icampmo',
  reservation_url = 'https://icampmo.com'
WHERE slug = 'meramec-state-park';

-- CURRENT RIVER / JACKS FORK corridor

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'proprietary',
  cabin_count = 54,
  max_guests = 216,
  details = '{"units": "54 lodge rooms", "restaurant": "Blue Heron"}'::jsonb
WHERE slug = 'the-landing-current-river';

UPDATE nearby_services SET
  email = COALESCE(email, 'windyscanoe@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only'
WHERE slug = 'windys-floats';

UPDATE nearby_services SET
  email = COALESCE(email, 'info@harveysriverexperience.com'),
  managing_agency = 'Private',
  booking_platform = 'fareharbor'
WHERE slug = 'harveys-alley-spring';

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'phone_only'
WHERE slug = 'two-rivers-canoe-rental';

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'phone_only'
WHERE slug = 'carrs-canoe-rental';

UPDATE nearby_services SET
  email = COALESCE(email, 'akers@currentrivercanoe.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only'
WHERE slug = 'akers-ferry-canoe-rental';

UPDATE nearby_services SET
  email = COALESCE(email, 'jadwincanoerental@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only',
  fee_range = '$4.28/person'
WHERE slug = 'jadwin-canoe-rental';

UPDATE nearby_services SET
  email = COALESCE(email, 'jacksforkcanoe@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only',
  fee_range = '$10-$90/night',
  season_open_month = 4,
  season_close_month = 10
WHERE slug = 'jacks-fork-canoe-rental';

UPDATE nearby_services SET
  email = COALESCE(email, 'info@current-river.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only'
WHERE slug = 'current-river-canoe-rental';

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'phone_only',
  cabin_count = 37,
  details = '{"unit_types": "triplex, duplex, standalone cabins", "capacity_per_unit": "sleep 2-8 per unit"}'::jsonb
WHERE slug = 'circle-b-campground';

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'resnexus',
  cabin_count = 38,
  max_guests = 100,
  details = '{"units": "23 cabins + 14 lodge rooms + 1 cottage"}'::jsonb
WHERE slug = 'jacks-fork-river-resort';

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'direct_website',
  cabin_count = 20,
  max_guests = 70
WHERE slug = 'adventure-river-resort';

UPDATE nearby_services SET
  email = COALESCE(email, 'eminencecamp@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'resnexus',
  details = '{"site_types": "pull-thru RV full hookup, tent W/E, primitive, glamping"}'::jsonb
WHERE slug = 'eminence-cottages-camp';

UPDATE nearby_services SET
  email = COALESCE(email, 'jstewart001@centurytel.net'),
  managing_agency = 'Private',
  booking_platform = 'phone_only',
  details = '{"also_operates": "Horseshoe Holler Horse Camp & RV"}'::jsonb
WHERE slug = 'riverside-motel-eminence';

UPDATE nearby_services SET
  managing_agency = 'MO State Parks',
  booking_platform = 'icampmo',
  reservation_url = 'https://icampmo.com'
WHERE slug = 'echo-bluff-state-park';

UPDATE nearby_services SET
  managing_agency = 'MO State Parks',
  booking_platform = 'icampmo',
  reservation_url = 'https://icampmo.com'
WHERE slug = 'montauk-state-park';

-- NPS Campgrounds
UPDATE nearby_services SET
  managing_agency = 'NPS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174185'
WHERE slug = 'akers-campground-nps';

UPDATE nearby_services SET
  managing_agency = 'NPS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174186'
WHERE slug = 'pulltite-campground-nps';

UPDATE nearby_services SET
  managing_agency = 'NPS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174188'
WHERE slug = 'round-spring-campground-nps';

UPDATE nearby_services SET
  managing_agency = 'NPS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174183'
WHERE slug = 'big-spring-campground-nps';

UPDATE nearby_services SET
  managing_agency = 'NPS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174189'
WHERE slug = 'two-rivers-campground-nps';

UPDATE nearby_services SET
  managing_agency = 'NPS',
  booking_platform = 'recreation_gov',
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174182'
WHERE slug = 'alley-spring-campground-nps';

-- ELEVEN POINT corridor

UPDATE nearby_services SET
  managing_agency = 'Private',
  booking_platform = 'woocommerce',
  rv_sites = 4,
  tent_sites = 16,
  cabin_count = 4,
  max_guests = 34,
  details = '{"hookups": "30-amp, 110v outlets", "notes": "no water/sewer at individual sites"}'::jsonb
WHERE slug = 'hufstedlers-canoe-rental';

UPDATE nearby_services SET
  email = COALESCE(email, 'jasonmstauffer2010@gmail.com'),
  managing_agency = 'Private',
  booking_platform = 'phone_only',
  cabin_count = 2,
  details = '{"cabins": {"large": "3 beds, bath, AC", "small": "queen bed, AC"}}'::jsonb
WHERE slug = 'richards-canoe-rental';

-- ============================================
-- PART 2: INSERT NEW BUSINESSES
-- ============================================

-- HUZZAH / MERAMEC / COURTOIS — new businesses

INSERT INTO nearby_services (name, slug, type, phone, email, website, city, state, zip, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, status, verified_source, display_order, managing_agency, booking_platform, tent_sites, rv_sites, cabin_count, max_guests, details)
VALUES
  ('Arapaho Campground', 'arapaho-campground', 'campground', '573-468-3218', NULL, NULL, 'Steelville', 'MO', '65565',
   'Private campground near Steelville with riverfront and wooded sites. Electric and W/E hookups for RVs. Tent camping available.',
   ARRAY['camping_primitive','camping_rv']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, 'active', 'business_database_2026', 30,
   'Private', 'phone_only', 60, 20, NULL, NULL, '{"site_types": "14 riverfront w/electric, 20 RV W/E, primitive tent"}'::jsonb),

  ('Blue Springs Ranch', 'blue-springs-ranch', 'campground', NULL, 'bluesprings@dreamoutdoorresorts.com', 'https://bluespringsranch.com', 'Bourbon', 'MO', '65441',
   'Large resort campground near Bourbon with 200+ sites, cabins, and full amenities. Part of Dream Outdoor Resorts portfolio.',
   ARRAY['camping_primitive','camping_rv','cabins','showers','swimming_pool']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 32,
   'Private', 'newbook', NULL, NULL, 33, NULL, '{"notes": "200+ total sites, Dream Outdoor Resorts portfolio"}'::jsonb),

  ('RiverHills Retreats', 'riverhills-retreats', 'cabin_lodge', NULL, 'info@riverhillsretreats.com', 'https://riverhillsretreats.com', 'Steelville', 'MO', '65565',
   '8 retreat properties near Steelville accommodating up to 160 guests total. Select properties have RV hookups.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 36,
   'Private', 'direct_website', NULL, NULL, 8, 160, '{"notes": "select properties have RV hookups"}'::jsonb),

  ('4J Vacation Rentals', '4j-vacation-rentals', 'cabin_lodge', NULL, 'jessica@murphyscabins.com', NULL, 'Steelville', 'MO', '65565',
   'Vacation rental cabins near Steelville with 8 cabins sleeping up to 55 guests. One RV hookup site available.',
   ARRAY['cabins','camping_rv']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 37,
   'Private', 'lodgix', NULL, 1, 8, 55, NULL),

  ('Kick''n K Farmhouse', 'kickn-k-farmhouse', 'cabin_lodge', NULL, 'tracey@kicknk.com', NULL, 'Steelville', 'MO', '65565',
   'Farmhouse-style vacation rentals near Steelville. 4 units sleeping up to 22 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 38,
   'Private', 'direct_website', NULL, NULL, 4, 22, NULL),

  ('Driftwood Vacation Rentals', 'driftwood-vacation-rentals', 'cabin_lodge', NULL, 'contact@driftwoodriverlodge.com', NULL, 'Steelville', 'MO', '65565',
   'River lodge and cabin vacation rentals near Steelville. 7 units sleeping up to 50 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 39,
   'Private', 'airbnb', NULL, NULL, 7, 50, NULL),

  ('Caveman Floating at Meramec Caverns', 'caveman-floating-meramec-caverns', 'outfitter', NULL, 'info@americascave.com', 'https://www.americascave.com', 'Stanton', 'MO', '63079',
   'Float trip outfitter at Meramec Caverns in Stanton. 18 tent sites and float trip services on the Meramec River.',
   ARRAY['canoe_rental','kayak_rental','tube_rental','shuttle','camping_primitive']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 48,
   'Private', 'fareharbor', 18, NULL, NULL, NULL, NULL),

  ('Meramec Park Concessions', 'meramec-park-concessions', 'outfitter', NULL, 'Meramec@BAServes.com', NULL, 'Sullivan', 'MO', '63080',
   'Concessioner at Meramec State Park offering canoe/kayak rentals, shuttle service, and 19 cabin rentals within the park.',
   ARRAY['canoe_rental','kayak_rental','shuttle','cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 46,
   'Private', 'fareharbor', NULL, NULL, 19, NULL, NULL)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone,
  email = EXCLUDED.email, website = EXCLUDED.website, city = EXCLUDED.city,
  state = EXCLUDED.state, zip = EXCLUDED.zip, description = EXCLUDED.description,
  services_offered = EXCLUDED.services_offered, seasonal_notes = EXCLUDED.seasonal_notes,
  nps_authorized = EXCLUDED.nps_authorized, usfs_authorized = EXCLUDED.usfs_authorized,
  status = EXCLUDED.status, verified_source = EXCLUDED.verified_source,
  display_order = EXCLUDED.display_order, managing_agency = EXCLUDED.managing_agency,
  booking_platform = EXCLUDED.booking_platform, tent_sites = EXCLUDED.tent_sites,
  rv_sites = EXCLUDED.rv_sites, cabin_count = EXCLUDED.cabin_count,
  max_guests = EXCLUDED.max_guests, details = EXCLUDED.details;

-- CURRENT RIVER / JACKS FORK — new businesses

INSERT INTO nearby_services (name, slug, type, phone, email, website, city, state, zip, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, status, verified_source, display_order, managing_agency, booking_platform, tent_sites, rv_sites, cabin_count, max_guests, details)
VALUES
  ('RiverTime RV', 'rivertime-rv', 'campground', NULL, 'rivertimerv@gmail.com', NULL, 'Eminence', 'MO', '65466',
   'Small RV park near Eminence with 10 RV sites and 2 tent sites. Full hookup W/E/S with 20/30/50 amp service.',
   ARRAY['camping_rv','camping_primitive']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 50,
   'Private', 'phone_only', 2, 10, NULL, NULL, '{"hookups": "full hookup W/E/S, 20/30/50 amp", "site_types": "2 pull-through + 6 back-in"}'::jsonb),

  ('Stay Current River', 'stay-current-river', 'campground', NULL, 'info@staycurrentriver.com', 'https://staycurrentriver.com', 'Eminence', 'MO', '65466',
   'Campground and cabin resort near Eminence with 10 cabins, full hookup RV sites, pool, and mini-golf.',
   ARRAY['camping_rv','cabins','swimming_pool']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 52,
   'Private', 'campspot', NULL, NULL, 10, 70, '{"hookups": "full hookup 30/50 amp", "amenities": "pool, mini-golf"}'::jsonb),

  ('Shady Lane Cabins', 'shady-lane-cabins', 'cabin_lodge', NULL, 'shadylaneresort@gmail.com', NULL, 'Eminence', 'MO', '65466',
   'Cabin resort near Eminence with 14 cabins sleeping up to 70 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 54,
   'Private', 'book_it_now', NULL, NULL, 14, 70, NULL),

  ('River''s Edge Resort', 'rivers-edge-resort-eminence', 'cabin_lodge', NULL, 'ejohnmeyer53@gmail.com', 'https://riversedge-eminence.com', 'Eminence', 'MO', '65466',
   'Cabin resort near Eminence on the Jacks Fork River. 15 cabins sleeping up to 90 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 56,
   'Private', 'cloudbeds', NULL, NULL, 15, 90, NULL),

  ('Crystal Creek Ranch', 'crystal-creek-ranch', 'cabin_lodge', NULL, 'info@CrystalCreekRanch.org', 'https://crystalcreekranch.org', 'Eminence', 'MO', '65466',
   'Ranch-style cabin retreat near Eminence. 8 cabins sleeping up to 53 guests. Listed on Hipcamp.',
   ARRAY['cabins','horseback_riding']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 58,
   'Private', 'hipcamp', NULL, NULL, 8, 53, NULL),

  ('Shawnee Creek Cottages', 'shawnee-creek-cottages', 'cabin_lodge', NULL, 'cmccoll@outlook.com', NULL, 'Eminence', 'MO', '65466',
   'Cottage rentals near Eminence. 5 cottages sleeping up to 25 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 59,
   'Private', 'phone_only', NULL, NULL, 5, 25, NULL),

  ('River Ridge Cabins', 'river-ridge-cabins', 'cabin_lodge', NULL, 'oarentals@yahoo.com', NULL, 'Eminence', 'MO', '65466',
   'Cabin rentals near Eminence. 4 cabins sleeping up to 20 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 60,
   'Private', 'phone_only', NULL, NULL, 4, 20, NULL),

  ('OA Rental Properties', 'oa-rental-properties', 'cabin_lodge', NULL, 'oarentals@yahoo.com', NULL, 'Eminence', 'MO', '65466',
   'Vacation rental properties near Eminence. 6 units available.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 61,
   'Private', 'phone_only', NULL, NULL, 6, NULL, NULL),

  ('Story''s Creek Campground', 'storys-creek-campground', 'campground', NULL, NULL, NULL, 'Eminence', 'MO', '65466',
   'RV campground near Eminence with 22 RV sites and horse stalls. 30/50 amp service.',
   ARRAY['camping_rv','horseback_riding']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 63,
   'Private', 'firefly', NULL, 22, NULL, NULL, '{"hookups": "30/50 amp", "extras": "horse stalls $7/night"}'::jsonb),

  ('Current River Campground', 'current-river-campground-van-buren', 'campground', NULL, NULL, NULL, 'Van Buren', 'MO', '63965',
   'Campground near Van Buren on the lower Current River.',
   ARRAY['camping_rv','camping_primitive']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 93,
   'Private', 'roverpass', NULL, NULL, NULL, NULL, NULL)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone,
  email = EXCLUDED.email, website = EXCLUDED.website, city = EXCLUDED.city,
  state = EXCLUDED.state, zip = EXCLUDED.zip, description = EXCLUDED.description,
  services_offered = EXCLUDED.services_offered, seasonal_notes = EXCLUDED.seasonal_notes,
  nps_authorized = EXCLUDED.nps_authorized, usfs_authorized = EXCLUDED.usfs_authorized,
  status = EXCLUDED.status, verified_source = EXCLUDED.verified_source,
  display_order = EXCLUDED.display_order, managing_agency = EXCLUDED.managing_agency,
  booking_platform = EXCLUDED.booking_platform, tent_sites = EXCLUDED.tent_sites,
  rv_sites = EXCLUDED.rv_sites, cabin_count = EXCLUDED.cabin_count,
  max_guests = EXCLUDED.max_guests, details = EXCLUDED.details;

-- ELEVEN POINT — new businesses

INSERT INTO nearby_services (name, slug, type, phone, email, website, city, state, zip, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, status, verified_source, display_order, managing_agency, booking_platform, tent_sites, rv_sites, cabin_count, max_guests, details)
VALUES
  ('Camp River Campground', 'camp-river-campground', 'campground', NULL, NULL, NULL, 'Alton', 'MO', '65606',
   'Campground near Alton on the Eleven Point River. 11 tent sites, 8 RV sites, and 6 cabins.',
   ARRAY['camping_primitive','camping_rv','cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 30,
   'Private', 'hipcamp', 11, 8, 6, 30, NULL),

  ('Eleven Point Cottages', 'eleven-point-cottages', 'cabin_lodge', NULL, 'canoe@ortrackm.org', NULL, 'Alton', 'MO', '65606',
   'Cottage rentals on the Eleven Point River near Alton. 5 cottages sleeping up to 33 guests. Note: may be closing.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 35,
   'Private', 'phone_only', NULL, NULL, 5, 33, '{"notes": "may be closing — verify before booking"}'::jsonb),

  ('Briarwood Cabins', 'briarwood-cabins-alton', 'cabin_lodge', NULL, NULL, NULL, 'Alton', 'MO', '65606',
   'Cabin rentals near Alton on the Eleven Point River. 3 cabins sleeping up to 14 guests.',
   ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 36,
   'Private', 'phone_only', NULL, NULL, 3, 14, NULL)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone,
  email = EXCLUDED.email, website = EXCLUDED.website, city = EXCLUDED.city,
  state = EXCLUDED.state, zip = EXCLUDED.zip, description = EXCLUDED.description,
  services_offered = EXCLUDED.services_offered, seasonal_notes = EXCLUDED.seasonal_notes,
  nps_authorized = EXCLUDED.nps_authorized, usfs_authorized = EXCLUDED.usfs_authorized,
  status = EXCLUDED.status, verified_source = EXCLUDED.verified_source,
  display_order = EXCLUDED.display_order, managing_agency = EXCLUDED.managing_agency,
  booking_platform = EXCLUDED.booking_platform, tent_sites = EXCLUDED.tent_sites,
  rv_sites = EXCLUDED.rv_sites, cabin_count = EXCLUDED.cabin_count,
  max_guests = EXCLUDED.max_guests, details = EXCLUDED.details;

-- BIG PINEY — new businesses

INSERT INTO nearby_services (name, slug, type, phone, email, website, city, state, zip, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, status, verified_source, display_order, managing_agency, booking_platform, tent_sites, rv_sites, cabin_count, max_guests, details)
VALUES
  ('BSC Outdoors', 'bsc-outdoors', 'outfitter', NULL, 'larryh@bscoutdoors.com', 'https://bscoutdoors.com', 'Jerome', 'MO', '65529',
   'Full-service outfitter on the Big Piney River. 40 RV sites with 20/30/50 amp hookups, 8 cabins, and float trip services.',
   ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','camping_rv','cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 10,
   'Private', 'other', NULL, 40, 8, 48, '{"hookups": "20/30 amp W/E, 50 amp full hookup, pull-thrus available", "booking_system": "Big Rig Media"}'::jsonb),

  ('Rt 66 Canoe Rental', 'rt66-canoe-rental', 'outfitter', NULL, 'rt66canoe@socket.net', NULL, 'Jerome', 'MO', '65529',
   'Canoe and kayak outfitter on the Big Piney River near Jerome on Route 66.',
   ARRAY['canoe_rental','kayak_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 20,
   'Private', 'phone_only', NULL, NULL, NULL, NULL, NULL),

  ('Devil''s Elbow River Safari', 'devils-elbow-river-safari', 'campground', NULL, NULL, NULL, 'Devils Elbow', 'MO', '65457',
   'Campground on the Big Piney River at Devil''s Elbow. 50 tent sites and 7 RV sites.',
   ARRAY['camping_primitive','camping_rv']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 25,
   'Private', 'other', 50, 7, NULL, NULL, '{"booking_system": "Big Rig Media"}'::jsonb),

  ('Peck''s Last Resort', 'pecks-last-resort', 'outfitter', NULL, 'peckscanoes@gmail.com', NULL, 'Jerome', 'MO', '65529',
   'Outfitter and small campground on the Big Piney River. 9 RV sites and 2 cabins.',
   ARRAY['canoe_rental','kayak_rental','shuttle','camping_rv','cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 30,
   'Private', 'phone_only', NULL, 9, 2, 8, NULL),

  ('Froggy''s River Resort', 'froggys-river-resort', 'campground', NULL, 'froggysriverresort@gmail.com', NULL, 'Jerome', 'MO', '65529',
   'River resort campground on the Big Piney River. 35 tent sites and 1 cabin.',
   ARRAY['camping_primitive','cabins']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 35,
   'Private', 'parkwithus', 35, NULL, 1, NULL, NULL),

  ('Gasconade Hills Resort', 'gasconade-hills-resort', 'cabin_lodge', NULL, 'info@gasconadehills.com', 'https://gasconadehills.com', 'Jerome', 'MO', '65529',
   'Resort near Jerome with 18 cabins and 30 RV sites. Full amenities for Big Piney River floaters.',
   ARRAY['cabins','camping_rv','showers']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 40,
   'Private', 'smartsheet', NULL, 30, 18, 90, NULL),

  ('Ruby''s Landing', 'rubys-landing', 'campground', NULL, 'rubyslanding.mo@gmail.com', NULL, 'Jerome', 'MO', '65529',
   'Large campground on the Big Piney River with 100 RV sites, 12 tent sites, and 12 cabins.',
   ARRAY['camping_rv','camping_primitive','cabins','showers']::service_offering[], NULL, FALSE, FALSE, 'active', 'business_database_2026', 45,
   'Private', 'resnexus', 12, 100, 12, 120, NULL)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone,
  email = EXCLUDED.email, website = EXCLUDED.website, city = EXCLUDED.city,
  state = EXCLUDED.state, zip = EXCLUDED.zip, description = EXCLUDED.description,
  services_offered = EXCLUDED.services_offered, seasonal_notes = EXCLUDED.seasonal_notes,
  nps_authorized = EXCLUDED.nps_authorized, usfs_authorized = EXCLUDED.usfs_authorized,
  status = EXCLUDED.status, verified_source = EXCLUDED.verified_source,
  display_order = EXCLUDED.display_order, managing_agency = EXCLUDED.managing_agency,
  booking_platform = EXCLUDED.booking_platform, tent_sites = EXCLUDED.tent_sites,
  rv_sites = EXCLUDED.rv_sites, cabin_count = EXCLUDED.cabin_count,
  max_guests = EXCLUDED.max_guests, details = EXCLUDED.details;

-- ============================================
-- PART 3: SERVICE_RIVERS LINKS FOR NEW BUSINESSES
-- ============================================

-- Meramec / Huzzah / Courtois corridor — new businesses
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('arapaho-campground', 'huzzah', TRUE, 'Steelville area'),
  ('arapaho-campground', 'meramec', FALSE, 'Via shuttle'),
  ('blue-springs-ranch', 'meramec', TRUE, 'Bourbon area'),
  ('riverhills-retreats', 'meramec', TRUE, 'Steelville area'),
  ('riverhills-retreats', 'huzzah', FALSE, 'Via shuttle'),
  ('4j-vacation-rentals', 'meramec', TRUE, 'Steelville area'),
  ('4j-vacation-rentals', 'huzzah', FALSE, 'Via shuttle'),
  ('kickn-k-farmhouse', 'meramec', TRUE, 'Steelville area'),
  ('driftwood-vacation-rentals', 'meramec', TRUE, 'Steelville area'),
  ('caveman-floating-meramec-caverns', 'meramec', TRUE, 'Stanton / Meramec Caverns'),
  ('meramec-park-concessions', 'meramec', TRUE, 'Sullivan / Meramec State Park')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

-- Current River / Jacks Fork — new businesses
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('rivertime-rv', 'current', TRUE, 'Eminence area'),
  ('rivertime-rv', 'jacks-fork', FALSE, 'Eminence area'),
  ('stay-current-river', 'current', TRUE, 'Eminence area'),
  ('stay-current-river', 'jacks-fork', FALSE, 'Eminence area'),
  ('shady-lane-cabins', 'jacks-fork', TRUE, 'Eminence area'),
  ('shady-lane-cabins', 'current', FALSE, 'Eminence area'),
  ('rivers-edge-resort-eminence', 'jacks-fork', TRUE, 'Eminence area'),
  ('rivers-edge-resort-eminence', 'current', FALSE, 'Eminence area'),
  ('crystal-creek-ranch', 'jacks-fork', TRUE, 'Eminence area'),
  ('crystal-creek-ranch', 'current', FALSE, 'Eminence area'),
  ('shawnee-creek-cottages', 'jacks-fork', TRUE, 'Eminence area'),
  ('river-ridge-cabins', 'jacks-fork', TRUE, 'Eminence area'),
  ('oa-rental-properties', 'jacks-fork', TRUE, 'Eminence area'),
  ('oa-rental-properties', 'current', FALSE, 'Eminence area'),
  ('storys-creek-campground', 'jacks-fork', TRUE, 'Eminence area'),
  ('current-river-campground-van-buren', 'current', TRUE, 'Van Buren / lower Current')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

-- Eleven Point — new businesses
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('camp-river-campground', 'eleven-point', TRUE, 'Alton area'),
  ('eleven-point-cottages', 'eleven-point', TRUE, 'Alton area'),
  ('briarwood-cabins-alton', 'eleven-point', TRUE, 'Alton area')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

-- Big Piney — new businesses
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('bsc-outdoors', 'big-piney', TRUE, 'Jerome area'),
  ('rt66-canoe-rental', 'big-piney', TRUE, 'Jerome / Route 66'),
  ('devils-elbow-river-safari', 'big-piney', TRUE, 'Devils Elbow'),
  ('pecks-last-resort', 'big-piney', TRUE, 'Jerome area'),
  ('froggys-river-resort', 'big-piney', TRUE, 'Jerome area'),
  ('gasconade-hills-resort', 'big-piney', TRUE, 'Jerome area'),
  ('rubys-landing', 'big-piney', TRUE, 'Jerome area')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

COMMIT;
