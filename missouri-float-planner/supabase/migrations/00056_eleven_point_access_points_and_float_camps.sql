-- Migration: Add float_camp type and complete Eleven Point River access points
-- Adds missing vehicle access points, float camps, and fixes mile markers
-- Sources: USFS Mark Twain National Forest, MDC, AR Own Backyard float guide

-- ============================================
-- 1. Add 'float_camp' to access_points type CHECK constraint
-- ============================================
ALTER TABLE access_points
DROP CONSTRAINT IF EXISTS access_points_type_check;

ALTER TABLE access_points
ADD CONSTRAINT access_points_type_check
CHECK (type IN ('boat_ramp', 'gravel_bar', 'campground', 'bridge', 'access', 'park', 'float_camp'));


-- ============================================
-- 2. Insert missing Eleven Point vehicle access points
--    (Seed only has Greer Spring, Turner Mill South, Riverton)
-- ============================================

-- Thomasville (Hwy 99) — Mile 0.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Thomasville',
    'thomasville',
    ST_SetSRID(ST_MakePoint(-91.4919, 36.7847), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'Mile zero on the Eleven Point. Thomasville is where the Middle Fork joins the main stem, bringing enough water to make floating possible — but only during higher flows, typically March through June. In summer and fall, the river above Greer Spring is often too low for comfortable floating. The upper section from here to Cane Bluff (9.3 miles) passes through beautiful but rugged terrain with smallmouth bass, goggle-eye, and chain pickerel. Expect shallow riffles, possible portages around remnants of an old low-water bridge at mile 3.8, and absolutely no services.',
    ARRAY['parking'],
    'USFS gravel lot at the Hwy 99 bridge. Small lot, fits ~10-12 vehicles. Rarely crowded due to seasonal limitations on this upper section.',
    'Paved via State Highway 99 in Thomasville. From Alton, take Hwy 160 west 12 miles, turn right on Hwy 99 north for 1.5 miles to the bridge.',
    'No amenities. No restrooms, no water, no trash service. Note: Forest Service has listed this site as "Closed" in the past — verify status before planning a launch here.',
    false,
    ARRAY['paved']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/thomasville-river-access',
    0.0,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Cane Bluff — Mile 9.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Cane Bluff',
    'cane-bluff',
    ST_SetSRID(ST_MakePoint(-91.405675, 36.796246), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'The first public access below Thomasville. The towering 250-foot Cane Bluff directly across the river is the landmark here. A rock slide in 1991 scarred the bluff face, adding to the dramatic scenery. This works as a takeout for the 9.3-mile Thomasville run or as a put-in for the 7.3-mile float to Greer Crossing. The river between Cane Bluff and Greer is still in the warm-water section — good smallmouth and goggle-eye fishing with moderate current.',
    ARRAY['parking', 'restrooms'],
    'USFS gravel lot on river left. Parking for 8 vehicles with trailers.',
    'From Winona, take SR 19 south 26 miles, turn right onto CR 410 for ~1.5 miles, then right onto CR 405 for ~4 miles to Cane Bluff.',
    'Vault toilet. No water, no camping, no trash service — pack in/pack out.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/cane-bluff-river-access',
    9.3,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Turner Mill North — Mile 21.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Turner Mill North',
    'turner-mill-north',
    ST_SetSRID(ST_MakePoint(-91.2700, 36.7690), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'Turner Mill North sits on the left bank at the historic site of Turner''s Mill. This access marks the downstream end of the Blue Ribbon Trout Area and the beginning of the White Ribbon Trout Area. It is 4.9 miles downstream from Greer — a short float through Mary Decker Shoal, a chute-type rapid with large boulders. No camping on the north side. Day use only.',
    ARRAY['parking', 'restrooms'],
    'Small USFS gravel lot on river left (north bank). Limited capacity, ~8-10 vehicles.',
    'Remote. From Winona, take Hwy 19 south 11.5 miles, turn right on NF-3152 for 6 miles, then right on NF-3190, which dead-ends at the river. All gravel for the last ~6 miles. High-clearance vehicle recommended after rain.',
    'Day-use picnic area with vault toilet and boat launch. No camping. No water, no trash service.',
    false,
    ARRAY['gravel_maintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/turner-mill-north-river-access',
    21.5,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- McDowell Access — Mile 24.2 (primitive)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id,
    'McDowell Access',
    'mcdowell',
    ST_SetSRID(ST_MakePoint(-91.241337, 36.760374), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'Primitive access on the left bank. Just past McDowell, the river makes a sharp bend around a narrow bluff line forming a horseshoe bend. Located 2.7 miles below Turner Mill in the White Ribbon Trout Area. No amenities — this is an unimproved access for experienced river users who know what they''re looking for.',
    ARRAY['parking'],
    'Unimproved pulloff. Very limited capacity.',
    'Remote forest roads from Highway 19. Unimproved. High-clearance vehicle recommended.',
    'No amenities. No restrooms, no water, no trash service.',
    false,
    ARRAY['gravel_unmaintained']::text[],
    '5',
    'USFS',
    24.2,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Whitten Access — Mile 28.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Whitten Access',
    'whitten',
    ST_SetSRID(ST_MakePoint(-91.214618, 36.732595), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'Popular midpoint access on the Eleven Point. Standard put-in for the Whitten to Riverton day float (8 miles, 4-5 hrs) — one of the most recommended floats on the river. Also the takeout for the Greer to Whitten run (11 mi, 5-6 hrs). White Ribbon Trout Area with stocked rainbow trout plus good smallmouth. Between Whitten and Riverton, the river passes Whites Creek, Greenbriar, and Boze Mill float camps — all primitive camps for overnighting.',
    ARRAY['parking', 'restrooms'],
    'USFS gravel lot on river right. Moderate capacity. Can be busy on weekends.',
    'From Alton, take Hwy 19 north 1.5 miles, right on Hwy AA for 9 miles, then left on Whitten Church Road (FR-4144 / County Road 137) for 2.2 miles. Mix of paved and gravel with a steep descent to the river.',
    'Vault toilet (accessible). Single-lane concrete boat ramp. No water, no picnic tables, no camping at the access. Dispersed camping permitted in surrounding national forest.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/whitten-river-access',
    28.0,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- The Narrows (Highway 142) — Mile 44.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'The Narrows (Highway 142)',
    'narrows',
    ST_SetSRID(ST_MakePoint(-91.191532, 36.550194), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'The last access on the Eleven Point National Scenic River. The Narrows gets its name from the dramatic geological feature: a narrow ridge of land (only ~30 feet wide at the overlook) separates the Eleven Point from Frederick Creek. Sullivan, Jones, and Blue Springs enter from the right at mile 44.0 against the steep bluff. A foot trail leads to an overlook at the top. Standard takeout for the Riverton to Narrows float (8.7 mi, 4-5 hrs). Below the Hwy 142 bridge, the Wild and Scenic designation ends.',
    ARRAY['parking', 'restrooms', 'boat_ramp'],
    'USFS paved parking lot. Moderate capacity.',
    'Paved via State Highway 142. From Thayer, take Hwy 142 east 21 miles. From Doniphan, take Hwy 142 west 25 miles.',
    'Developed site. Single-lane concrete boat ramp. Paved parking. Vault toilet. No camping, no water.',
    false,
    ARRAY['paved']::text[],
    '20',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/highway-142-river-access',
    44.3,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Myrtle / Stubblefield Ferry (MDC) — Mile 48.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id,
    'Myrtle Access',
    'myrtle',
    ST_SetSRID(ST_MakePoint(-91.17, 36.50), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'The last Missouri access on the Eleven Point, at the site of the old Stubblefield Ferry. About 4 miles below The Narrows and ~1 mile north of the Arkansas state line. MDC manages 26 acres here. The Wild and Scenic designation ended at The Narrows, so the river here is wider, slower, and less dramatic. Good smallmouth bass, goggle-eye, and walleye fishing.',
    ARRAY['parking', 'boat_ramp'],
    'Small MDC gravel lot on the west side. Limited capacity.',
    'From Thayer, take Hwy 142 east 19 miles, south on Hwy H for 7 miles, then left on County Road 278 for 2.5 miles. All gravel on the final approach. Remote and winding.',
    'MDC access. Concrete boat launch. Limited camping permitted. Vault toilet. No water, no trash service.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    48.0,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;


-- ============================================
-- 3. Insert Eleven Point float camps
--    River-access only primitive camping
-- ============================================

-- Denny Hollow Float Camp — Mile 6.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, facilities,
    fee_required, managing_agency, river_mile_downstream, approved
)
SELECT
    r.id,
    'Denny Hollow Float Camp',
    'denny-hollow',
    ST_SetSRID(ST_MakePoint(-91.432, 36.792), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Primitive float camp on the left bank at mile 6.5, in the warm-water upper section between Thomasville and Cane Bluff. River access only — no road access. Near Blowing Spring (mile 6.1) and Roaring Spring.',
    ARRAY['camping'],
    'No vehicle access. River only.',
    'Primitive dispersed camping. No facilities. No water, no toilet. Pack in, pack out.',
    false,
    'USFS',
    6.5,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    facilities = EXCLUDED.facilities,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Horseshoe Bend Float Camp — Mile 26.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, facilities,
    fee_required, managing_agency, river_mile_downstream, approved
)
SELECT
    r.id,
    'Horseshoe Bend Float Camp',
    'horseshoe-bend',
    ST_SetSRID(ST_MakePoint(-91.241807, 36.750644), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Float camp on the left bank at mile 26.5, in the White Ribbon Trout Area between Turner Mill and Whitten. River access only.',
    ARRAY['camping'],
    'No vehicle access. River only.',
    'Primitive dispersed camping. No facilities.',
    false,
    'USFS',
    26.5,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    facilities = EXCLUDED.facilities,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Barn Hollow Float Camp — Mile 27.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, facilities,
    fee_required, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Barn Hollow Float Camp',
    'barn-hollow',
    ST_SetSRID(ST_MakePoint(-91.230847, 36.741660), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Float camp on the left bank at mile 27.0, 10.4 miles downstream of Greer Crossing. River access only. In the White Ribbon Trout Area.',
    ARRAY['camping', 'restrooms'],
    'No vehicle access. River only.',
    'Fire rings and lantern posts at each campsite. Centrally located primitive pit toilet. No water.',
    false,
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/barn-hollow-float-camp',
    27.0,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    facilities = EXCLUDED.facilities,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Whites Creek Float Camp — Mile 28.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, facilities,
    fee_required, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Whites Creek Float Camp',
    'whites-creek',
    ST_SetSRID(ST_MakePoint(-91.210, 36.730), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Float camp on the left bank at mile 28.5, just 0.5 miles below Whitten Access. River access only. A spur trail connects to the 18.6-mile Whites Creek Trail into the Irish Wilderness. Whites Creek Cave, the largest cave on the Eleven Point, is a ~20-minute hike from the river.',
    ARRAY['camping', 'restrooms'],
    'No vehicle access. River only.',
    '5 designated sites, each with picnic table and fire ring. Centrally located pit toilet. No water.',
    false,
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/whites-creek-float-camp',
    28.5,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    facilities = EXCLUDED.facilities,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Greenbriar Float Camp — Mile 31.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, facilities,
    fee_required, managing_agency, river_mile_downstream, approved
)
SELECT
    r.id,
    'Greenbriar Float Camp',
    'greenbriar',
    ST_SetSRID(ST_MakePoint(-91.183, 36.710), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Float camp on the left bank at mile 31.0, between Whitten and Riverton. River access only. Primitive dispersed camping.',
    ARRAY['camping', 'restrooms'],
    'No vehicle access. River only.',
    'Primitive dispersed camping. Pit toilet. No water.',
    false,
    'USFS',
    31.0,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    facilities = EXCLUDED.facilities,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Boze Mill Float Camp — Mile 33.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Boze Mill Float Camp',
    'boze-mill',
    ST_SetSRID(ST_MakePoint(-91.1960, 36.6631), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Float camp at mile 33.4, at Boze Mill Spring — a sparkling blue pool producing 12-14 million gallons/day. Remnants of the historic mill dam wall and turbine are visible. Can be accessed from the river or via a short path from a parking area off County Road 152. Only 2 miles upstream of Riverton.',
    ARRAY['camping', 'restrooms'],
    'Small parking area accessible from County Road 152. Also accessible by river.',
    'From Riverton, go east on Hwy 160, turn north on County Road 152 to Boze Mill Spring.',
    'Primitive dispersed camping. Centrally located vault toilet. No water. Historic spring and mill ruins.',
    false,
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/boze-mill-float-camp',
    33.4,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;

-- Morgan Spring Float Camp — Mile 43.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id,
    'Morgan Spring Float Camp',
    'morgan-spring',
    ST_SetSRID(ST_MakePoint(-91.185, 36.560), 4326),
    'float_camp',
    ARRAY['float_camp'],
    true,
    'USFS',
    'Float camp on the right bank at mile 43.3, just past the spring branch inlet from Morgan Spring, 7.7 miles downstream of Riverton. Footpaths lead to Morgan, Sullivan, Jones, and Blue Springs — deep blue, mineral-rich springs adding 140 million gallons of 58-degree water to the river daily. A short drive from the Hwy 142 parking area provides hiking access to Morgan Spring.',
    ARRAY['camping', 'restrooms'],
    'Accessible by river from Riverton (~8 mi). Also hikeable from Hwy 142 Morgan Springs parking area.',
    'Primary access by river from Riverton. Hiking access from Morgan Springs parking area off Hwy 142.',
    '3 campsites, each with fire ring, lantern post, and picnic table. Centrally located vault toilet up the trail from campsites. No water.',
    false,
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/morgan-spring-float-camp',
    43.3,
    true
FROM rivers r WHERE r.slug = 'eleven-point'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    approved = EXCLUDED.approved;


-- ============================================
-- 4. Fix mile markers for existing access points
-- ============================================

-- Greer Spring/Crossing — fix mile marker (was likely NULL or wrong)
UPDATE access_points SET
    river_mile_downstream = 16.6
WHERE slug = 'greer-spring'
    AND river_id = (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Turner Mill South — fix mile marker
UPDATE access_points SET
    river_mile_downstream = 21.5
WHERE slug = 'turner-mill-south'
    AND river_id = (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Riverton — fix mile marker (35.7 -> 35.6)
UPDATE access_points SET
    river_mile_downstream = 35.6
WHERE slug = 'riverton'
    AND river_id = (SELECT id FROM rivers WHERE slug = 'eleven-point');
