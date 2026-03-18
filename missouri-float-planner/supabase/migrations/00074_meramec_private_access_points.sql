-- 00074_meramec_private_access_points.sql
-- Add private campground/outfitter access points on the Meramec River.
-- These are fee-based put-ins and take-outs operated by private businesses.
--
-- Sources:
-- - FloatMissouri.com mile-by-mile guide
-- - Missouri Canoe & Floaters Association (MCFA) directory
-- - Yelp, Campendium, AllStays, VisitMO, RoverPass reviews
-- - Outfitter websites: garrisonscampground.com, ozarkoutdoorsresort.com,
--   americascave.com, adventureoutdoorcanoeing.com
-- - St. Louis Outdoor Adventures section guides

BEGIN;

-- ============================================
-- PRIVATE ACCESS POINTS
-- ============================================

-- Indian Springs Resort — Mile 41.0
-- Guide: "Indian Spring and private lodge on right."
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Indian Springs Resort',
    'indian-springs',
    ST_SetSRID(ST_MakePoint(-91.3480, 37.9580), 4326),
    'access',
    ARRAY['access', 'campground'],
    false,
    'private',
    'Private family resort on the upper Meramec River at mile 41.0 with direct riverfront access. Canoe, kayak, and raft rentals with shuttle service. The resort sits on a scenic stretch between Scotts Ford and the Steelville area. Gravel bar access for launching and landing.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'On-site gravel parking lot. Space for 20+ vehicles. Trailer-friendly.',
    'From Steelville, take Hwy 19 south toward the river, then follow signs to Indian Springs. Paved roads to the resort entrance. Address: near Steelville, MO 65565.',
    'Private resort with campground (tent and RV sites), cabins, and canoe/kayak/raft rentals with shuttle. Restrooms with showers, camp store, picnic area. Gravel bar river access — no concrete ramp. Fee required for all access and services.',
    true,
    'Access fee required. Canoe/kayak/raft rental fees vary. Campsite fees additional. Call ahead for current rates.',
    ARRAY['paved']::text[],
    '20',
    'Private',
    41.0,
    true,
    '<p><strong>Private access — fee required.</strong> This resort offers canoe/kayak/raft rentals with shuttle on the upper Meramec. Good gravel bar launch for put-in or take-out. A convenient alternative between Scotts Ford (mile 35.1) and Riverview (mile 42.3).</p>',
    '[{"name": "Indian Springs Family Resort", "type": "outfitter", "distance": "on-site", "notes": "Canoe/kayak/raft rentals, shuttle, camping, cabins"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Garrison's River Resort — Mile 55.3
-- Guide: "Private campground."
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Garrison''s River Resort',
    'garrisons-river-resort',
    ST_SetSRID(ST_MakePoint(-91.3194, 38.0148), 4326),
    'access',
    ARRAY['access', 'campground'],
    false,
    'private',
    'Full-service private resort on the Meramec River at mile 55.3. One of the larger outfitters on the upper Meramec with 180 campsites and direct riverfront access. Offers canoe, raft, kayak, and tube rentals with shuttle service. Popular take-out for 10-mile floats from Bird''s Nest; also serves as put-in for downstream floats toward Onondaga.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'store'],
    'Large on-site parking area. Space for 50+ vehicles with trailer turnaround. Well-maintained gravel and paved surfaces.',
    'From Steelville, take State Highway TT south approximately 5 miles. Resort entrance on the left. All paved roads. Address: 287 State Highway TT, Steelville, MO 65565.',
    'Full-service resort: 180 campsites (tent, RV with full hookups including 30 amp electric, water). Three shower houses with hot showers. Country store with supplies, snacks, firewood. Swimming pool, sand volleyball, basketball court, horseshoe pits. Canoe/kayak/raft/tube rentals with shuttle. Gravel bar river access. Open year-round; floating seasonal.',
    true,
    'Access fee required. Rental rates vary by watercraft type. Camping fees separate. Call (573) 775-2410 or (800) 367-8945 for rates.',
    ARRAY['paved']::text[],
    '50+',
    'Private',
    55.3,
    true,
    '<p><strong>Private access — fee required.</strong> Garrison''s is a major outfitter with direct river access via a sandy beach/gravel bar. Their 10-mile float puts in at their own campground, 9-mile float from Fishing Springs, and 6-mile float from Bird''s Nest. Shuttle departures at 8, 9, 10, 11, 12, and 1 PM. Showers are quarter-operated.</p>',
    '[{"name": "Garrison''s River Resort", "type": "outfitter", "phone": "573-775-2410", "website": "https://garrisonscampground.com", "distance": "on-site", "notes": "180 campsites, canoe/kayak/raft/tube rentals, shuttle, pool, store"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Ozark Outdoors Resort — Mile 68.4 (east side of Hwy H bridge)
