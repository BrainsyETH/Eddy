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

-- ============================================
-- JACKS FORK RIVER ACCESS POINTS
-- ============================================

-- Blue Spring (Jacks Fork) — river mile 9.6; NPS campground here; needed for NPS "Blue Spring Campground" link
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
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
    false,
    true
FROM rivers r WHERE r.slug = 'jacks-fork'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Alley Spring
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
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
    false,
    true
FROM rivers r WHERE r.slug = 'jacks-fork'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Eminence City Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
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
    false,
    true
FROM rivers r WHERE r.slug = 'jacks-fork'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- NIANGUA RIVER ACCESS POINTS
-- ============================================

-- Bennett Spring State Park
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Bennett Spring State Park',
    'bennett-spring',
    ST_SetSRID(ST_MakePoint(-92.8501, 37.7156), 4326),
    'park',
    true,
    'state_park',
    'Major spring and trout park. Put-in for Niangua floats.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Large parking areas in park',
    true,
    'State park entrance fee',
    true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Lead Mine Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Lead Mine Access',
    'lead-mine',
    ST_SetSRID(ST_MakePoint(-92.4651, 37.3956), 4326),
    'access',
    true,
    'MDC',
    'MDC access area on middle Niangua.',
    ARRAY['parking'],
    'Gravel parking',
    false,
    true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- BIG PINEY RIVER ACCESS POINTS
-- ============================================

-- Paddy Creek Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Paddy Creek Access',
    'paddy-creek',
    ST_SetSRID(ST_MakePoint(-92.0347, 37.6789), 4326),
    'access',
    true,
    'MDC',
    'Upper Big Piney access near Paddy Creek Wilderness.',
    ARRAY['parking'],
    'Gravel parking area',
    false,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Ross Bridge Access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Ross Bridge',
    'ross-bridge',
    ST_SetSRID(ST_MakePoint(-91.7781, 37.6356), 4326),
    'bridge',
    true,
    'county',
    'County road bridge with gravel bar access.',
    ARRAY['parking'],
    'Roadside parking',
    false,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- HUZZAH CREEK ACCESS POINTS
-- ============================================

-- Huzzah Valley Resort
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, fee_notes, approved
)
SELECT 
    r.id,
    'Huzzah Valley Resort',
    'huzzah-valley-resort',
    ST_SetSRID(ST_MakePoint(-91.3219, 37.9519), 4326),
    'campground',
    false,
    'private',
    'Private campground with river access. Canoe rentals available.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Resort parking lot',
    true,
    'Launch fee for non-guests',
    true
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Huzzah Conservation Area
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, is_public, ownership,
    description, amenities, parking_info, fee_required, approved
)
SELECT 
    r.id,
    'Huzzah Conservation Area',
    'huzzah-conservation',
    ST_SetSRID(ST_MakePoint(-91.1034, 38.0412), 4326),
    'access',
    true,
    'MDC',
    'MDC conservation area with river access.',
    ARRAY['parking'],
    'Gravel parking area',
    false,
    true
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

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
