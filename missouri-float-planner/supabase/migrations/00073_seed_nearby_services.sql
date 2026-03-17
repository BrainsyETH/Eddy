-- File: supabase/migrations/00073_seed_nearby_services.sql
-- Seeds nearby_services and service_rivers tables with outfitters,
-- campgrounds, cabins, and lodging for eddy.guide rivers.
-- Data source: scripts/seed-nearby-services.ts

BEGIN;

-- ============================================
-- CURRENT RIVER — UPPER (Montauk to Round Spring)
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Montauk State Park', 'montauk-state-park', 'cabin_lodge', '573-548-2201', '800-334-6946', NULL, 'https://mostateparks.com/park/montauk-state-park', '345 County Road 6670', 'Salem', 'MO', '65560', 37.4407, -91.6739, 'State park at the headwaters of the Current River, fed by Montauk Spring. Famous for trout fishing (catch-and-release and harvest seasons). Offers cabins, lodge rooms, campground, and dining.', ARRAY['cabins','lodge_rooms','camping_rv','camping_primitive','food_service','general_store','fishing_supplies','showers']::service_offering[], 'Park open year-round. Trout season Mar 1 – Oct 31. Lodge and dining seasonal.', FALSE, FALSE, NULL, NULL, 'active', 'mostateparks.com, existing_codebase', 'Near headwaters — popular base camp for upper Current floats. Not technically an outfitter but floaters use it heavily.', 10),

  ('Current River Canoe Rental', 'current-river-canoe-rental', 'outfitter', '573-858-3250', NULL, NULL, 'https://currentrivercanoe.com', NULL, 'Salem', 'MO', '65560', NULL, NULL, 'Full-service outfitter near Pulltite and Cedar Grove on the upper Current River. Canoe, kayak, raft, and tube rentals with shuttle service.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_primitive']::service_offering[], 'Open April through October.', TRUE, FALSE, NULL, NULL, 'active', 'mcfa_directory, knowledge_base', 'NPS authorized concessioner. Operates at Pulltite and Cedar Grove areas.', 20),

  ('Running River Canoe Rental', 'running-river-canoe-rental', 'outfitter', '573-858-3371', NULL, NULL, 'https://runningrivercanoe.com', NULL, 'Salem', 'MO', '65560', NULL, NULL, 'Family-owned outfitter since 1979 serving the upper Current River area near Salem. Canoe, kayak, raft, and tube rentals with shuttle service.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'active', 'runningrivercanoe.com, tripadvisor, user_report_2026', 'Family-owned since 1979. Phone corrected to 573-858-3371 (was 573-858-3214). Also offers rafts and tubes per Tripadvisor.', 30),

  ('Akers Ferry Canoe Rental', 'akers-ferry-canoe-rental', 'outfitter', '573-858-3224', NULL, NULL, 'https://akersferrycanoe.com', NULL, 'Salem', 'MO', '65560', NULL, NULL, 'NPS authorized outfitter at Akers Ferry on the Current River. One of the most popular put-in locations. Canoe, kayak, raft, and tube rentals with full shuttle service.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_primitive','general_store']::service_offering[], 'Open April through October.', TRUE, FALSE, NULL, NULL, 'active', 'nps_concessioner_list, mcfa_directory', 'NPS authorized concessioner at Akers. Historic ferry crossing site.', 40),

  ('Jadwin Canoe Rental', 'jadwin-canoe-rental', 'outfitter', '573-729-5229', NULL, NULL, 'https://jadwincanoe.com', NULL, 'Jadwin', 'MO', '65501', NULL, NULL, 'NPS authorized outfitter at Jadwin on the Current River. Serves the mid-Current section between Akers and Round Spring. Canoe, kayak, and raft rentals.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','camping_primitive']::service_offering[], 'Open April through October.', TRUE, FALSE, NULL, NULL, 'active', 'nps_concessioner_list, mcfa_directory', 'NPS authorized concessioner at Jadwin.', 50)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- CURRENT RIVER — NPS CAMPGROUNDS
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Akers Campground', 'akers-campground-nps', 'campground', '573-323-4236', NULL, NULL, 'https://www.nps.gov/ozar/planyourvisit/akers.htm', NULL, 'Salem', 'MO', '65560', NULL, NULL, 'NPS-managed campground at Akers Ferry within Ozark National Scenic Riverways. Walk-in sites on a scenic bluff above the Current River near the historic Akers Ferry crossing.', ARRAY['camping_primitive','showers']::service_offering[], 'Open year-round. Water and services may be limited in winter.', FALSE, FALSE, NULL, NULL, 'active', 'nps.gov/ozar', 'NPS-managed campground, not a private business. First-come, first-served.', 45),

  ('Pulltite Campground', 'pulltite-campground-nps', 'campground', '573-323-4236', NULL, NULL, 'https://www.nps.gov/ozar/planyourvisit/pulltite.htm', NULL, 'Salem', 'MO', '65560', NULL, NULL, 'NPS-managed campground at Pulltite Spring within ONSR. Scenic spring-fed swimming area and popular put-in for Current River floats.', ARRAY['camping_primitive']::service_offering[], 'Open year-round. Limited services in winter.', FALSE, FALSE, NULL, NULL, 'active', 'nps.gov/ozar', 'NPS-managed. Pulltite Spring is a popular swimming spot.', 25),

  ('Round Spring Campground', 'round-spring-campground-nps', 'campground', '573-323-4236', NULL, NULL, 'https://www.nps.gov/ozar/planyourvisit/round-spring.htm', NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'NPS-managed campground at Round Spring on the Current River. Features cave tours, spring viewing, and river access. Popular mid-point stop between Salem and Eminence.', ARRAY['camping_primitive','showers']::service_offering[], 'Open year-round. Cave tours seasonal (spring-fall).', FALSE, FALSE, NULL, NULL, 'active', 'nps.gov/ozar', 'NPS-managed. USGS gauge at Round Spring broke and was never replaced — no functioning gauge here.', 55),

  ('Big Spring Campground', 'big-spring-campground-nps', 'campground', '573-323-4236', NULL, NULL, 'https://www.nps.gov/ozar/planyourvisit/big-spring.htm', NULL, 'Van Buren', 'MO', '63965', NULL, NULL, 'NPS-managed campground at Big Spring, the largest spring in the Ozarks and one of the largest in the US. Located on the lower Current River near Van Buren.', ARRAY['camping_primitive','camping_rv','showers']::service_offering[], 'Open year-round. Some sites reservable, others first-come.', FALSE, FALSE, NULL, NULL, 'active', 'nps.gov/ozar', 'NPS-managed. Big Spring pumps ~286 million gallons/day. Historic CCC lodge on-site (now a museum).', 90),

  ('Two Rivers Campground', 'two-rivers-campground-nps', 'campground', '573-323-4236', NULL, NULL, 'https://www.nps.gov/ozar/planyourvisit/two-rivers.htm', NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'NPS-managed campground at the confluence of the Jacks Fork and Current Rivers. Strategic location for floating either river.', ARRAY['camping_primitive']::service_offering[], 'Open year-round.', FALSE, FALSE, NULL, NULL, 'active', 'nps.gov/ozar', 'NPS-managed. At the confluence — convenient for both Current and Jacks Fork floats.', 70)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- CURRENT RIVER — LOWER (Eminence to Van Buren)
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Carr''s Canoe Rental', 'carrs-canoe-rental', 'outfitter', '573-858-3240', '800-333-3956', 'info@carrscanoerental.com', 'https://www.carrscanoerental.com/', 'HCR 1, Box 137', 'Eminence', 'MO', '65466', NULL, NULL, 'Family-owned outfitter (50+ years) serving both the Current River and Jacks Fork. Canoe, kayak, raft, and tube rentals with shuttle. Two locations: Jacks Fork near Eminence and Round Spring on the Current River. Services local lodging, campgrounds, and Echo Bluff State Park.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'active', 'carrscanoerental.com', 'Family owned 50+ years. Two locations (Jacks Fork near Eminence + Round Spring on Current River).', 60),

  ('Windy''s Floats', 'windys-floats', 'outfitter', '573-226-3404', '866-889-8177', 'windys@socket.net', 'https://windysfloats.com/', '513 N. Main St', 'Eminence', 'MO', '65466', NULL, NULL, 'Largest canoe rental on the Jacks Fork River. NPS authorized concessioner serving both the Current River and Jacks Fork since 1969. Canoe, kayak, raft, and tube rentals with shuttle. Weekday and group rates. Pets allowed in shuttle vehicles and boats (not rafts).', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle']::service_offering[], 'Open Apr 1 – Oct 15. Mon-Sun 8am-6pm.', TRUE, FALSE, 'Chris & Robin Brewer', NULL, 'active', 'windysfloats.com, nps_concessioner_list', 'NPS authorized concessioner. Largest on Jacks Fork. Family owned since 1969, served 500k+ people.', 65),

  ('Silver Arrow Canoe Rental', 'silver-arrow-canoe-rental', 'outfitter', '573-323-4657', NULL, NULL, NULL, NULL, 'Van Buren', 'MO', '63965', NULL, NULL, 'Outfitter near Van Buren serving the lower Current River. Canoe, kayak, and tube rentals with shuttle service for the Big Spring area.', ARRAY['canoe_rental','kayak_rental','tube_rental','shuttle']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'unverified', 'knowledge_base', 'Lower Current near Van Buren / Big Spring area.', 95),

  ('Cave Country Canoes', 'cave-country-canoes', 'outfitter', NULL, NULL, NULL, NULL, NULL, 'Van Buren', 'MO', '63965', NULL, NULL, 'Outfitter in the Van Buren area serving the lower Current River. Named for the numerous caves along this section of the river.', ARRAY['canoe_rental','kayak_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'unverified', 'knowledge_base', 'Need to verify current operating status and contact info.', 96),

  ('KC''s On The Current', 'kcs-on-the-current', 'outfitter', '573-996-7961', NULL, NULL, NULL, NULL, 'Doniphan', 'MO', '63935', NULL, NULL, 'Outfitter serving the lower Current River near Doniphan. Canoe and kayak rentals with shuttle service.', ARRAY['canoe_rental','kayak_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'active', 'mo_scenic_rivers_directory, user_report_2026', 'Corrected city: Doniphan per Missouri Scenic Rivers directory, not just Deerleap. Serves lower Current near Doniphan.', 97)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- CURRENT RIVER — LODGING
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Echo Bluff State Park', 'echo-bluff-state-park', 'cabin_lodge', '573-226-3720', '844-235-8337', NULL, 'https://mostateparks.com/park/echo-bluff-state-park', '34489 Echo Bluff Drive', 'Eminence', 'MO', '65466', 37.1590, -91.4060, 'Newest Missouri state park (opened 2016), located between the Current River and Jacks Fork near Eminence. Features lodge rooms, cabins, campground, dining hall, and swimming pool. Popular base camp for ONSR floaters.', ARRAY['cabins','lodge_rooms','camping_rv','camping_primitive','food_service','swimming_pool','showers','wifi']::service_offering[], 'Open year-round. Pool open Memorial Day through Labor Day.', FALSE, FALSE, NULL, NULL, 'active', 'mostateparks.com', 'Opened 2016. Very popular — book early for summer weekends. Located on Sinking Creek between Current and Jacks Fork.', 62),

  ('Current River State Park', 'current-river-state-park', 'campground', '573-226-3720', NULL, NULL, 'https://mostateparks.com/park/current-river-state-park', NULL, 'Salem', 'MO', '65560', NULL, NULL, 'State park along the Current River offering camping and hiking. Adjacent to the Ozark National Scenic Riverways.', ARRAY['camping_primitive','camping_rv']::service_offering[], 'Open year-round.', FALSE, FALSE, NULL, NULL, 'active', 'mostateparks.com', NULL, 35),

  ('Big Spring Lodge & Cabins', 'big-spring-lodge', 'cabin_lodge', '573-323-4423', NULL, NULL, NULL, NULL, 'Van Buren', 'MO', '63965', NULL, NULL, 'Historic CCC-era lodge and cabins at Big Spring on the lower Current River. Located within Ozark National Scenic Riverways near the largest spring in the Ozarks.', ARRAY['cabins','lodge_rooms']::service_offering[], 'Seasonal operation.', FALSE, FALSE, NULL, NULL, 'unverified', 'knowledge_base', 'Historic CCC lodge. Verify current operating status — has had intermittent closures.', 92),

  ('Cobblestone Lodge', 'cobblestone-lodge', 'cabin_lodge', NULL, NULL, NULL, 'https://cobblestonelodge.com', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'All-inclusive family resort in Steelville on the Meramec River. Lodge rooms and resort amenities for floaters and families.', ARRAY['lodge_rooms']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'active', 'cobblestonelodge.com, user_report_2026', 'Corrected location: Steelville on the Meramec River, not Eminence/Current+Jacks Fork.', 68)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- JACKS FORK RIVER
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Harvey''s Alley Spring Canoe Rental', 'harveys-alley-spring', 'outfitter', '573-226-3386', '888-963-5628', NULL, 'https://harveysalleyspring.com/', 'HC 3, Box 18', 'Eminence', 'MO', '65466', NULL, NULL, 'NPS authorized concessioner at Alley Spring on the Jacks Fork River. Established 1963 by Harvey & Edna Staples. Canoe, kayak, raft, and tube rentals with shuttle service on both the Jacks Fork and Current River. Main office 6 mi west of Eminence on Hwy 106; satellite at Hwys 19 & 106 in Eminence.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_primitive']::service_offering[], 'Open April through October. Sun-Fri 8am, Sat 7am.', TRUE, FALSE, 'Danny & Barb Staples', NULL, 'active', 'nps_concessioner_list, harveysalleyspring.com', 'NPS authorized concessioner. Main office at Alley Spring, satellite in Eminence. Serves both Jacks Fork and Current River.', 10),

  ('Two Rivers Canoe Rental', 'two-rivers-canoe-rental', 'outfitter', '573-226-3478', '888-833-4931', 'float@2riverscanoe.com', 'https://www.2riverscanoe.com/', '21575 State Route V', 'Eminence', 'MO', '65466', NULL, NULL, 'Outfitter at the junction of the Current & Jacks Fork Rivers on Hwy V east of Eminence. Canoe, kayak, raft, and tube rentals with shuttle. Also has a campground and store with groceries. Year-round float trips.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_primitive','general_store']::service_offering[], 'Year-round float trips available.', FALSE, FALSE, NULL, NULL, 'active', '2riverscanoe.com', 'Located at "Two Rivers" confluence. Best outfitter to use if taking out at Two Rivers.', 20),

  ('Eminence Canoe Rental', 'eminence-canoe-rental', 'outfitter', NULL, NULL, NULL, NULL, NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'Outfitter based in Eminence serving the Jacks Fork River.', ARRAY['canoe_rental','kayak_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'unverified', 'knowledge_base', 'Verify if still operating. May have merged or closed.', 30),

  ('Alley Spring Campground', 'alley-spring-campground-nps', 'campground', '573-323-4236', NULL, 'OZAR_Campground_Operations@nps.gov', 'https://www.nps.gov/ozar/planyourvisit/alley-spring.htm', NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'NPS-managed campground at Alley Spring, one of the most photographed spots in the Ozarks. 162 campsites (28 electric). Features the iconic red Alley Mill (1894) and brilliant blue spring. Located on the Jacks Fork River. Swimming area, amphitheater, visitor center, camp store.', ARRAY['camping_primitive','camping_rv','showers','general_store']::service_offering[], 'Reservations Apr 15 – Oct 15 via Recreation.gov. First-come first-served Oct 16 – Apr 14. Water off Oct 15 – Apr 14 (heated showers year-round).', FALSE, FALSE, NULL, NULL, 'active', 'nps.gov/ozar', 'NPS-managed. Alley Spring is the 7th largest spring in Missouri (~81M gallons/day). Historic Alley Mill is a must-see.', 15),

  ('Circle B Campground & Resort', 'circle-b-campground', 'campground', '573-226-3618', NULL, 'circlebcampground@gmail.com', 'https://circlebcampground.com/', '18823 Circle B Road', 'Eminence', 'MO', '65466', NULL, NULL, 'Riverfront campground and resort in Eminence. Air-conditioned cabins with bathrooms and kitchens, tent camping, full RV hookups, canoe rentals, store, showers, and public laundry. The 8-mile Circle B to Two Rivers float is especially recommended.', ARRAY['canoe_rental','kayak_rental','shuttle','camping_rv','camping_primitive','cabins','showers','general_store']::service_offering[], 'Seasonal — typically March through November.', FALSE, FALSE, NULL, NULL, 'active', 'circlebcampground.com', 'Private campground within the ONSR area. Primarily a campground with boat rental services.', 25),

  ('Jacks Fork Canoe Rental & Campground', 'jacks-fork-canoe-rental', 'outfitter', '573-858-3221', '800-522-5736', NULL, 'https://www.jacksforkcanoe.com/', '19433 Missouri 106', 'Eminence', 'MO', '65466', NULL, NULL, 'Combined outfitter and campground directly on the Jacks Fork River. Canoe, kayak, raft, and tube rentals. Campground with sites ranging from primitive to full hookups.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_primitive','camping_rv']::service_offering[], 'Open Apr 15 – Oct.', FALSE, FALSE, NULL, NULL, 'active', 'jacksforkcanoe.com', 'Outfitter + campground on the Jacks Fork. Toll-free: 800-JACKSFORK.', 22),

  ('Jack''s Fork River Resort', 'jacks-fork-river-resort', 'cabin_lodge', '573-226-6450', NULL, 'jacksforkrivercabins@gmail.com', 'https://eminencemocabins.com/', '16169 Tom Akers Rd', 'Eminence', 'MO', '65466', NULL, NULL, 'Newly built/renovated resort on the Jacks Fork River. 14 lodge rooms, 23 cabins. Large gravel bar/swimming area, store, bar & grill, pizza, specialty coffee, ice cream. Private beach access. A/C, flat screen TVs with satellite. Pets in select cabins ($50/pet/stay).', ARRAY['cabins','lodge_rooms','food_service','general_store']::service_offering[], 'Check-in 3pm, check-out 10am. 14-day cancellation policy.', FALSE, FALSE, NULL, NULL, 'active', 'eminencemocabins.com', 'Accepts cash, Mastercard, Visa, Discover.', 40),

  ('Adventure River Resort', 'adventure-river-resort', 'cabin_lodge', '573-226-3233', NULL, NULL, 'https://adventureriverresort.com/', '16492 Tom Akers Road', 'Eminence', 'MO', '65466', NULL, NULL, 'Cabins and hotel rooms on the Jacks Fork River near Eminence. Swimming, kayaking, fishing. Pet-friendly. Near Alley Spring, Rocky Falls, and Blue Spring.', ARRAY['cabins','lodge_rooms']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'active', 'adventureriverresort.com, user_report_2026', 'Ownership/naming unclear: River''s Edge Resort (riversedge-eminence.com, 573-226-3233) may still operate separately at same address area. Missouri Scenic Rivers notes "Apple Jacks 21 Resort is run by the same owner as Rivers Edge Resort." Adventure River Resort may be a genuinely separate business or only a partial rename. Needs verification.', 42),

  ('Eminence Cottages and Camp', 'eminence-cottages-camp', 'cabin_lodge', '573-226-3500', NULL, NULL, 'https://www.eminencecottagescamp.com/', NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'Hotel suites and cottages in the center of the Ozark National Scenic Riverways. Suites with fireplaces, whirlpool tubs, king beds. Canoeing, horseback riding, and UTV access on Jacks Fork and Current River.', ARRAY['cabins','lodge_rooms','horseback_riding']::service_offering[], 'Open March 1 – November 1.', FALSE, FALSE, NULL, NULL, 'active', 'eminencecottagescamp.com', NULL, 44),

  ('Riverside Motel & River Cabins', 'riverside-motel-eminence', 'cabin_lodge', '573-226-3291', NULL, NULL, 'https://riversidemotelonline.com/', NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'Motel rooms, river cabins, and Horseshoe Holler Cabins near Eminence on the Jacks Fork River.', ARRAY['cabins','lodge_rooms']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'active', 'riversidemotelonline.com', NULL, 46),

  ('Hidden Ridge Cabins', 'hidden-ridge-cabins', 'cabin_lodge', '573-291-5353', NULL, NULL, NULL, '16313 Hidden Ridge Road', 'Eminence', 'MO', '65466', NULL, NULL, 'Cabins on 40 acres about 5 minutes south of Eminence, 2.5 miles from town and the Jacks Fork River. Built in 2021 with fireplaces and nice yards. Airbnb-only, no standalone website.', ARRAY['cabins']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'unverified', 'facebook, airbnb, user_report_2026', 'Built 2021. Phone 573-291-5353 per Facebook (old number 573-604-5155 may be outdated). Address is 16313 Hidden Ridge Road. Airbnb-only, no standalone website. Property listed for sale at $350K on Trulia — may close or change hands.', 48),

  ('Cross Country Trail Rides', 'cross-country-trail-rides', 'cabin_lodge', '573-226-3492', NULL, 'carolyndyer67@hotmail.com', 'https://crosscountrytrailrides.com', NULL, 'Eminence', 'MO', '65466', NULL, NULL, 'Trail riding resort near Eminence offering horseback riding, cabins, and camping. Adjacent to the Jacks Fork River. Also offers shuttle services for floaters.', ARRAY['cabins','camping_rv','camping_primitive','horseback_riding','showers']::service_offering[], 'Seasonal — typically March through November.', FALSE, FALSE, NULL, NULL, 'active', 'knowledge_base', 'Primarily a horseback riding operation, but floaters use the cabins/camping as base camp. Adjacent to Jacks Fork.', 35)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- ELEVEN POINT RIVER
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Hufstedler''s Canoe Rental & Campground', 'hufstedlers-canoe-rental', 'outfitter', '417-778-6116', NULL, NULL, 'https://hufstedlers.com', NULL, 'Riverton', 'MO', '63965', NULL, NULL, 'USFS authorized outfitter on the Eleven Point River near Riverton/Alton. Canoe, kayak, and raft rentals with shuttle service and campground. Under new ownership as of 2024.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','camping_primitive','camping_rv']::service_offering[], 'Seasonal — typically April through October.', FALSE, TRUE, 'Steve Ipock', '2024-01-01', 'active', 'usfs_authorized_list, knowledge_base', 'Ownership changed 2024: Steve Ipock bought from Wendy Jones. USFS authorized outfitter in Mark Twain National Forest.', 10),

  ('Richard''s Canoe Rental', 'richards-canoe-rental', 'outfitter', '417-778-6189', NULL, NULL, 'https://richardscanoerentals.com', NULL, 'Alton', 'MO', '65606', NULL, NULL, 'Family-run outfitter on the Eleven Point River near Alton. Canoe and kayak rentals with shuttle service. Now operated by the grandson of founder Jerry Richard.', ARRAY['canoe_rental','kayak_rental','shuttle']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, '2022-01-01', 'active', 'knowledge_base', 'Jerry Richard died in 2022. His grandson now runs the business. Verify USFS authorization status.', 20)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- HUZZAH CREEK / COURTOIS CREEK
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Huzzah Valley Resort', 'huzzah-valley-resort', 'outfitter', '573-786-2225', '800-367-4516', NULL, 'https://huzzahvalley.com', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Family-run resort since 1979, located on Huzzah Creek east of Steelville. Offers 2.5 miles of riverfront camping, canoe/kayak/raft rentals, cabins, restaurant, and shuttle service. Serves Huzzah Creek, Courtois Creek, and Meramec River.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_rv','camping_primitive','cabins','food_service','general_store','showers','horseback_riding','swimming_pool']::service_offering[], 'Open April through October. Restaurant and pool seasonal.', FALSE, FALSE, NULL, NULL, 'active', 'huzzahvalley.com, existing_codebase_migration_00055', 'Family-run since 1979. One of the largest resorts in the Huzzah corridor. Serves all three creeks (Huzzah, Courtois, Meramec via shuttle).', 10),

  ('Bass River Resort', 'bass-river-resort', 'outfitter', '573-786-8517', NULL, NULL, 'https://bassresort.com', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Full-service outfitter on Courtois Creek, also serving Huzzah Creek and Meramec River. Family-run for 50+ years. Canoe/kayak/raft rentals, shuttle service, camping, cabins, and horseback riding.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','camping_rv','camping_primitive','cabins','horseback_riding','showers','general_store']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'active', 'bassresort.com, existing_codebase_migration_00055', 'Family-run 50+ years. Located on Courtois Creek near Butts Road. Serves Huzzah, Courtois, and Meramec.', 20),

  ('Red Bluff Campground', 'red-bluff-campground-usfs', 'campground', '573-438-5427', NULL, NULL, 'https://www.recreation.gov/camping/campgrounds/232391', NULL, 'Davisville', 'MO', '65456', 37.8862, -91.3390, 'USFS campground in the Mark Twain National Forest on Huzzah Creek. Four camping loops with mix of electric and primitive sites. Named for towering red bluffs carved over thousands of years.', ARRAY['camping_rv','camping_primitive','showers']::service_offering[], 'Reservations via Recreation.gov. Some loops seasonal.', FALSE, FALSE, NULL, NULL, 'active', 'recreation.gov, existing_codebase_migration_00055', 'USFS-managed campground, not a private business. Facility ID 232391 on Recreation.gov. Creek Loop closest to water.', 15),

  ('Dillard Mill State Historic Site', 'dillard-mill-campground', 'campground', '573-244-3120', NULL, NULL, 'https://mostateparks.com/historic-site/dillard-mill-state-historic-site', '142 Dillard Mill Rd', 'Viburnum', 'MO', '65566', 37.8300, -91.3826, 'State historic site on upper Huzzah Creek featuring a beautifully restored 1908 red gristmill. Uppermost access point for Huzzah Creek. Picnic area and hiking trail.', ARRAY[]::service_offering[], 'Park open year-round. Mill tours May–Oct.', FALSE, FALSE, NULL, NULL, 'active', 'mostateparks.com, existing_codebase_migration_00055', 'Historic site, not really a campground. Included as a notable access point for Huzzah floaters at mile 0.0.', 5)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;

-- ============================================
-- MERAMEC RIVER
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Ozark Outdoors Resort', 'ozark-outdoors-resort', 'outfitter', '573-245-6517', NULL, NULL, 'https://ozarkoutdoors.net', NULL, 'Leasburg', 'MO', '65535', NULL, NULL, 'Primary Meramec River outfitter with 1 mile of riverfront near Leasburg. Canoe, kayak, raft, and tube rentals with shuttle service. Also offers camping, cabins, and services for Huzzah Creek floaters.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_rv','camping_primitive','cabins','general_store','showers']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'active', 'ozarkoutdoors.net, existing_codebase_migration_00068', 'Located near Onondaga Cave State Park. 1 mile of Meramec River frontage. Also does Huzzah shuttles.', 10),

  ('Bird''s Nest Lodge / Meramec River Resort', 'birds-nest-lodge', 'outfitter', '573-775-2606', NULL, NULL, 'https://meramecriverresort.com', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Outfitter near Steelville on the Meramec River. Canoe, kayak, and raft rentals with shuttle service. Also offers cabins and campground. Now operating as Meramec River Resort under new management.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','cabins','camping_rv','camping_primitive']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'active', 'meramecriverresort.com, birdsnestlodge.com, user_report_2026', 'Rebranded as Meramec River Resort (meramecriverresort.com) under new management. Old birdsnestlodge.com site still live. Phone updated to 573-775-2606.', 20),

  ('3 Bridges Raft Rental', '3-bridges-raft-rental', 'outfitter', NULL, NULL, NULL, NULL, NULL, 'Sullivan', 'MO', '63080', NULL, NULL, 'Raft and tube rental outfitter south of Sullivan on the Meramec River. Specializes in rafts and tubes for the lower-middle Meramec section.', ARRAY['raft_rental','tube_rental','shuttle']::service_offering[], 'Seasonal — typically May through September.', FALSE, FALSE, NULL, NULL, 'unverified', 'existing_codebase_migration_00068', 'Located 3 miles south of Sullivan. Verify phone and website.', 50),

  ('The Rafting Company', 'the-rafting-company', 'outfitter', NULL, NULL, NULL, NULL, NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Outfitter in the Steelville area serving the upper Meramec River and Huzzah Creek. Raft, canoe, and kayak rentals with shuttle service.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'unverified', 'knowledge_base', 'Verify current operating status, phone, website.', 25),

  ('Old Cove Canoe & Kayak', 'old-cove-canoe-kayak', 'outfitter', NULL, NULL, NULL, 'https://oldcovecanoe.com', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Canoe and kayak outfitter on the Meramec River, offering trips on both the upper and lower sections.', ARRAY['canoe_rental','kayak_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'unverified', 'existing_codebase_migration_00068', 'Mentioned in migration 00068 source comments. Verify all details.', 30),

  ('Indian Springs Family Resort', 'indian-springs-resort', 'outfitter', NULL, NULL, NULL, NULL, NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Family resort on the upper Meramec River offering camping, cabins, and canoe/kayak rentals.', ARRAY['canoe_rental','kayak_rental','shuttle','camping_rv','camping_primitive','cabins']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'unverified', 'knowledge_base', 'Verify current operating status and all contact info.', 35),

  ('The Landing', 'the-landing-current-river', 'cabin_lodge', '573-323-8156', NULL, NULL, 'https://thelandingcurrentriver.com', NULL, 'Van Buren', 'MO', '63965', NULL, NULL, 'NPS concessioner in Van Buren on the Current River with 40+ years of operation. 54 lodge rooms, Blue Heron restaurant, and full outfitter services. One of the biggest operations on the lower Current.', ARRAY['lodge_rooms','food_service','canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle']::service_offering[], NULL, TRUE, FALSE, NULL, NULL, 'active', 'thelandingcurrentriver.com, user_report_2026', 'Corrected location: Van Buren on Current River, not Sullivan/Meramec. NPS concessioner. Major operation with 54 lodge rooms and Blue Heron restaurant.', 55),

  ('Onondaga Cave State Park', 'onondaga-cave-state-park', 'campground', '573-245-6576', NULL, NULL, 'https://mostateparks.com/park/onondaga-cave-state-park', '7556 Highway H', 'Leasburg', 'MO', '65535', NULL, NULL, 'State park on the Meramec River featuring Onondaga Cave (a National Natural Landmark) and Cathedral Cave. Full campground with 61 electric sites, basic sites, and showers. River access via Hwy H low-water bridge.', ARRAY['camping_rv','camping_primitive','showers']::service_offering[], 'Park open year-round. Cave tours seasonal (spring-fall). Campground open April through October.', FALSE, FALSE, NULL, NULL, 'active', 'mostateparks.com, existing_codebase_migration_00055_00068', 'Adjacent to Ozark Outdoors Resort. Hwy H low-water bridge is a key Meramec access point. Also accessible from downstream end of Huzzah Creek.', 15),

  ('Meramec State Park', 'meramec-state-park', 'campground', '573-468-6072', NULL, NULL, 'https://mostateparks.com/park/meramec-state-park', '115 Meramec Park Dr', 'Sullivan', 'MO', '63080', NULL, NULL, 'Large state park on the Meramec River near Sullivan. Full campground with electric and basic sites, cabins, canoe rental concession, cave tours, and extensive trail system. One of Missouri''s most popular state parks.', ARRAY['camping_rv','camping_primitive','cabins','canoe_rental','kayak_rental','raft_rental','shuttle','showers','general_store']::service_offering[], 'Park open year-round. Canoe rental concession seasonal (spring-fall).', FALSE, FALSE, NULL, NULL, 'active', 'mostateparks.com, existing_codebase_migration_00068', 'Concession canoe rental operates on-site. Must arrive 30 min before shuttle departure — no refunds for missed shuttles. Has over 30 caves.', 45),

  ('Steele River Kayaks and Boards', 'steele-river-kayaks', 'outfitter', '573-932-4299', NULL, NULL, 'https://steeleriverkayaks.com', NULL, 'Windyville', 'MO', NULL, NULL, NULL, 'Kayak and paddleboard outfitter in Windyville (near Lebanon) on the Niangua River, not the Meramec.', ARRAY['kayak_rental','shuttle']::service_offering[], NULL, FALSE, FALSE, NULL, NULL, 'permanently_closed', 'steeleriverkayaks.com, user_report_2026', 'Corrected location: Windyville on the Niangua River, not Steelville/Meramec. Does not belong in eddy.guide dataset if Niangua is not covered. Marked permanently_closed to remove from active listings.', 40)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, type = EXCLUDED.type, phone = EXCLUDED.phone, phone_toll_free = EXCLUDED.phone_toll_free,
  email = EXCLUDED.email, website = EXCLUDED.website, address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city, state = EXCLUDED.state, zip = EXCLUDED.zip, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, description = EXCLUDED.description, services_offered = EXCLUDED.services_offered,
  seasonal_notes = EXCLUDED.seasonal_notes, nps_authorized = EXCLUDED.nps_authorized,
  usfs_authorized = EXCLUDED.usfs_authorized, owner_name = EXCLUDED.owner_name,
  ownership_changed_at = EXCLUDED.ownership_changed_at, status = EXCLUDED.status,
  verified_source = EXCLUDED.verified_source, notes = EXCLUDED.notes, display_order = EXCLUDED.display_order;


-- ============================================
-- SERVICE_RIVERS JUNCTION TABLE
-- Link services to rivers via slug lookups
-- ============================================

-- Helper: delete existing links so we can re-insert cleanly
DELETE FROM service_rivers
WHERE service_id IN (SELECT id FROM nearby_services);

-- CURRENT RIVER links
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('montauk-state-park', 'current', TRUE, 'Headwaters / Montauk area'),
  ('current-river-canoe-rental', 'current', TRUE, 'Pulltite to Cedar Grove'),
  ('current-river-canoe-rental', 'jacks-fork', FALSE, 'Via shuttle'),
  ('running-river-canoe-rental', 'current', TRUE, 'Upper Current'),
  ('akers-ferry-canoe-rental', 'current', TRUE, 'Akers Ferry area'),
  ('jadwin-canoe-rental', 'current', TRUE, 'Jadwin / mid-Current'),
  ('akers-campground-nps', 'current', TRUE, 'Akers Ferry'),
  ('pulltite-campground-nps', 'current', TRUE, 'Pulltite'),
  ('round-spring-campground-nps', 'current', TRUE, 'Round Spring'),
  ('big-spring-campground-nps', 'current', TRUE, 'Big Spring / Van Buren'),
  ('two-rivers-campground-nps', 'current', TRUE, 'Two Rivers confluence'),
  ('two-rivers-campground-nps', 'jacks-fork', FALSE, 'Mouth / confluence'),
  ('carrs-canoe-rental', 'current', TRUE, 'Eminence area'),
  ('carrs-canoe-rental', 'jacks-fork', FALSE, 'Eminence area'),
  ('windys-floats', 'current', TRUE, 'Eminence area'),
  ('windys-floats', 'jacks-fork', FALSE, 'Eminence area'),
  ('silver-arrow-canoe-rental', 'current', TRUE, 'Lower Current / Van Buren'),
  ('cave-country-canoes', 'current', TRUE, 'Lower Current'),
  ('kcs-on-the-current', 'current', TRUE, 'Doniphan / lower Current'),
  ('echo-bluff-state-park', 'current', TRUE, 'Eminence area'),
  ('echo-bluff-state-park', 'jacks-fork', FALSE, 'Eminence area'),
  ('current-river-state-park', 'current', TRUE, 'Upper Current'),
  ('big-spring-lodge', 'current', TRUE, 'Big Spring / Van Buren'),
  ('the-landing-current-river', 'current', TRUE, 'Van Buren / Lower Current')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug;

-- JACKS FORK links
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('harveys-alley-spring', 'jacks-fork', TRUE, 'Alley Spring area'),
  ('harveys-alley-spring', 'current', FALSE, 'Eminence area'),
  ('two-rivers-canoe-rental', 'jacks-fork', TRUE, 'Eminence area'),
  ('two-rivers-canoe-rental', 'current', FALSE, 'Near confluence'),
  ('eminence-canoe-rental', 'jacks-fork', TRUE, NULL),
  ('alley-spring-campground-nps', 'jacks-fork', TRUE, 'Alley Spring'),
  ('circle-b-campground', 'jacks-fork', TRUE, 'Eminence area'),
  ('circle-b-campground', 'current', FALSE, 'Eminence area'),
  ('jacks-fork-canoe-rental', 'jacks-fork', TRUE, 'Eminence area'),
  ('jacks-fork-river-resort', 'jacks-fork', TRUE, 'Eminence area'),
  ('adventure-river-resort', 'jacks-fork', TRUE, 'Eminence area'),
  ('eminence-cottages-camp', 'jacks-fork', TRUE, 'Eminence area'),
  ('eminence-cottages-camp', 'current', FALSE, 'Eminence area'),
  ('riverside-motel-eminence', 'jacks-fork', TRUE, 'Eminence area'),
  ('hidden-ridge-cabins', 'jacks-fork', TRUE, 'Eminence area'),
  ('cross-country-trail-rides', 'jacks-fork', TRUE, 'Eminence area')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

-- ELEVEN POINT links
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('hufstedlers-canoe-rental', 'eleven-point', TRUE, 'Riverton area'),
  ('richards-canoe-rental', 'eleven-point', TRUE, 'Alton area')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

-- HUZZAH / COURTOIS / MERAMEC links
INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('huzzah-valley-resort', 'huzzah', TRUE, 'Mid-Huzzah / Hwy V area'),
  ('huzzah-valley-resort', 'courtois', FALSE, 'Via shuttle'),
  ('huzzah-valley-resort', 'meramec', FALSE, 'Via shuttle'),
  ('bass-river-resort', 'courtois', TRUE, 'Butts Road area'),
  ('bass-river-resort', 'huzzah', FALSE, 'Via shuttle'),
  ('bass-river-resort', 'meramec', FALSE, 'Via shuttle'),
  ('red-bluff-campground-usfs', 'huzzah', TRUE, 'Red Bluff / Mile 8.3'),
  ('dillard-mill-campground', 'huzzah', TRUE, 'Headwaters / Mile 0.0'),
  ('ozark-outdoors-resort', 'meramec', TRUE, 'Leasburg / Onondaga area'),
  ('ozark-outdoors-resort', 'huzzah', FALSE, 'Via shuttle'),
  ('birds-nest-lodge', 'meramec', TRUE, 'Steelville area / upper Meramec'),
  ('3-bridges-raft-rental', 'meramec', TRUE, 'Sullivan / Meramec State Park area'),
  ('the-rafting-company', 'meramec', TRUE, 'Upper Meramec / Steelville'),
  ('the-rafting-company', 'huzzah', FALSE, 'Via shuttle'),
  ('old-cove-canoe-kayak', 'meramec', TRUE, 'Upper and Lower Meramec'),
  ('indian-springs-resort', 'meramec', TRUE, 'Upper Meramec'),
  ('cobblestone-lodge', 'meramec', TRUE, 'Steelville area'),
  ('onondaga-cave-state-park', 'meramec', TRUE, 'Leasburg / Hwy H'),
  ('meramec-state-park', 'meramec', TRUE, 'Sullivan / Meramec State Park'),
  ('steele-river-kayaks', 'meramec', FALSE, 'N/A — actually on Niangua River in Windyville, not Meramec')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

COMMIT;