-- Guide: "East side of low-water bridge private with camping."
-- Note: Onondaga Cave SP access (west side) already exists as 'onondaga-cave-sp'.
-- This is the PRIVATE access on the opposite bank.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Ozark Outdoors Resort',
    'ozark-outdoors',
    ST_SetSRID(ST_MakePoint(-91.2440, 38.0650), 4326),
    'access',
    ARRAY['access', 'campground'],
    false,
    'private',
    'Large private resort on the east side of the Hwy H bridge at mile 68.4, directly across from Onondaga Cave State Park. Over 100 acres with 1 mile of Meramec River frontage and two resort beach areas. One of the primary outfitters on the Meramec — canoe, kayak, raft, and tube rentals with shuttle service on the Meramec, Courtois, and Huzzah. Operating since 1960.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'store'],
    'Large paved and gravel parking areas throughout the resort. Space for 50+ vehicles. Trailer-friendly with ample turnaround room.',
    'From I-44, take Exit 214 (Hwy H). Go south on Hwy H approximately 7.5 miles, cross the Meramec River bridge, then turn left into the resort. All paved roads. Address: 200 Ozark Outdoor Lane, Leasburg, MO 65535.',
    'Full-service resort: 200+ RV sites with hookups and large primitive tent camping areas (many riverfront). Cabins available. Three shower houses. Country store with supplies, snacks, firewood, ice. Swimming pool, volleyball courts, horseshoe pits, playground. Paddlers Bar & Grill (seasonal weekends). Canoe/kayak/raft/tube rentals with shuttle. Two riverfront beach areas for launching. Floating Treetops Aerial Park on-site.',
    true,
    'Access fee required for non-guests. Rental rates vary by watercraft and trip length. Camping and cabin fees separate. Call (573) 245-6517 for rates.',
    ARRAY['paved']::text[],
    '50+',
    'Private',
    'https://ozarkoutdoorsresort.com',
    68.4,
    true,
    '<p><strong>Private access — fee required.</strong> Ozark Outdoors is across the bridge from Onondaga Cave State Park. They have two beach areas on the river with easy launching. This is a major shuttle operation — they run trips on the Meramec, Huzzah, and Courtois rivers. Must arrive 30 min before shuttle departure.</p><p><strong>Nearby:</strong> Onondaga Cave State Park is directly across the Hwy H bridge with public access on the west side.</p>',
    '[{"name": "Ozark Outdoors Resort", "type": "outfitter", "phone": "573-245-6517", "website": "https://ozarkoutdoorsresort.com", "distance": "on-site", "notes": "200+ RV sites, tent camping, cabins, canoe/kayak/raft/tube rentals, shuttle, pool, store, restaurant"}, {"name": "Onondaga Cave State Park", "type": "campground", "phone": "573-245-6576", "distance": "across Hwy H bridge", "notes": "Public camping, cave tours, river access on west side"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Meramec Caverns Campground — Mile 94.3
