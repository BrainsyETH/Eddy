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
