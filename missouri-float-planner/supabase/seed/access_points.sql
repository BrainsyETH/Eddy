-- supabase/seed/access_points.sql
-- Seed data for river access points on Missouri float rivers
--
-- Sources:
-- - Missouri Department of Conservation (MDC)
-- - National Park Service (Ozark National Scenic Riverways)
-- - Local outfitters and float trip guides

-- ============================================
-- MERAMEC RIVER ACCESS POINTS
-- ============================================

-- Maramec Spring Park (upstream)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Maramec Spring Park',
    'maramec-spring-park',
    ST_SetSRID(ST_MakePoint(-91.4231, 37.8447), 4326),
    'park',
    true,
    'state_park',
    'Beautiful spring-fed headwaters with historic iron furnace. Popular put-in for upper Meramec floats.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Large paved lot with easy river access',
    true,
    'Park entrance fee required',
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    approved = EXCLUDED.approved;

-- Scotia Bridge Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Scotia Bridge Access',
    'scotia-bridge',
    ST_SetSRID(ST_MakePoint(-91.2534, 37.9156), 4326),
    'bridge',
    true,
    'county',
    'County road bridge with gravel bar access.',
    ARRAY['parking'],
    'Roadside parking near bridge',
    false,
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Steelville City Park
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Steelville City Park',
    'steelville-city-park',
    ST_SetSRID(ST_MakePoint(-91.3421, 37.9678), 4326),
    'park',
    true,
    'city',
    'City park with paved ramp and good facilities. Popular shuttle pick-up point.',
    ARRAY['parking', 'restrooms', 'boat_ramp', 'picnic'],
    'Paved parking lot with trailer access',
    false,
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Meramec State Park
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Meramec State Park',
    'meramec-state-park',
    ST_SetSRID(ST_MakePoint(-91.0456, 37.9812), 4326),
    'park',
    true,
    'state_park',
    'Large state park with multiple river access points, camping, and cave tours.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic'],
    'Multiple parking areas throughout park',
    true,
    'State park day-use or camping fee',
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Onondaga Cave State Park
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Onondaga Cave State Park',
    'onondaga-cave-sp',
    ST_SetSRID(ST_MakePoint(-91.0034, 38.0289), 4326),
    'park',
    true,
    'state_park',
    'State park known for Onondaga Cave. Good river access for floaters.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Paved parking with river access trail',
    true,
    'State park day-use fee',
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- CURRENT RIVER ACCESS POINTS
-- ============================================

-- Montauk State Park
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Montauk State Park',
    'montauk-state-park',
    ST_SetSRID(ST_MakePoint(-91.4867, 37.3956), 4326),
    'park',
    true,
    'state_park',
    'Headwaters of the Current River. Famous trout fishing. Upper float put-in.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Large parking area near lodge',
    true,
    'State park fee',
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Cedargrove
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Cedargrove',
    'cedargrove',
    ST_SetSRID(ST_MakePoint(-91.3401, 37.3289), 4326),
    'access',
    true,
    'NPS',
    'NPS access point with gravel bar. Part of Ozark National Scenic Riverways.',
    ARRAY['parking', 'restrooms'],
    'Gravel parking area',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Akers Ferry
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Akers Ferry',
    'akers-ferry',
    ST_SetSRID(ST_MakePoint(-91.2301, 37.2789), 4326),
    'access',
    true,
    'NPS',
    'Historic ferry crossing. Popular put-in/take-out with camping nearby.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Large gravel lot',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Pulltite Spring
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Pulltite Spring',
    'pulltite-spring',
    ST_SetSRID(ST_MakePoint(-91.1201, 37.2289), 4326),
    'campground',
    true,
    'NPS',
    'NPS campground with spring access. Popular camping and float destination.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Campground parking area',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Round Spring
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Round Spring',
    'round-spring',
    ST_SetSRID(ST_MakePoint(-91.0467, 37.1956), 4326),
    'campground',
    true,
    'NPS',
    'Major spring with campground. Popular mid-river access.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Paved parking at campground',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Two Rivers (Current/Jacks Fork confluence)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Two Rivers',
    'two-rivers',
    ST_SetSRID(ST_MakePoint(-91.0134, 37.0256), 4326),
    'access',
    true,
    'NPS',
    'Confluence of Current and Jacks Fork rivers. Historic site.',
    ARRAY['parking', 'restrooms'],
    'Gravel parking area',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Van Buren
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Van Buren City Access',
    'van-buren',
    ST_SetSRID(ST_MakePoint(-91.0150, 36.9936), 4326),
    'boat_ramp',
    true,
    'city',
    'Town of Van Buren access with concrete ramp. Near Big Spring.',
    ARRAY['parking', 'restrooms', 'boat_ramp'],
    'Paved lot near downtown',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Big Spring
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Big Spring',
    'big-spring',
    ST_SetSRID(ST_MakePoint(-90.8823, 36.9489), 4326),
    'park',
    true,
    'NPS',
    'One of the largest springs in the US. Lodge, dining, and camping available.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Multiple parking areas',
    false,
    true
FROM rivers r WHERE r.slug = 'current'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- ELEVEN POINT RIVER ACCESS POINTS
-- ============================================

-- Greer Spring Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Greer Spring',
    'greer-spring',
    ST_SetSRID(ST_MakePoint(-91.5312, 36.8089), 4326),
    'access',
    true,
    'NPS',
    'Second largest spring in Missouri. Hiking trail to spring. Float put-in nearby.',
    ARRAY['parking', 'restrooms'],
    'Parking area near trailhead',
    false,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Turner Mill South
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Turner Mill South',
    'turner-mill-south',
    ST_SetSRID(ST_MakePoint(-91.3478, 36.7367), 4326),
    'access',
    true,
    'MDC',
    'MDC access area. Good mid-river access point.',
    ARRAY['parking'],
    'Gravel parking area',
    false,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Riverton Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Riverton',
    'riverton',
    ST_SetSRID(ST_MakePoint(-91.1278, 36.6501), 4326),
    'access',
    true,
    'MDC',
    'Lower Eleven Point access. Good take-out for longer floats.',
    ARRAY['parking', 'restrooms'],
    'Gravel lot with boat access',
    false,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Thomasville (Hwy 99) — Mile 0.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Thomasville', 'thomasville',
    ST_SetSRID(ST_MakePoint(-91.4919, 36.7847), 4326),
    'access', ARRAY['access'], true, 'USFS',
    'Mile zero on the Eleven Point. Upper section only floatable March-June.',
    ARRAY['parking'],
    'USFS gravel lot at Hwy 99 bridge. ~10-12 vehicles.',
    'Paved via State Highway 99. From Alton, Hwy 160 west 12 mi, right on Hwy 99 north 1.5 mi.',
    'No amenities. No restrooms, no water, no trash service.',
    false, ARRAY['paved']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/thomasville-river-access',
    0.0, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Cane Bluff — Mile 9.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Cane Bluff', 'cane-bluff',
    ST_SetSRID(ST_MakePoint(-91.405675, 36.796246), 4326),
    'access', ARRAY['access'], true, 'USFS',
    'First public access below Thomasville. 250-foot Cane Bluff across the river.',
    ARRAY['parking', 'restrooms'],
    'USFS gravel lot. Parking for 8 vehicles with trailers.',
    'From Winona, SR 19 south 26 mi, right onto CR 410 ~1.5 mi, right onto CR 405 ~4 mi.',
    'Vault toilet. No water, no camping.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/cane-bluff-river-access',
    9.3, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Turner Mill North — Mile 21.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Turner Mill North', 'turner-mill-north',
    ST_SetSRID(ST_MakePoint(-91.2700, 36.7690), 4326),
    'access', ARRAY['access'], true, 'USFS',
    'Left bank access at historic Turner Mill site. Day use only, no camping.',
    ARRAY['parking', 'restrooms'],
    'Small USFS gravel lot. ~8-10 vehicles.',
    'Remote. From Winona, Hwy 19 south 11.5 mi, right on NF-3152 for 6 mi, right on NF-3190.',
    'Day-use picnic area with vault toilet and boat launch. No camping. No water.',
    false, ARRAY['gravel_maintained']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/turner-mill-north-river-access',
    21.5, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- McDowell Access — Mile 24.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id, 'McDowell Access', 'mcdowell',
    ST_SetSRID(ST_MakePoint(-91.241337, 36.760374), 4326),
    'access', ARRAY['access'], true, 'USFS',
    'Primitive access on left bank. No amenities.',
    ARRAY['parking'],
    'Unimproved pulloff. Very limited.',
    'No amenities. No restrooms, no water.',
    false, ARRAY['gravel_unmaintained']::text[], '5', 'USFS',
    24.2, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Whitten Access — Mile 28.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Whitten Access', 'whitten',
    ST_SetSRID(ST_MakePoint(-91.214618, 36.732595), 4326),
    'access', ARRAY['access'], true, 'USFS',
    'Popular midpoint access. Put-in for Whitten to Riverton day float (8 mi).',
    ARRAY['parking', 'restrooms'],
    'USFS gravel lot on river right. Moderate capacity.',
    'From Alton, Hwy 19 north 1.5 mi, right on Hwy AA 9 mi, left on Whitten Church Rd 2.2 mi.',
    'Vault toilet. Single-lane concrete boat ramp. No water, no camping.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '15', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/whitten-river-access',
    28.0, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- The Narrows (Highway 142) — Mile 44.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'The Narrows (Highway 142)', 'narrows',
    ST_SetSRID(ST_MakePoint(-91.191532, 36.550194), 4326),
    'access', ARRAY['access'], true, 'USFS',
    'Last access on the Eleven Point National Scenic River. Dramatic narrows geology.',
    ARRAY['parking', 'restrooms', 'boat_ramp'],
    'USFS paved parking lot. Moderate capacity.',
    'Paved via Hwy 142. From Thayer, east 21 mi. From Doniphan, west 25 mi.',
    'Developed site. Concrete boat ramp. Paved parking. Vault toilet. No camping, no water.',
    false, ARRAY['paved']::text[], '20', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/highway-142-river-access',
    44.3, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Myrtle Access (MDC) — Mile 48.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id, 'Myrtle Access', 'myrtle',
    ST_SetSRID(ST_MakePoint(-91.17, 36.50), 4326),
    'access', ARRAY['access'], true, 'MDC',
    'Last Missouri access on the Eleven Point. Site of old Stubblefield Ferry.',
    ARRAY['parking', 'boat_ramp'],
    'Small MDC gravel lot. Limited capacity.',
    'From Thayer, Hwy 142 east 19 mi, south on Hwy H 7 mi, left on CR 278 2.5 mi.',
    'MDC access. Concrete boat launch. Limited camping. Vault toilet. No water.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '10', 'MDC',
    48.0, true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- JACKS FORK RIVER ACCESS POINTS