-- Guide: "Meramec Caverns and La Jolla Springs. Access."
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Meramec Caverns Campground',
    'meramec-caverns',
    ST_SetSRID(ST_MakePoint(-91.1180, 38.2740), 4326),
    'access',
    ARRAY['access', 'campground'],
    false,
    'private',
    'Private campground and river access at the famous Meramec Caverns in Stanton at mile 94.3. The LaJolla Natural Park campground sits along the Meramec River with direct launch access. Canoe, kayak, and raft rentals with shuttle — 6-mile and 11-mile float options with shuttle upstream and float back to the caverns. Also home to Missouri''s most visited show cave.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'store'],
    'Large paved parking lot shared with cave visitors. Ample space for 50+ vehicles. Trailer-friendly.',
    'From I-44, take Exit 230 (Stanton). Follow signs to Meramec Caverns — approximately 3 miles south on Hwy W. Well-signed from the interstate. All paved roads. Address: Stanton, MO 63079.',
    'LaJolla Natural Park campground: tent sites and RV sites with water/electric hookups. Motel rooms also available. Shower houses with restrooms. Concession stand, pavilions, playground, barbecue pits. Canoe/kayak/raft rentals with shuttle (seasonal, April–September, weather permitting). Zip line on-site. Meramec Caverns cave tours available. Riverfront gravel bar launch.',
    true,
    'Access fee required for non-guests. Campground open April 1 – October 31. Canoe/kayak/raft rentals seasonal. Cave tours year-round. Call (573) 468-3166 for campground reservations.',
    ARRAY['paved']::text[],
    '50+',
    'Private',
    'https://www.americascave.com',
    94.3,
    true,
    '<p><strong>Private access — fee required.</strong> Meramec Caverns offers 6-mile and 11-mile float trips. Their shuttle takes you upstream and you float back to the caverns parking area. This is 1 mile downstream of MDC Sand Ford Access (mile 95.4), so Sand Ford is the free public alternative nearby.</p><p><strong>Cave tours:</strong> While you''re here, Meramec Caverns is worth the visit — one of Missouri''s most spectacular show caves.</p>',
    '[{"name": "Meramec Caverns", "type": "outfitter", "phone": "573-468-3166", "website": "https://www.americascave.com", "distance": "on-site", "notes": "Canoe/kayak/raft rentals, shuttle, campground, motel, cave tours, zip line"}, {"name": "Sand Ford Access (MDC)", "type": "campground", "distance": "1 mile upstream (mile 95.4)", "notes": "Free public access with two boat ramps. Open 4 AM – 10 PM."}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- ============================================
-- ADD MISSING BUSINESSES TO nearby_services
-- ============================================