-- ============================================

-- Blue Spring (Jacks Fork) — river mile 9.6; NPS campground here; needed for NPS "Blue Spring Campground" link
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, road_access, facilities, fee_required, approved
)
SELECT 
    r.id,
    'Blue Spring',
    'blue-spring',
    ST_SetSRID(ST_MakePoint(-91.63707, 37.05355), 4326),
    'campground',
    true,
    'NPS',
    'Blue Spring is a beautiful, cold-water spring that feeds into the Jacks Fork from river right. The NPS campground here is small and peaceful - a great base camp for exploring the upper valley.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Small NPS gravel lot off Hwy OO. Fits ~10 vehicles.',
    'Mix of paved (Hwy OO) and gravel county roads. The last ~2 miles on CR OO-493 are gravel but maintained. Passenger vehicles fine in dry conditions.',
    'NPS backcountry campground with vault toilet, fire rings, and lantern posts. No water, no trash service.',
    false,
    true
FROM rivers r WHERE r.slug = 'jacks-fork'
ON CONFLICT (river_id, slug) DO UPDATE SET
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    approved = EXCLUDED.approved;

-- Alley Spring
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, road_access, facilities, fee_required, approved
)
SELECT 
    r.id,
    'Alley Spring',
    'alley-spring',
    ST_SetSRID(ST_MakePoint(-91.4461, 37.1444), 4326),
    'park',
    true,
    'NPS',
    'Famous red Alley Mill and spring. Major camping and float destination.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Large parking area near mill',
    'Fully paved. From Eminence, take Hwy 106 west ~6 miles. Well-signed NPS entrance on the south side of Hwy 106, just before crossing the Jacks Fork. From Mountain View, take Hwy 60 east to County Hwy E, north 10 miles to Hwy 106, then west 2 miles.',
    'Major NPS front-country campground: 146 family sites (some reservable), 26 electric sites, 3 group sites, 14 cluster sites. Flush toilets and hot showers Apr–Oct. Dump station. Campground host in summer. Harvey''s general store across the road.',
    false,
    true
FROM rivers r WHERE r.slug = 'jacks-fork'
ON CONFLICT (river_id, slug) DO UPDATE SET
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    approved = EXCLUDED.approved;

-- Eminence City Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, road_access, facilities, fee_required, approved
)
SELECT 
    r.id,
    'Eminence City Access',
    'eminence',
    ST_SetSRID(ST_MakePoint(-91.3467, 37.1412), 4326),
    'boat_ramp',
    true,
    'city',
    'Town access in Eminence. Good services nearby.',
    ARRAY['parking', 'restrooms', 'boat_ramp'],
    'Paved lot near town center',
    'Fully paved via State Highway 19 in downtown Eminence. The town sits at the intersection of Hwy 19 and Hwy 106. From the north: Hwy 19 south from Winona (12 miles). From the south: Hwy 19 north from Alton.',
    'Eminence is a full-service town. Gas, restaurants, stores, outfitters (Harvey''s, Windy''s, Jacks Fork Canoe Rental), lodging. Jacks Fork Campground (NPS) at mile 38.1 offers electric sites for RVs.',
    false,
    true
FROM rivers r WHERE r.slug = 'jacks-fork'
ON CONFLICT (river_id, slug) DO UPDATE SET
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    approved = EXCLUDED.approved;

-- ============================================
-- NIANGUA RIVER ACCESS POINTS
-- Ordered upstream to downstream
-- Sources: MDC, Missouri State Parks, USGS, Wikipedia, FloatMissouri, SouthwestPaddler
-- ============================================