INSERT INTO nearby_services (name, slug, type, phone, phone_toll_free, email, website, address_line1, city, state, zip, latitude, longitude, description, services_offered, seasonal_notes, nps_authorized, usfs_authorized, owner_name, ownership_changed_at, status, verified_source, notes, display_order)
VALUES
  ('Adventure Outdoors', 'adventure-outdoors', 'outfitter', '573-775-5744', '800-324-2674', 'markdessieux1@aol.com', 'http://adventureoutdoorcanoeing.com', '247 Thurman Lake Road', 'Steelville', 'MO', '65565', NULL, NULL, 'Upper Meramec outfitter on the south bank across from MDC Scotts Ford Access (mile 35.1). Also known as Fagan''s. 30 campsites (tent and electric/water), canoe/kayak/raft rentals with shuttle. Camp store, bathhouses, dump station. Guard on duty Friday/Saturday nights.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','camping_primitive','camping_rv','general_store','showers']::service_offering[], 'Seasonal — typically April through October. Call ahead to confirm — outfitter building suffered flood damage in late 2024.', FALSE, FALSE, 'Mark Dessieux', NULL, 'active', 'adventureoutdoorcanoeing.com, mcfa_directory, exploresteelville.com, floatmissouri.com, thedyrt.com', 'Also known as Fagan''s. Cell: 636-399-1122. 30 sites, 30 amp electric. Across river from MDC Scotts Ford. Check-in 3 PM, check-out 2 PM. Flood damage reported late 2024 — verify current status.', 22),

  ('Garrison''s River Resort', 'garrisons-river-resort', 'outfitter', '573-775-2410', '800-367-8945', 'garrisoncanoe@gmail.com', 'https://garrisonscampground.com', '287 State Highway TT', 'Steelville', 'MO', '65565', 38.01475, -91.31936, 'Full-service resort on the Meramec River south of Steelville. 180 campsites (tent and RV with full hookups), canoe/kayak/raft/tube rentals with shuttle. Pool, store, showers.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_rv','camping_primitive','general_store','showers','swimming_pool']::service_offering[], 'Open year-round. Floating seasonal April through October.', FALSE, FALSE, NULL, NULL, 'active', 'garrisonscampground.com, yelp, roverpass, campendium, allstays', 'Formerly Garrison''s Canoe & Campground. 180 sites, 3 shower houses. 6/9/10-mile float options.', 27),

  ('Green''s Canoe Rental & Campground', 'greens-canoe-rental', 'outfitter', '573-775-5595', '800-815-6721', NULL, NULL, '724 West Highway 8', 'Steelville', 'MO', '65565', NULL, NULL, 'Outfitter and campground on Highway 8 near Steelville, adjacent to Woodson K. Woods Wildlife Area. Canoe, raft, and kayak rentals with shuttle on the upper Meramec. Campground with pavilion, picnic tables, fire rings, hot showers, and clean restrooms. Also offers hunting guide packages for the adjacent 6,000-acre wildlife area.', ARRAY['canoe_rental','kayak_rental','raft_rental','shuttle','camping_primitive','showers','general_store']::service_offering[], 'Seasonal — verify current schedule.', FALSE, FALSE, NULL, NULL, 'active', 'yelp, go-missouri.com, campingroadtrip.com, groupon', 'Located 3 miles east of Maramec Spring Park. Adjacent to Woodson K. Woods Wildlife Area. Also offers adventure packages with camping, floats, bonfires, and BBQ dinners.', 23),

  ('Meramec Caverns Campground', 'meramec-caverns-campground', 'campground', '573-468-3166', NULL, NULL, 'https://www.americascave.com', NULL, 'Stanton', 'MO', '63079', NULL, NULL, 'LaJolla Natural Park campground at the famous Meramec Caverns. Riverfront tent and RV sites, motel rooms, canoe/kayak/raft rentals with shuttle (6-mile and 11-mile trips). Cave tours, zip line, concession stand, playground.', ARRAY['camping_rv','camping_primitive','canoe_rental','kayak_rental','raft_rental','shuttle','showers']::service_offering[], 'Campground open April 1 – October 31. Cave tours year-round.', FALSE, FALSE, NULL, NULL, 'active', 'americascave.com, thedyrt.com, campendium, hipcamp', 'Canoe/raft rentals operated as Cavern Canoe and Raft Rental. Shuttle takes you upstream, float back to caverns. Motel also on-site.', 47),

  ('Lucky Clover Lakeside River Resort', 'lucky-clover-resort', 'outfitter', NULL, NULL, NULL, 'https://www.luckyclovercampground.com', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Full-service river outfitter and campground near Steelville on the upper Meramec River. Tent sites, RV sites, and on-site lake. Canoe, kayak, raft, and tube rentals with shuttle.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_rv','camping_primitive']::service_offering[], 'Seasonal — typically April through October.', FALSE, FALSE, NULL, NULL, 'unverified', 'luckyclovercampground.com, hipcamp, naturallymeramec.org', 'Has on-site lake in addition to Meramec River access. Verify phone and exact address.', 28),

  ('Riverview Ranch', 'riverview-ranch', 'outfitter', NULL, NULL, NULL, 'https://www.riverviewranch.org', NULL, 'Steelville', 'MO', '65565', NULL, NULL, 'Resort on the upper Meramec River offering cabins, riverfront tent and RV camping, canoe/kayak/raft/tube rentals with shuttle. Located in the historic Missouri Ozark Heritage Region.', ARRAY['canoe_rental','kayak_rental','raft_rental','tube_rental','shuttle','camping_rv','camping_primitive','cabins']::service_offering[], 'Seasonal.', FALSE, FALSE, NULL, NULL, 'unverified', 'riverviewranch.org, unearththevoyage.com', 'Verify phone, exact address, and current operating status.', 29)

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
-- LINK NEW SERVICES TO MERAMEC RIVER
-- ============================================

INSERT INTO service_rivers (service_id, river_id, is_primary, section_description)
SELECT ns.id, r.id, v.is_primary, v.section_description
FROM (VALUES
  ('adventure-outdoors', 'meramec', TRUE, 'Upper Meramec / Scotts Ford area'),
  ('garrisons-river-resort', 'meramec', TRUE, 'Upper Meramec / Steelville area'),
  ('greens-canoe-rental', 'meramec', TRUE, 'Upper Meramec / Woodson K. Woods area'),
  ('meramec-caverns-campground', 'meramec', TRUE, 'Mid Meramec / Stanton area'),
  ('lucky-clover-resort', 'meramec', TRUE, 'Upper Meramec / Steelville area'),
  ('riverview-ranch', 'meramec', TRUE, 'Upper Meramec / Steelville area')
) AS v(service_slug, river_slug, is_primary, section_description)
JOIN nearby_services ns ON ns.slug = v.service_slug
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (service_id, river_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  section_description = EXCLUDED.section_description;

COMMIT;