-- 1. Charity Access (MDC) — Uppermost practical access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Charity Access', 'charity-access',
    ST_SetSRID(ST_MakePoint(-92.9496, 37.4689), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'Uppermost practical access on the Niangua. Concrete boat ramp purchased by MDC in 1982. The 20 miles downstream to Big John Access is small water that runs very low in summer. Good fishing for bass, suckers, and sunfish.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking lot at river. Limited capacity.',
    'From Buffalo, take Highway 32 east 2 miles, then Route H south 8 miles, and Route M east 2.75 miles to the Niangua River.',
    'Concrete boat ramp. No restrooms, no water, no camping allowed.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/charity-access',
    0.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 2. Big John Access (MDC) — Mile 1.3 from Hwy 32 bridge
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Big John Access', 'big-john-access',
    ST_SetSRID(ST_MakePoint(-93.0305, 37.6614), 4326),
    'access', ARRAY['access'], true, 'MDC',
    'MDC access at low-water bridge on the Niangua. Good canoe/kayak access with gravel bar. Subject to flash flooding. No camping allowed. The river above Hwy 32 is seldom floatable except in high water.',
    ARRAY['parking'],
    'Small gravel lot. Limited parking for ~5 vehicles.',
    'From Buffalo, take Highway 32 east 2 miles, then Engle Lane north 1 mile, then Steelman Road east 0.25 mile to the Niangua River.',
    'Low-water bridge access. No restrooms, no water, no camping.',
    false, ARRAY['gravel_maintained']::text[], '5', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/big-john-access',
    1.3, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 3. Williams Ford Access (MDC) — Mile 12.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Williams Ford Access', 'williams-ford',
    ST_SetSRID(ST_MakePoint(-92.8830, 37.6846), 4326),
    'bridge', ARRAY['access', 'bridge'], true, 'MDC',
    'Low-water concrete slab crossing where water flows over the top. Poor canoe/kayak access due to high embankment. About half a mile of Niangua River access. Good fishing for black bass, suckers, and sunfish.',
    ARRAY['parking'],
    'Roadside parking. Very limited capacity.',
    'Off Route MM to County Road MM-123 to County Road K-143.',
    'Low-water crossing. No restrooms, no water, no camping.',
    false, ARRAY['gravel_maintained']::text[], '5', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/williams-ford-access',
    12.2, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 4. Moon Valley Access (MDC) — Mile 22.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Moon Valley Access', 'moon-valley',
    ST_SetSRID(ST_MakePoint(-92.8827, 37.7023), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'MDC access purchased in 1971. Gravel ramp and parking lot. Popular put-in for floats to Bennett Spring area.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking lot. Room for approximately 10-15 vehicles.',
    'From Bennett Spring State Park, take Route OO south 1.50 miles, then Moon Valley Road west 1.50 miles just across a low-water bridge.',
    'Gravel boat ramp. No restrooms, no water, no camping.',
    false, ARRAY['gravel_maintained']::text[], '15', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/moon-valley-access',
    22.3, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 5. Cat Hollow / Coastal Country Resort (Private) — near Mile 27
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Cat Hollow (Coastal Country Resort)', 'cat-hollow',
    ST_SetSRID(ST_MakePoint(-92.8910, 37.7369), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Privately owned campground and river access (formerly Fort Niangua River Resort). Over 200 acres with half a mile of Niangua River frontage. River access for guests only. Cabins, trailers, RV park, and primitive camping.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Private parking for campground guests.',
    'From Bennett Springs, 3 miles west on Hwy 64 to Cat Hollow Trail. Check in at main building.',
    'Modern cabins (heated/AC), trailers, RV park with hookups, primitive campgrounds. Restrooms and showers.',
    true, 'Campground fees apply. River access for guests only.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://www.coastalcountryresort.com/',
    27.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 6. Bennett Spring State Park — Mile 29
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Bennett Spring State Park', 'bennett-spring',
    ST_SetSRID(ST_MakePoint(-92.8613, 37.7337), 4326),
    'park', ARRAY['park', 'campground', 'boat_ramp'], true, 'state_park',
    'Missouri''s premier spring and trout park. First-magnitude spring producing over 100 million gallons daily at constant 58F. 3,338-acre park with camping, cabins, dining lodge, nature center, and 12 miles of hiking trails. Major landmark and popular base camp for Niangua floats.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic'],
    'Multiple large paved parking areas. Can fill on busy summer weekends.',
    'From Lebanon, take Highway 64 west 12 miles to the park. Well-signed from I-44.',
    'Full-service: campgrounds (5 areas, electric/water hookups), cabins, dining lodge, park store, nature center, shower houses, fish cleaning stations.',
    true, 'State park entrance fee. Camping and cabin fees vary by season.',
    ARRAY['paved']::text[], '50+', 'State Park',
    'https://mostateparks.com/park/bennett-spring-state-park',
    29.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 7. Bennett Spring Access (MDC) — Mile 30.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Bennett Spring Access (MDC)', 'bennett-spring-mdc',
    ST_SetSRID(ST_MakePoint(-92.8636, 37.7420), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'MDC-managed 178-acre access just across the Niangua River bridge on Hwy 64. Wade and float fishing access. White Ribbon Trout Area with stocked brown and rainbow trout. Day use only. Primary put-in/take-out for Bennett Spring area floats.',
    ARRAY['parking', 'restrooms', 'boat_ramp'],
    'Large paved parking lot. Accommodates vehicles with trailers.',
    'From Lebanon, take Highway 64 west 12 miles; the access is just across the Niangua River Bridge.',
    'Large parking lot, concrete boat ramp, vault toilets (multiple privies). Day use only.',
    false, ARRAY['paved']::text[], '30', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/bennett-spring-access',
    30.2, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 8. Hidden Valley Outfitters (Private) — near Mile 30.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Hidden Valley Outfitters', 'hidden-valley-outfitters',
    ST_SetSRID(ST_MakePoint(-92.8592, 37.7386), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Private campground and float trip outfitter right next to Bennett Spring State Park. Canoe, kayak, raft, and tube rentals with shuttle service. Family-friendly resort with campsites, trading post food, and cabins.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Private campground parking for guests.',
    'From I-44 & MO-5/MO-64, north 1 mi on MO-5/MO-64, then west 14 mi on MO-64W, then north on Marigold Dr. Address: 27101 Marigold Dr, Lebanon, MO 65536.',
    'Tent sites, RV hookups, cabins. Restrooms, showers, trading post with food.',
    true, 'Rental and camping fees apply. Float trip packages available.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://www.hvoutfitters.com/',
    30.5, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 9. Riverfront Campground & Canoe (Private) — near Mile 31
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Riverfront Campground & Canoe', 'riverfront-campground',
    ST_SetSRID(ST_MakePoint(-92.8708, 37.7402), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Over 200 acres fronting one mile of Niangua River. Adjacent to Bennett Spring State Park. Family-owned since 1994. Raft, canoe, kayak, and tube rentals with 5-mile and 8-mile float options. 15 rental cabins.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking. Multiple areas throughout property.',
    'From Hwy 65 and 64 junction, drive east on Hwy 64 for 17 miles. 1/4 mile west of Bramwell entrance to Bennett Spring SP. Address: 13 Riverfront Trail, Lebanon, MO 65536.',
    'Primitive campsites, full-hookup RV sites, 15 rental cabins. Hot showers, pool, hot tub, bar. UTV rentals.',
    true, 'Rental and camping fees apply. Multiple float trip packages.',
    ARRAY['paved', 'gravel_maintained']::text[], '50+', 'Private',
    'https://riverfrontcampcanoe.com/',
    31.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 10. NRO (Niangua River Oasis) Campground (Private) — near Mile 33
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Niangua River Oasis (NRO)', 'nro-campground',
    ST_SetSRID(ST_MakePoint(-92.8780, 37.7659), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Full-service canoe outfitter since 1977. Over 60 acres on the Niangua River. Canoes, rafts, tubes, and kayaks with shuttle. 2 nights free camping with boat rental. 4 miles west of Bennett Spring State Park.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking. Multiple camping areas (A is party, C is family).',
    'Route 64 to Corkery Road, follow NRO signs 1.1 miles. Address: 171 NRO Rd, Lebanon, MO 65536.',
    'Tent sites, RV sites (30/50 amp with water hookup), dump station, guesthouses, cabins. RV sites not on river.',
    true, '2 nights camping free with boat rental. Additional nights $15/person/night. Children 7 and under free.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://nrocanoe.com/',
    33.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 11. Maggard Canoe & Corkery Campground (Private) — near Mile 34
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Maggard Canoe & Corkery Campground', 'maggard-corkery',
    ST_SetSRID(ST_MakePoint(-92.8752, 37.7715), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Float trips on the Niangua since 1972. Corkery Campground on the river banks below Bennett Springs. Canoe, kayak, raft, and tube rentals with shuttle.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Campground parking. Smaller operation, smaller trailers only.',
    'At Hwy 64 and Hwy 73 intersection, stay on Hwy 64 nine miles to Clyde''s Store. Left onto Corkery Rd, follow blacktop 4 miles. Address: 400 Corkery Rd, Lebanon, MO 65536.',
    'Tent sites. No dump station or sewer hookups. Smaller trailers only.',
    true, 'Rental and camping fees apply.',
    ARRAY['paved', 'gravel_maintained']::text[], '20', 'Private',
    'https://nianguariver.com/',
    34.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 12. Big Bear River Resort (Private) — near Mile 35
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Big Bear River Resort', 'big-bear-resort',
    ST_SetSRID(ST_MakePoint(-92.8760, 37.7750), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    '25-acre campground on the Niangua River. Name from Osage word "Niangua" meaning "bear." Open year-round. Canoe, raft, kayak, and tube rentals.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking for guests.',
    'Address: 372 Corkery Rd, Lebanon, MO 65536.',
    'Riverfront primitive campsites, RV hookups, dry and wet cabins. Hot showers, clean bathrooms.',
    true, 'Camping and rental fees apply. Year-round operation.',
    ARRAY['paved', 'gravel_maintained']::text[], '20', 'Private',
    'https://bigbearriverresort.com/',
    35.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 13. Barclay Conservation Area Access (MDC) — Mile 36.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Barclay Conservation Area Access', 'barclay-access',
    ST_SetSRID(ST_MakePoint(-92.8671, 37.7919), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'MDC conservation area, 426 acres, 1.7 miles of Niangua River frontage. Dedicated 2001 with concrete boat ramp and canoe launch. White Ribbon Trout Area. Very good brown trout, bass, sunfish. Popular take-out 7 miles from Bennett Spring Access.',
    ARRAY['parking', 'boat_ramp'],
    'Paved/gravel parking lot. 15-20 vehicles with trailers.',
    'From Bennett Spring State Park, Hwy 64 west 3.70 miles, Corkery Road north 3 miles, Barclay Springs Road east.',
    'Concrete boat ramp, gravel bar canoe launch, parking lot. No restrooms, no camping.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '20', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/barclay-conservation-area',
    36.5, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 14. Mountain Creek Family Resort (Private) — near Mile 38
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Mountain Creek Family Resort', 'mountain-creek-resort',
    ST_SetSRID(ST_MakePoint(-92.8374, 37.8006), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Eco-resort stretching over half a mile along the Niangua at the mouth of Mountain Creek. Canoe, kayak, tube rentals with 11.5-mile float from Bennett Spring. Waterslides and beach access.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking for guests.',
    'Address: 11564 Kinfolk Road, Eldridge, MO 65463. From Lebanon, Hwy 64 west, Route AA north, then Kinfolk Road.',
    'Tent sites, electric hookup sites, 8-person cabins, waterslides, beach. Open for fall hunting season.',
    true, 'Camping and rental fees apply. Float trip packages available.',
    ARRAY['paved', 'gravel_maintained']::text[], '25', 'Private',
    'https://www.mountaincreekfamilyresort.com/',
    38.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 15. Prosperine Access (MDC) — Mile 40
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Prosperine Access', 'prosperine',
    ST_SetSRID(ST_MakePoint(-92.8363, 37.7984), 4326),
    'access', ARRAY['access'], true, 'MDC',
    'MDC access purchased in 1961 at the mouth of Mountain Creek. 7.5-acre site. Gravel bar with swimming hole upstream and rocky riffle below. Private campground adjacent. End of White Ribbon Trout Area. Good trout, smallmouth bass, suckers, sunfish.',
    ARRAY['parking'],
    'Gravel parking area. ~10 vehicles.',
    'From Lebanon, Hwy 64 west 2 miles, Route AA north 12 miles until blacktop ends, Kinfolk Road west 4.50 miles. Watch for cantilever sign.',
    'Gravel bar access. No restrooms, no water on site.',
    false, ARRAY['paved', 'gravel_maintained', 'gravel_unmaintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/prosperine-access',
    40.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 16. Lead Mine Conservation Area (MDC) — Mile 52
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Lead Mine Conservation Area', 'lead-mine',
    ST_SetSRID(ST_MakePoint(-92.9076, 37.8473), 4326),
    'access', ARRAY['access', 'boat_ramp', 'campground'], true, 'MDC',
    'Large 7,761-acre MDC area with ~2 miles of Niangua River frontage and 3.5 miles of Jakes Creek. Purchased 1965. Concrete and gravel boat ramps. 23 miles of multi-use trails. 5 free primitive camping areas (14-day limit). Contains Niangua River Hills Natural Area. Better canoe access at Herrick Ford (mile 54.3) gravel bar downstream.',
    ARRAY['parking', 'boat_ramp', 'camping'],
    'Multiple gravel parking areas. Main lot holds 15-20 vehicles.',
    'From Plad, west on Hwy 64, north on Route T, 0.5 mi east on Route YY (SW access). From Lebanon, north on Hwy 5 to Route E, becomes Bluff Trail at pavement end, 0.25 mi (NE access).',
    'Concrete and gravel boat ramps, 5 primitive camping areas (free, 14-day limit), 23 miles trails. No water or electric. Contact: (417) 532-7612.',
    false, ARRAY['paved', 'gravel_maintained', 'gravel_unmaintained']::text[], '20', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/lead-mine-conservation-area',
    52.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 17. Tunnel Dam / Lake Niangua — Mile 66
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Tunnel Dam (Lake Niangua)', 'tunnel-dam',
    ST_SetSRID(ST_MakePoint(-92.8514, 37.9369), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access'], true, 'private',
    'Hydroelectric dam creating 360-acre Lake Niangua. Public boat ramp on west side. WARNING: Often NO water between dam and powerhouse (~6 miles). End float here unless water confirmed below dam. Lake is shallow (larger boats cannot access). Owned by Sho-Me Power (FERC #2561), surrendering license but keeping dam/lake open.',
    ARRAY['parking', 'boat_ramp', 'picnic'],
    'Parking lot at boat ramp and picnic area.',
    'Near Macks Creek in southern Camden County, off State Road U.',
    'Boat ramp, picnic area. No camping at dam/lake access.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '15', 'Private',
    'https://www.shomepower.com/about-sho-me/niangua-river-dam',
    66.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- 18. Whistle Bridge — Mile 68
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id, 'Whistle Bridge', 'whistle-bridge',
    ST_SetSRID(ST_MakePoint(-92.8343, 37.9410), 4326),
    'bridge', ARRAY['bridge', 'access'], true, 'county',
    'Low-lying concrete causeway on Tunnel Dam Road, 0.5 mi north of Edith, MO. Only usable when dry channel below Tunnel Dam has water. Good gravel area. 13.3 miles downstream to Ha Ha Tonka State Park.',
    ARRAY['parking'],
    'Roadside parking near crossing. Very limited.',
    'Junction of Whistle Road and Tunnel Dam Road, near Edith, MO, off State Road U (meets Hwy 54 between Camdenton and Macks Creek).',
    'Low-water crossing only. No amenities.',
    false, ARRAY['gravel_maintained']::text[], '5', 'County',
    68.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 19. Mother Nature's Riverfront Retreat (Private) — near Mile 70
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Mother Nature''s Riverfront Retreat', 'mother-natures-retreat',
    ST_SetSRID(ST_MakePoint(-92.8240, 37.9550), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    '300-acre campground, concert venue, and float operation on Big Niangua channel. ~2 miles float from Whistle Bridge. Previously Tunnel Dam Gardens (since 1999). Float trips, camping, camper rentals, RV hookups, lodge, bunkhouse.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking. Ample space on 300-acre property.',
    'Off Tunnel Dam Road in Camden County, 1 mi down Gardens Road at Tunnel Dam Garden Center sign. Address: 878 Gardens Rd, Macks Creek, MO 65786.',
    'Campgrounds, camper rentals, RV hookups, lodge, bunkhouse. Convenience store, canoe/kayak rental, shuttle, shower house.',
    true, 'Camping and rental fees apply. Beach pass fees may apply.',
    ARRAY['gravel_maintained']::text[], '50+', 'Private',
    'https://mothernaturesriverfrontretreat.com/',
    70.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency, official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 20. Riverbend RV Park and Campground (Private) — near Mile 71
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id, 'Riverbend RV Park and Campground', 'riverbend-rv-park',
    ST_SetSRID(ST_MakePoint(-92.8180, 37.9600), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Small owner-operated campground high above the Niangua, below Tunnel Dam. 23 acres with 250 ft of river frontage. Hike down the hill to river access.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Campground parking. Space for RVs and trailers.',
    'Address: 309 Prater Homestead Ln, Macks Creek, MO 65786. WARNING: Do not follow GPS blindly; use directions from campground.',
    'Full-hookup RV spots, primitive tent sites. Shower house. 10 RV/tent, 3 tent, 12 full hookup sites. Fire ring and picnic table each.',
    true, 'RV/tent $26-32/night (4 guests). Tent $18-25/night.',
    ARRAY['gravel_maintained', 'gravel_unmaintained']::text[], '15', 'Private',
    71.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface, parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    river_mile_downstream = EXCLUDED.river_mile_downstream, approved = EXCLUDED.approved;

-- 21. Ha Ha Tonka State Park — Mile 79.5 (river meets Lake of the Ozarks)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Ha Ha Tonka State Park', 'ha-ha-tonka',
    ST_SetSRID(ST_MakePoint(-92.7683, 37.9595), 4326),
    'park', ARRAY['park', 'access'], true, 'state_park',
    'State park where the Niangua merges into Lake of the Ozarks. Kayak launch with steps and rail at spring area. Big Niangua River Trail (13.3-mile paddle upstream to Whistle Bridge). Boat dock from Lake of the Ozarks at 14.5-mile marker. Famous castle ruins, spring, geology.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Multiple parking areas. Spring parking lot for kayak launch.',
    'State Highway D south from Camdenton. Kayak launch: Tonka Spring Road, left from spring parking lot at Lakeside Picnic Shelter.',
    'Kayak steps and launch rail, boat docks (24-ft limit), restrooms, hiking trails, nature exhibits. No camping.',
    false, ARRAY['paved']::text[], '50+', 'State Park',
    'https://mostateparks.com/park/ha-ha-tonka-state-park',
    79.5, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name, location_orig = EXCLUDED.location_orig,
    description = EXCLUDED.description, amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info, road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities, road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity, managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url, river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- ============================================
-- BIG PINEY RIVER ACCESS POINTS
-- Sources: MDC, USFS (Mark Twain NF / Houston-Rolla-Cedar Creek Ranger District),
--          FloatMissouri, MCFA, Paddling.com, SouthwestPaddler, BSC Outdoors
-- River flows generally south-to-north through Texas and Pulaski counties,
-- joining the Gasconade River near Jerome. ~90 floatable miles.
-- ============================================

-- Baptist Camp Access (MDC) — Mile 0.0 (uppermost public access)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Baptist Camp Access',
    'baptist-camp',
    ST_SetSRID(ST_MakePoint(-92.0185, 37.2579), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'Uppermost public put-in on the floatable Big Piney River at mile 0.0. Forested MDC area with low-water bridge and canoe/kayak access. Start of the good smallmouth bass fishing on the upper river. The gradient from here to Boiling Spring is 4.2 ft/mile — relatively swift with riffles. The river is narrow and scenic through this stretch with overhanging trees and small bluffs.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Gravel parking lot with space for approximately 10 vehicles and trailers.',
    'From Houston, take Highway 63 south 6 miles, then Route RA west 1 mile. Mailing address: Simmons, MO 65689.',
    'Privy (vault toilet), picnic area, low-water bridge. No drinking water. No boat ramp — carry-in access at low-water bridge.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/baptist-camp-access',
    0.0,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Dogs Bluff Access (MDC) — Mile ~8.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Dogs Bluff Access',
    'dogs-bluff',
    ST_SetSRID(ST_MakePoint(-92.0022, 37.3267), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access with concrete boat ramp on the Big Piney River, 3 miles west of Houston. Popular summer swimming hole with scenic bluffs. Good fishing for bass and sunfish. Picnic area with privy.',
    ARRAY['parking', 'restrooms', 'picnic', 'boat_ramp'],
    'Paved/gravel parking area with space for vehicles and trailers.',
    'From Houston, take Highway 17 west 3 miles. Well-signed. MDC maintained concrete ramp.',
    'Concrete boat ramp, picnic area, privy (vault toilet). No drinking water.',
    false,
    'No fee.',
    ARRAY['paved']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/dogs-bluff-access',
    8.5,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Mineral Springs Access (MDC) — Mile 14.6
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Mineral Springs Access',
    'mineral-springs',
    ST_SetSRID(ST_MakePoint(-91.9880, 37.3440), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at mile 14.6 with concrete boat ramp. 6.3-acre area on the Big Piney River near Houston. Mineral Spring is 0.5 mile up a branch. Horseshoe Bend Natural Area is across the river. Good fishing for bass and sunfish. Popular put-in for the long 40-mile run to Ross Access.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel/paved parking area for vehicles and trailers.',
    'From Highway 63 at the north Houston city limit, take Oak Hill Drive west, then Forest Drive west, then Mineral Drive north 2 miles to the access. Houston, MO 65483.',
    'MDC maintained concrete boat ramp. No restrooms on-site. No drinking water.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/mineral-springs-access',
    14.6,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Sandy Shoals Ford — Mile 19.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Sandy Shoals Ford',
    'sandy-shoals-ford',
    ST_SetSRID(ST_MakePoint(-91.9740, 37.3780), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water ford crossing at mile 19.3. Sand Shoals Road connects Hwy E on the east to Hwy AA on the west. Popular put-in for the scenic 6–8 mile float to Boiling Spring — one of the best day trips in Missouri. Up here the river is more like a swift creek with occasional Class II riffles, sheer bluffs rising overhead topped with pine trees. Dense foliage overhangs the channel providing great shade.',
    ARRAY['parking'],
    'Roadside pull-off parking near the ford. Limited — approximately 8–10 vehicles.',
    'Take Sand Shoals Road from either Hwy E (east) or Hwy AA (west). The road crosses the Big Piney at a low-water ford. Gravel road; passable by passenger vehicles in dry conditions.',
    'No facilities. Low-water ford — may be impassable during high water.',
    false,
    'No fee.',
    ARRAY['gravel_maintained']::text[],
    '10',
    19.3,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Boiling Spring Access (MDC) — Mile 25.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Boiling Spring Access',
    'boiling-spring',
    ST_SetSRID(ST_MakePoint(-91.9700, 37.4350), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at mile 25.8 with concrete boat ramp and picnic area. Famous for Boiling Spring — a massive spring at river level pumping roughly 10 million gallons per day at a constant 50 degrees F. Classic swimming hole and rope swing at the spring pool. Common take-out for the popular Sandy Shoals to Boiling Spring day float. Also serves as a put-in for floats downstream toward Mason Bridge and Slabtown. The Resort at Boiling Springs (private campground/RV park with cabins, canoe rentals, and shuttle) is adjacent.',
    ARRAY['parking', 'picnic', 'boat_ramp'],
    'Gravel/paved parking area with space for vehicles and trailers.',
    'From Licking, take Highway 32 west, then Route BB west approximately 7 miles to the Big Piney River. Address: 15268 Hwy 32, Licking, MO 65542. Open 4 AM – 10 PM; fishing/boating 24 hrs.',
    'MDC maintained concrete boat ramp. Picnic area. No restrooms at the MDC access. No drinking water.',
    false,
    'No fee at MDC access. The Resort at Boiling Springs (adjacent private campground) charges for camping and canoe rentals.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/boiling-spring-access',
    25.8,
    true,
    '[{"name": "The Resort at Boiling Springs", "type": "campground", "phone": "(573) 889-9085", "website": "https://resortatboilingsprings.com/", "distance": "Adjacent", "notes": "Private campground and RV park with 34 full RV hookups (30/50 amp), two furnished cabins, primitive tent camping, in-ground pool, sports bar, general store, restaurant, shower houses, free WiFi. Canoe/kayak rentals and shuttle service. Float trips 5–25+ miles. Address: 15750 Highway BB, Licking, MO 65542."}]'::jsonb
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Mason Bridge Access (MDC) — Mile 31.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Mason Bridge Access',
    'mason-bridge',
    ST_SetSRID(ST_MakePoint(-91.9832, 37.5054), 4326),
    'access',
    ARRAY['access', 'boat_ramp', 'bridge'],
    true,
    'MDC',
    'MDC access at mile 31.8. 7-acre area with concrete boat ramp providing public access to the Big Piney River for canoeing and fishing. Located on Mason Bridge Road. Good bass and sunfish fishing. The river is getting wider and deeper through this section. About 8 miles downstream from Boiling Spring and 8 miles upstream from Slabtown.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking area with space for approximately 10 vehicles and trailers.',
    'From Licking, take Highway 32 west 6 miles, then Mason Road north to the Big Piney River.',
    'MDC maintained concrete boat ramp. No restrooms. No drinking water.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/mason-bridge-access',
    31.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Warren Bridge — Mile 33.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Warren Bridge',
    'warren-bridge',
    ST_SetSRID(ST_MakePoint(-91.9900, 37.5200), 4326),
    'bridge',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge crossing at mile 33.3. Road connects Hwys FF and H. Excellent swimming hole below the bridge. Informal access — usable as a put-in or take-out but no developed facilities. About 1.5 miles downstream from Mason Bridge.',
    ARRAY['parking'],
    'Roadside pull-off parking. Limited — approximately 5 vehicles.',
    'The road connecting Hwy FF and Hwy H crosses the Big Piney at a low-water bridge. Gravel road.',
    'No facilities. Low-water crossing — may be impassable in high water.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    33.3,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Slabtown Recreation Area (USFS) — Mile 39.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Slabtown Recreation Area',
    'slabtown',
    ST_SetSRID(ST_MakePoint(-92.0321, 37.5615), 4326),
    'campground',
    ARRAY['access', 'campground'],
    true,
    'USFS',
    'First Forest Service access on the Big Piney at mile 39.8. Small, quiet USFS campground and river access with 5 primitive tent-only campsites. Start of the Smallmouth Bass Special Management Area (1 smallmouth, 15-inch minimum, downstream to Gasconade confluence). Popular put-in for the 6-mile float to Horse Camp or 10-mile float to Ross Bridge. 1-mile Slabtown Bluff Trail winds through hardwoods with river overlooks (best fall–spring). Downriver from here the river is narrower and shallower with multiple riffles.',
    ARRAY['parking', 'camping', 'picnic'],
    'Boat launch parking for 3 vehicles with trailers. Picnic/camping area fits 8 vehicles. Total capacity approximately 11 vehicles.',
    'From Roby, MO, take Highway 17 north 1.5 miles to County Road 800, turn right and travel 7 miles on gravel road. When you pass the Big Piney Bridge, the road turns to asphalt. Slabtown is on the right just past the bridge. Last stretch is gravel.',
    '5 primitive tent camping sites with picnic tables and fire rings. Vault toilet (accessible). No drinking water. No boat ramp — carry-in access. 1-mile Slabtown Bluff Trail. First-come, first-served. Tent camping only.',
    false,
    'No fee at any Forest Service managed sites along the Big Piney.',
    ARRAY['paved', 'gravel_unmaintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/slabtown-recreation-area',
    39.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Horse Camp Access (USFS) — Mile ~45.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Horse Camp Access',
    'horse-camp',
    ST_SetSRID(ST_MakePoint(-92.0425, 37.6435), 4326),
    'access',
    ARRAY['access', 'campground'],
    true,
    'USFS',
    'USFS river access approximately 6 miles downstream from Slabtown. Located near the Big Piney Equestrian Camp — one of 3 trailheads for the 18-mile Big Piney Trail through Paddy Creek Wilderness. The equestrian camp has 5 sites designed for horse trailers with picnic tables, fire rings, and highline posts. Road dead-ends at the river access past the horse camp. Common take-out for the 6-mile float from Slabtown.',
    ARRAY['parking', 'camping'],
    'Parking area at the trailhead/equestrian camp with space for horse trailers. Approximately 8–10 vehicle/trailer spots.',
    'From Licking, take Hwy 32 west 4 miles to Hwy N, turn right on Hwy N and go 2 miles to Hwy AF, turn left onto Hwy AF and travel 5 miles to Slabtown Road, continue straight past the asphalt for 1.5 miles. Road dead-ends at the river.',
    'Equestrian camp with 5 campsites (picnic tables, fire rings, highline posts). Trail register station. No drinking water. No vault toilet at river access. Big Piney Trail trailhead.',
    false,
    'No fee.',
    ARRAY['gravel_maintained', 'gravel_unmaintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/big-piney-equestrian-camp',
    45.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Wilderness Ridge Resort (Private) — Mile ~50
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Wilderness Ridge Resort',
    'wilderness-ridge-resort',
    ST_SetSRID(ST_MakePoint(-91.8920, 37.6410), 4326),
    'campground',
    ARRAY['campground', 'access'],
    false,
    'private',
    'Private resort and campground on the Big Piney River near Duke, MO. Offers canoe/raft/tube rentals, cabins, lodge, RV hookups, tent camping, and shuttle service. The campground sits on a bluff overlooking the Big Piney River. Relatively calm section of river, suitable for children and families. Close to Mark Twain National Forest and Paddy Creek Wilderness.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp', 'store'],
    'Large resort parking lot. Ample space for vehicles and trailers.',
    'From the north, take Hwy 63 south 23 miles to Hwy K, turn left on Hwy K and go through Duke. Address: 33850 Windsor Ln, Duke, MO 65461. Approximately 80 miles from Springfield, 100 miles from St. Louis.',
    'Lodge, cabins (A/C, linens, dishes, fridge, stove), RV sites with electric and water hookups, tent camping with fire rings and picnic tables. General amenities on a bluff overlooking the river.',
    true,
    'Canoe/raft/tube rental fees. Camping fees vary by site type. Launch fee for non-guests.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '30',
    'Private',
    'https://www.wildernessridgeresort.com/',
    50.0,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Peck's Last Resort (Private) — Mile ~51
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Peck''s Last Resort',
    'pecks-last-resort',
    ST_SetSRID(ST_MakePoint(-91.8880, 37.6440), 4326),
    'campground',
    ARRAY['campground', 'access'],
    false,
    'private',
    'Family-owned private campground and canoe outfitter on the Big Piney River near Duke, MO. Formerly known as Rich''s Last Resort. Offers camping, cabins, canoe/kayak/raft rentals, and shuttle service. Beautiful Missouri Ozark landscape. Note: cell service drops out about 20 minutes before arriving.',
    ARRAY['parking', 'camping', 'picnic', 'boat_ramp'],
    'Resort parking area.',
    'Address: 33401 Windsor Ln, Duke, MO 65461. Write down directions as cell service is lost before arrival. About 2.5 hours from Columbia, MO.',
    'Camping, cabins, canoe/kayak/raft rentals, fishing access.',
    true,
    'Camping and rental fees apply. Contact for current rates.',
    ARRAY['gravel_maintained']::text[],
    '15',
    'Private',
    'https://www.peckslastresort.com/',
    51.0,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Ross Access (MDC) — Mile ~54.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Ross Access',
    'ross-bridge',
    ST_SetSRID(ST_MakePoint(-91.8680, 37.6510), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access at approximately mile 54.8. Mostly forested gravel bar area providing access for floating and fishing. LAST TAKE-OUT before the river enters Fort Leonard Wood military reservation — no public access is permitted through the base. The 15-mile stretch from Slabtown to Ross is the core of the Smallmouth Bass Special Management Area (1 smallmouth, 15-inch minimum). After Ross, the river begins to get wider and deeper. From here the river enters Fort Leonard Wood for approximately 12 miles with no access.',
    ARRAY['parking'],
    'Gravel parking area.',
    'From Duke, take Route K west to Western Road, then Windsor Lane north 0.50 mile.',
    'Parking area. No restrooms. No drinking water. No boat ramp — gravel bar access. Open 4 AM – 10 PM; fishing/hunting/boating allowed 24 hrs.',
    false,
    'No fee.',
    ARRAY['gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/ross-access',
    54.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- East Gate Access (USFS) — Mile ~66.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'East Gate Access',
    'east-gate',
    ST_SetSRID(ST_MakePoint(-92.0583, 37.7603), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'USFS',
    'USFS river access at approximately mile 66.8 near Fort Leonard Wood''s East Gate entrance. Only developed Forest Service access in Pulaski County. Primary put-in/take-out for private recreationists and Fort Leonard Wood military personnel. The 12-mile stretch upstream from Ross Bridge passes entirely through Fort Leonard Wood — this is the first public access below the base. USGS gauge station nearby (06930000). East Gate Fort Wood Campground is on the left bank at the bridge (mile 66.5). Short 3-mile float downstream to Crossroads Access, or 11-mile float to Bookers Bend.',
    ARRAY['parking', 'boat_ramp'],
    'Small gravel parking area. Space for approximately 5–8 vehicles with trailers.',
    'Make a slight right onto East Gate Road and drive 1 mile. Access site is on the right, before the bridge. Located approximately 15 miles southeast of Waynesville.',
    'Single-lane gravel boat launch. No restrooms. No drinking water.',
    false,
    'No fee at any Forest Service managed sites along the Big Piney.',
    ARRAY['gravel_maintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21814',
    66.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Crossroads Access (USFS) — Mile ~69.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Crossroads Access',
    'crossroads',
    ST_SetSRID(ST_MakePoint(-92.0780, 37.7550), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'USFS carry-in access at approximately mile 69.8. Provides parking and a 100-foot trail to the Big Piney River for canoeing and fishing — you must carry canoes/kayaks down the trail. Day use only — no overnight camping. 3-mile paddle downstream from East Gate, or 8 miles upstream from Bookers Bend. River has varying runs and riffles with mostly gravel bottom.',
    ARRAY['parking'],
    'Gravel parking area for day use.',
    'Take exit 169 for Hwy J, follow Hwy J to the left/south for 10 miles. At the junction of J Highway and M Highway, go past about 300 feet. Crossroads Access is on the right.',
    'Carry-in access only — 100-foot trail to the river. No restrooms. No drinking water. Day use only — no overnight camping.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '5',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/crossroads-access',
    69.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Bookers Bend Access (USFS) — Mile ~77.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Bookers Bend Access',
    'bookers-bend',
    ST_SetSRID(ST_MakePoint(-92.1020, 37.7830), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'USFS',
    'USFS river access at approximately mile 77.8 — the last Forest Service access on the Big Piney before the Gasconade confluence. Thomas Lane dead-ends at Bookers Bend. Single-lane gravel boat launch. The river here is deeper, slower moving, and wider than upstream sections. Smallmouth bass special management area. 8 miles downstream from Crossroads, 11 miles from East Gate. From here, 8 more miles to the Gasconade River confluence. Most land along this stretch is private — stay aware of property boundaries if stopping.',
    ARRAY['parking', 'boat_ramp'],
    'Small gravel parking area. Limited — approximately 5 vehicles.',
    'Approximately 4 miles west of Hwy J on Forest Service Road 1730. Thomas Lane dead-ends at the access.',
    'Single-lane gravel boat launch. No restrooms. No drinking water.',
    false,
    'No fee.',
    ARRAY['gravel_unmaintained']::text[],
    '5',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recreation/recarea/?recid=84142',
    77.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Devil's Elbow / Highway V Bridge — Mile 82.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Devil''s Elbow (Highway V Bridge)',
    'devils-elbow',
    ST_SetSRID(ST_MakePoint(-92.0960, 37.8170), 4326),
    'bridge',
    ARRAY['bridge'],
    false,
    'private',
    'Historic Highway V bridge crossing at Devil''s Elbow, mile 82.4. NO PUBLIC ACCESS at the bridge itself. This is on the famous Route 66 corridor. The old steel truss bridge is a popular Route 66 landmark. BSC Outdoors operates a private put-in called Piney Landing nearby for their 5-mile float trip to the Gasconade confluence. Shanghai Spring (Blue Spring) is 2.4 miles upstream at mile 80.0 — a massive spring comparable to Boiling Spring.',
    ARRAY[]::text[],
    'No public parking at bridge.',
    'Hwy V at Devil''s Elbow, Pulaski County. The village of Devil''s Elbow is a historic Route 66 community.',
    'No public facilities. Historic Route 66 bridge. Private access only through BSC Outdoors.',
    false,
    'Private access only through outfitters.',
    ARRAY['paved']::text[],
    'limited',
    82.4,
    true,
    '[{"name": "BSC Outdoors / Boiling Spring Campground", "type": "outfitter", "phone": "(573) 759-7294", "website": "https://www.bscoutdoors.com/", "distance": "3 miles", "notes": "Offers 5-mile float from Piney Landing at Devil''s Elbow to BSC on the Gasconade, or 8-mile float from Blue Spring to BSC. Campground on the Gasconade with full facilities. Address: 18700 Cliff Rd, Dixon, MO 65459."}]'::jsonb
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Old Route 66 Bridge — Mile 82.9
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Old Route 66 Bridge',
    'old-route-66-bridge',
    ST_SetSRID(ST_MakePoint(-92.0940, 37.8210), 4326),
    'bridge',
    ARRAY['bridge'],
    false,
    'private',
    'Old Route 66 bridges at mile 82.9. Private access on left bank below bridge. No public access. The Big Piney River is nearing its confluence with the Gasconade River (3 miles downstream). I-44 bridges are at mile 83.2 with no access.',
    ARRAY[]::text[],
    'No public parking.',
    'Historic Route 66 near Devil''s Elbow, Pulaski County.',
    'No public facilities. Private access only.',
    false,
    'Private access only.',
    ARRAY['paved']::text[],
    'limited',
    82.9,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved;

-- Gasconade River Confluence — Mile 85.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Gasconade River Confluence',
    'gasconade-confluence',
    ST_SetSRID(ST_MakePoint(-92.0710, 37.8360), 4326),
    'access',
    ARRAY['access'],
    false,
    'private',
    'Junction of the Big Piney River with the Gasconade River at mile 85.7 near Jerome, MO. Private access on right bank with lodging, refreshments, and parking available. End of the Big Piney River. From here, floaters continue downstream on the Gasconade River where additional public access points exist. BSC Outdoors take-out is on the Gasconade near here.',
    ARRAY['parking'],
    'Private parking available.',
    'Near Jerome, MO, off I-44. Private access — contact outfitters for arrangements.',
    'Private access point. Lodging, refreshments available through private operators.',
    true,
    'Private access fees apply.',
    ARRAY['paved']::text[],
    '10',
    85.7,
    true,
    '[{"name": "BSC Outdoors / Boiling Spring Campground", "type": "outfitter", "phone": "(573) 759-7294", "website": "https://www.bscoutdoors.com/", "distance": "At confluence", "notes": "BSC Outdoors on the Gasconade near the Big Piney confluence. Full-service campground with RV sites, tent camping, cabins, store, and float trip services."}]'::jsonb
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- ============================================
-- HUZZAH CREEK ACCESS POINTS
-- Sources: MDC, USFS (Mark Twain NF), MO State Parks, FloatMissouri, MCFA
-- ============================================

-- Dillard Mill State Historic Site — Mile 0.0 (uppermost put-in)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Dillard Mill',
    'dillard-mill',
    ST_SetSRID(ST_MakePoint(-91.3826, 37.8300), 4326),
    'access',
    ARRAY['access', 'historic_site'],
    true,
    'state_park',
    'Dillard Mill State Historic Site on upper Huzzah Creek. Beautiful red gristmill (1908) set on the blue waters of Huzzah Creek. Uppermost access — only floatable in good water conditions. The mill sits on a rock dam that creates a scenic cascade.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Gravel parking lot with space for about 15 vehicles. Short walk to the creek via wooden bridge over former creek bed.',
    'From Cherryville, take Highway 49 south and watch for signs for Dillard Mill Road. Go approximately 1.7 miles down Dillard Mill Road. Road starts paved then becomes gravel near the parking area. Address: 142 Dillard Mill Rd, Viburnum, MO 65566.',
    'State historic site with picnic area (5 tables with pedestal grills), covered accessible shelter, restrooms, and 1.4-mile Mill View Trail. Mill tours available ($5 adults, $4 ages 6–17, free under 5). Open May–Oct 8am–8pm, Nov–Apr 8am–5pm.',
    false,
    'No fee for grounds access. Mill tour fee applies.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'State Park',
    'https://mostateparks.com/historic-site/dillard-mill-state-historic-site',
    0.0,
    true
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    approved = EXCLUDED.approved;

-- Hazel Creek Recreation Area (USFS) — Mile 3.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Hazel Creek Recreation Area',
    'hazel-creek',
    ST_SetSRID(ST_MakePoint(-91.3724, 37.8484), 4326),
    'campground',
    ARRAY['access', 'campground'],
    true,
    'USFS',
    'Primitive USFS campground in Mark Twain National Forest at mile 3.0 with 10 individual sites. Popular with OHV/ATV riders, equestrians, and mountain bikers — hitching posts at each site, spurs large enough for horse trailers. Trailhead for the Ozark Trail (Trace Creek Section, ~24 miles). Part of the historic Old Lead Belt. Not on Recreation.gov — first-come, first-served, no fee.',
    ARRAY['parking', 'camping'],
    '10 individual sites with parking spurs. Some spurs large enough for horse trailers.',
    'From Potosi, head west on Hwy 8 to Hwy P. South on Hwy P for 14 miles to Hwy C. Right on Hwy C west for 4 miles to Hwy Z. Right on Hwy Z (Brazil Rd / Co Rd 657) north ~3 miles to campground on left. Last stretch unpaved. No cell service. Contact: Potosi/Fredericktown Ranger District (573) 438-5427.',
    'Primitive USFS campground — 10 sites with fire ring/grill, picnic table, lantern post, hitching post. NO WATER. NO TOILETS. No electric. No trash service — pack in, pack out. Horses welcome; Huzzah Creek for watering stock. Ozark Trail trailhead.',
    false,
    ARRAY['paved', 'gravel_unmaintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21846',
    3.0,
    true
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    approved = EXCLUDED.approved;

-- Highway V Bridge — Mile 6.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Highway V Bridge',
    'highway-v-bridge',
    ST_SetSRID(ST_MakePoint(-91.3545, 37.8668), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'County highway bridge crossing at mile 6.0. Public bridge access with private campground nearby. Common put-in for floats heading downstream through the scenic middle section. Start of the popular 23.4-mile run to Highway E.',
    ARRAY['parking'],
    'Roadside pull-off parking near bridge. Limited — fits approximately 5 vehicles.',
    'Paved county highway V. From Steelville, take Hwy 8 east, then turn south on Hwy V. Bridge is approximately 2 miles south. Passenger vehicles fine year-round.',
    'No public facilities at the bridge. Private campground and access adjacent.',
    false,
    ARRAY['paved']::text[],
    '5',
    6.0,
    true,
    '[{"name": "Huzzah Valley Resort", "type": "campground", "phone": "800-367-4516", "website": "https://huzzahvalley.com", "distance": "Adjacent", "notes": "Full-service resort with canoe rentals, camping, cabins, restaurant, store"}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    approved = EXCLUDED.approved;

-- Huzzah Valley Resort — Mile ~6.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Huzzah Valley Resort',
    'huzzah-valley-resort',
    ST_SetSRID(ST_MakePoint(-91.3219, 37.9519), 4326),
    'campground',
    false,
    'private',
    'Family-run resort since 1979, located 10 miles east of Steelville on Hwy 8. Offers 2.5 miles of riverfront camping, canoe/kayak/raft rentals, cabins, and shuttle service. Popular mid-river stop — the 12-mile canoe trip passes through the campground in time for a lunch break.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp', 'store'],
    'Large resort parking lot. Ample space for vehicles and trailers. Designated boat launch area.',
    'Fully paved via State Highway 8. From Steelville, head east on Hwy 8 for approximately 10 miles. Well-signed entrance. From I-44, take the Cuba exit (Exit 208), south on Hwy 19 to Steelville, then east on Hwy 8. Address: 970 E Hwy 8, Steelville, MO 65565.',
    'Full-service private resort. Three shower houses with coin-operated showers ($0.50). Clean restrooms throughout. Camp store with river gear and essentials. Restaurant on-site. Playground, volleyball and basketball courts. Golf cart rentals. RV sites with 50-amp electric, water, and sewer hookups. Tent camping along the river. Cabins and A-frames sleeping 2–30 people. Horseback riding available.',
    true,
    'Launch fee for non-guests. Private craft fee: $10.71 per craft plus parking.',
    ARRAY['paved']::text[],
    '50+',
    'Private',
    6.0,
    true,
    '[{"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "5 miles", "notes": "Canoe/kayak/raft rentals, camping, cabins, shuttle service on Courtois, Huzzah, and Meramec"}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    fee_notes = EXCLUDED.fee_notes,
    approved = EXCLUDED.approved;

-- Highway 8 Bridge (Upper) — Mile 6.9
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Highway 8 Bridge (Upper)',
    'highway-8-upper',
    ST_SetSRID(ST_MakePoint(-91.3490, 37.8733), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'state',
    'State highway bridge crossing at mile 6.9. Access is difficult at the highway — steep bank. Often used as a water-level check point before committing to upstream sections.',
    ARRAY['parking'],
    'Very limited roadside pull-off near bridge. Shoulder parking only — fits 3–4 vehicles max.',
    'Paved State Highway 8. From Steelville, head east on Hwy 8 approximately 8 miles. Bridge is well-visible from the road.',
    'No facilities. Highway bridge crossing only. Steep, difficult bank access — not ideal for loading/unloading boats.',
    false,
    ARRAY['paved']::text[],
    'limited',
    6.9,
    true,
    '<p>Good spot to check water levels before committing to a float. If the water looks thin here, turn back — everything upstream will be worse.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    approved = EXCLUDED.approved;

-- Red Bluff Recreation Area (USFS) — Mile 8.3
-- Recreation.gov Facility ID: 232391
-- https://www.recreation.gov/camping/campgrounds/232391
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, ridb_facility_id, river_mile_upstream, approved,
    local_tips,
    nearby_services
)
SELECT
    r.id,
    'Red Bluff Recreation Area',
    'red-bluff',
    ST_SetSRID(ST_MakePoint(-91.3390, 37.8862), 4326),
    'campground',
    ARRAY['access', 'campground'],
    true,
    'USFS',
    'USFS campground in the Potosi-Fredericktown Ranger District of Mark Twain National Forest at mile 8.3. Named for towering red bluffs along Huzzah Creek carved over 10,000 years. Four camping loops: Creek Loop, Ridge Top Loop, Pines Overlook Loop, and Group Loop. Many sites within 200 yards of Huzzah Creek. Modern restrooms, water, electricity on newer loops. 1.2-mile Red Bluff Trail.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp'],
    'Multiple paved parking areas at each camping loop. Day-use parking near pavilion. Ample space for vehicles and trailers.',
    'From St. Louis, take I-44 west to Cuba. Continue on Hwy 19 south to Cherryville. Take Hwy 49 south to Hwy V, turn left to Davisville and travel approximately 1 mile, turn left into the campground. All paved roads.',
    'Major USFS campground with 4 loops. Creek, Ridge Top, and Group loops have modern restrooms (flush toilets), running water, electricity (30/50-amp). Pines Overlook is non-electric. Shower house and dump station. Two pavilions (one holds 75). Picnic sites with tables and grills. Water spigots throughout. Swimming and tubing in Huzzah Creek. Fishing for bass, perch, catfish.',
    true,
    'Single $15/night, electric $25/night, double $25/night, double electric $35/night, group $50–$100/night. Extra vehicle $2/night. Day use $5/vehicle. Reservations on Recreation.gov.',
    ARRAY['paved']::text[],
    '50+',
    'USFS',
    'https://www.recreation.gov/camping/campgrounds/232391',
    '232391',
    8.3,
    true,
    '<p>Full-service USFS campground — reservations recommended on summer weekends. Creek Loop sites closest to water. Pines Overlook is more secluded but non-electric. Dogs must be leashed (6 ft). Collect dead/downed firewood only. No fireworks.</p>',
    '[{"name": "Huzzah Valley Resort", "type": "outfitter", "phone": "800-367-4516", "website": "https://huzzahvalley.com", "distance": "2 miles", "notes": "Canoe/kayak/raft rentals, shuttle service, restaurant, store"}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    approved = EXCLUDED.approved;

-- Butts Low-Water Bridge — Mile 15.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Butts Low-Water Bridge',
    'butts-bridge',
    ST_SetSRID(ST_MakePoint(-91.2920, 37.9340), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Popular mid-river access at mile 15.4. Good access with gravel bar — great campsite or lunch spot. Henpeck Hollow Creek enters from the right. Bass River Resort nearby off Butts Road.',
    ARRAY['parking'],
    'Gravel pull-off area near bridge. Space for approximately 10 vehicles.',
    'From Steelville, take Hwy 8 east, then turn north on Butts Road. Follow Butts Road approximately 1.5 miles to the low-water bridge. Gravel road, maintained.',
    'No public facilities at bridge. Private campground adjacent. Bass River Resort just over the hill on Butts Road.',
    false,
    ARRAY['gravel_maintained']::text[],
    '10',
    15.4,
    true,
    '[{"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "1.5 miles", "notes": "Canoe/kayak/raft rentals, shuttle service for Huzzah, Courtois, and Meramec. Camping, cabins, horseback riding. Family-run 50+ years."}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    approved = EXCLUDED.approved;

-- Highway Z Low-Water Bridge — Mile 16.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, river_mile_upstream, approved
)
SELECT
    r.id,
    'Highway Z Bridge',
    'highway-z-bridge',
    ST_SetSRID(ST_MakePoint(-91.2830, 37.9410), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge access at mile 16.3, off Highway Z. Convenient access for mid-river floats. Less than a mile downstream from Butts Bridge.',
    ARRAY['parking'],
    'Roadside pull-off near bridge. Space for approximately 5 vehicles.',
    'County Highway Z. From Steelville, take Hwy 8 east to Hwy Z, then north. Paved highway to the bridge area.',
    'No facilities. Undeveloped bridge access.',
    false,
    ARRAY['paved']::text[],
    '5',
    16.3,
    true
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    approved = EXCLUDED.approved;

-- Highway 8 Bridge (Lower / Dry Creek) — Mile 23.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Highway 8 Bridge (Lower)',
    'highway-8-lower',
    ST_SetSRID(ST_MakePoint(-91.2100, 37.9880), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'state',
    'State highway bridge at mile 23.0. Major access point. Dry Creek enters from the left just above the bridge, fed by James Spring (flow exceeds 1 million gallons per day). Reliable water from here downstream. Most popular commercial float trip put-in.',
    ARRAY['parking'],
    'Roadside parking near bridge. Space for approximately 10 vehicles.',
    'Paved State Highway 8. From Steelville, head east on Hwy 8 approximately 15 miles. From Leasburg/I-44, head south to Hwy 8 then west. Well-signed.',
    'No public facilities at bridge. Private campground on right (upstream side).',
    false,
    ARRAY['paved']::text[],
    '10',
    23.0,
    true,
    '<p>Key put-in for reliable floating. Dry Creek adds significant flow from James Spring (1M+ gallons/day), so water downstream is much more consistent. If upper Huzzah is too low, try putting in here instead. Most outfitter trips start here.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Huzzah Conservation Area — Mile 28.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Huzzah Conservation Area',
    'huzzah-conservation',
    ST_SetSRID(ST_MakePoint(-91.1034, 38.0412), 4326),
    'access',
    true,
    'MDC',
    'MDC conservation area at mile 28.4, just upstream of the Meramec River confluence. 6,225 acres of rugged Ozark forest. Access via low-water bridge off Hwy E. Historical remains of the Scotia Furnace and Iron Works (1870–1880). The Ozark Trail transects the area.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Gravel parking area at the low-water bridge. Space for approximately 15–20 vehicles. No commercial vehicle storage during closed hours (10 PM – 4 AM).',
    'From Steelville, take Hwy E northeast approximately 8 miles to the low-water bridge at Huzzah Creek. Alternatively from I-44 at Leasburg, take Hwy H south to Onondaga Cave area, then cross the Meramec. Address: 586 State Hwy E, Steelville, MO 65565.',
    'Primitive camping allowed September 15 through May 15 (day use only rest of year). 14-day camping limit per 30-day period. Vault toilets at main parking area. No water, no trash service — pack in, pack out. Ozark Trail trailhead access.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '20',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/huzzah-conservation-area',
    28.4,
    true,
    '<p>Most popular take-out for Huzzah floats. Below the Courtois Creek junction the creek widens considerably. Low-water bridge can be impassable during high water — check conditions before driving out. Day-use only June through mid-September.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Meramec River Confluence — Mile 29.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, river_mile_upstream, approved,
    local_tips,
    nearby_services
)
SELECT
    r.id,
    'Meramec River Confluence',
    'meramec-confluence',
    ST_SetSRID(ST_MakePoint(-91.1050, 38.0450), 4326),
    'access',
    ARRAY['access'],
    true,
    'county',
    'Where Huzzah Creek empties into the Meramec River at mile 29.4. End point for Huzzah Creek floats. Next access 2.5 miles downstream on the Meramec at Hwy H low-water bridge near Onondaga Cave State Park.',
    ARRAY['parking'],
    'Limited roadside parking. Space for approximately 5 vehicles.',
    'Via Hwy E and local county roads. Gravel roads in the immediate area. Can also be reached from Hwy H via Onondaga Cave State Park area.',
    'No facilities at the confluence. Onondaga Cave State Park is 2.5 miles downstream on the Meramec with full campground facilities.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    29.4,
    true,
    '<p>If you float past the Hwy E take-out, you''ll end up on the Meramec River. Next take-out is 2.5 miles downstream at Hwy H near Onondaga Cave. Plan accordingly.</p>',
    '[{"name": "Onondaga Cave State Park", "type": "campground", "phone": "573-245-6576", "distance": "2.5 miles downstream on Meramec", "notes": "Full campground with 61 electric sites, showers, cave tours. Hwy H low-water bridge provides Meramec access."}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- ============================================
-- COURTOIS CREEK ACCESS POINTS
-- ============================================

-- Berryman Campground
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Berryman Campground',
    'berryman-campground',
    ST_SetSRID(ST_MakePoint(-91.0986, 37.9047), 4326),
    'campground',
    true,
    'USFS',
    'Forest Service campground on upper Courtois. Good put-in.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Campground parking',
    false,
    true
FROM rivers r WHERE r.slug = 'courtois'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Bass River Resort
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Bass River Resort',
    'bass-river-resort',
    ST_SetSRID(ST_MakePoint(-90.8701, 37.9912), 4326),
    'campground',
    false,
    'private',
    'Private resort on lower Courtois. Cabins and camping available.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Resort parking',
    true,
    'Fee for non-guests',
    true
FROM rivers r WHERE r.slug = 'courtois'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;
