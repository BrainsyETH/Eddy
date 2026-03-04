-- 00055_huzzah_creek_access_point_details.sql
-- Add comprehensive access point details for Huzzah Creek
--
-- Sources:
-- - Missouri Department of Conservation (MDC) - Huzzah Conservation Area
-- - USDA Forest Service - Mark Twain National Forest (Hazel Creek Campground)
-- - Missouri State Parks - Dillard Mill State Historic Site
-- - FloatMissouri.com mile-by-mile guide
-- - Missouri Canoe & Float Association (MCFA)
-- - Local outfitters: Huzzah Valley Resort, Bass River Resort

BEGIN;

-- ============================================
-- UPDATE EXISTING: Huzzah Valley Resort
-- Add road_access, facilities, road_surface, parking_capacity, managing_agency, nearby_services
-- ============================================
UPDATE access_points
SET
    description = 'Family-run resort since 1979, located 10 miles east of Steelville on Hwy 8. Offers 2.5 miles of riverfront camping, canoe/kayak/raft rentals, cabins, and shuttle service. Popular mid-river stop — the 12-mile canoe trip passes through the campground in time for a lunch break. At river mile ~6.0 near the Hwy V bridge.',
    road_access = 'Fully paved via State Highway 8. From Steelville, head east on Hwy 8 for approximately 10 miles. Well-signed entrance on the south side of the highway. From I-44, take the Cuba exit (Exit 208), then south on Hwy 19 to Steelville, then east on Hwy 8.',
    facilities = 'Full-service private resort. Three shower houses with coin-operated showers ($0.50). Clean restrooms throughout. Camp store with river gear and essentials. Restaurant on-site. Playground, volleyball and basketball courts. Golf cart rentals. RV sites with 50-amp electric, water, and sewer hookups. Tent camping along the river. Cabins and A-frames sleeping 2–30 people. Horseback riding available.',
    parking_info = 'Large resort parking lot. Ample space for vehicles and trailers. Designated boat launch area.',
    amenities = ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp', 'store'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '50+',
    managing_agency = 'Private',
    nearby_services = '[{"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "5 miles", "notes": "Canoe/kayak/raft rentals, camping, cabins, shuttle service on Courtois, Huzzah, and Meramec"}, {"name": "Steelville", "type": "lodging", "distance": "10 miles west", "notes": "Full services: gas, restaurants, grocery, lodging"}]'::jsonb
WHERE slug = 'huzzah-valley-resort'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'huzzah');

-- ============================================
-- UPDATE EXISTING: Huzzah Conservation Area (Scotia / Hwy E)
-- This is the downstream MDC area at mile 28.4
-- ============================================
UPDATE access_points
SET
    description = 'MDC conservation area at mile 28.4, just upstream of the Meramec River confluence. 6,225 acres of rugged Ozark forest. Access via low-water bridge off Hwy E. Historical remains of the Scotia Furnace and Iron Works (1870–1880) on the property. The Ozark Trail transects the area.',
    road_access = 'From Steelville, take Hwy E northeast approximately 8 miles to the low-water bridge crossing at Huzzah Creek. Alternatively, from I-44 at Leasburg, take Hwy H south to Onondaga Cave State Park area, then cross the Meramec River. Last stretch is gravel. Address: 5070 Christy Mine Road, Bourbon, MO 65441. Also accessible from Hwy E at the Scotia low-water bridge (586 State Hwy E, Steelville, MO 65565).',
    facilities = 'Primitive camping allowed September 15 through May 15 (day use only remainder of year). 14-day camping limit per 30-day period. Vault toilets at main parking area. No water, no trash service — pack it in, pack it out. Bulletin boards at parking areas with area maps and regulations. Ozark Trail trailhead access.',
    parking_info = 'Gravel parking area at the low-water bridge. Space for approximately 15–20 vehicles. Additional parking at the campground area. No commercial vehicle storage allowed during closed hours (10 PM – 4 AM).',
    amenities = ARRAY['parking', 'restrooms', 'camping'],
    road_surface = ARRAY['paved', 'gravel_maintained']::text[],
    parking_capacity = '20',
    managing_agency = 'MDC',
    fee_required = false,
    ownership = 'MDC',
    official_site_url = 'https://mdc.mo.gov/discover-nature/places/huzzah-conservation-area',
    nearby_services = '[{"name": "Onondaga Cave State Park", "type": "campground", "distance": "2.5 miles downstream on Meramec", "notes": "Full campground with electric sites, showers, cave tours. Hwy H low-water bridge access to Meramec."}, {"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "3 miles", "notes": "Canoe/kayak/raft rentals, shuttle service, camping, cabins"}]'::jsonb
WHERE slug = 'huzzah-conservation'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'huzzah');

-- ============================================
-- NEW ACCESS POINTS
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
    'Dillard Mill State Historic Site on upper Huzzah Creek. Beautiful red gristmill (1908) set on the blue waters of Huzzah Creek. Uppermost access — only floatable in good water conditions. The mill sits on a rock dam that creates a scenic cascade. This is near the "Dillard access" at mile 0.0.',
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
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    approved = EXCLUDED.approved;

-- Hazel Creek Recreation Area (USFS) — Mile 3.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips
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
    'USDA Forest Service campground in the Mark Twain National Forest at mile 3.0. Popular with OHV/ATV riders, equestrians, and mountain bikers. Trailhead for the Ozark Trail (Courtois Creek Section). Part of the historic Old Lead Belt — features a foundation from a historic lead smelter. The Trail of Tears National Historic Trail passes through the site.',
    ARRAY['parking', 'camping', 'picnic'],
    'Small gravel parking area at campground entrance. Fits approximately 10–15 vehicles.',
    'From Potosi, drive south on Highway P for 14 miles, turn right on Highway C and travel west for 4 miles to Highway Z, then continue northwest on Highway Z for 2 miles. After pavement ends, continue straight ahead on County Road 657 for 1 mile to Hazel Creek Campground on the left. Remote area — no cell phone service.',
    'Primitive USFS campground with flat gravel/dirt campsites. Each site has a fire ring with grill, picnic table, and lantern post. Densely wooded with full shade. Vault toilets. No water, no electric hookups, no trash service. Ozark Trail trailhead on the road leading into the campground.',
    false,
    ARRAY['paved', 'gravel_unmaintained']::text[],
    '15',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21846',
    3.0,
    true,
    '<p><strong>Lead advisory:</strong> Recent tests indicate possible health risk to children 6 and under from lead exposure around the historic smelter site. Wash hands before eating and keep young children from playing in dirt and tailings.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Highway V Bridge — Mile 6.0 (Huzzah Valley Resort area)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
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
    'County highway bridge crossing at mile 6.0. Public bridge access with private campground nearby. Common put-in for floats heading downstream through the scenic middle section of Huzzah Creek.',
    ARRAY['parking'],
    'Roadside pull-off parking near bridge. Limited space — fits approximately 5 vehicles.',
    'Paved county highway V. From Steelville, take Hwy 8 east, then turn south on Hwy V. Bridge is approximately 2 miles south. Passenger vehicles fine year-round.',
    'No public facilities at the bridge itself. Private campground and access adjacent — ask locally for availability.',
    false,
    null,
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
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Highway 8 Bridge (Upper) — Mile 6.9
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved,
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
    'State highway bridge crossing at mile 6.9. Access is difficult at the highway — steep bank. Often used as a water-level check point. If water looks too low here, upstream sections won''t be floatable.',
    ARRAY['parking'],
    'Very limited roadside pull-off near bridge. Shoulder parking only — fits 3–4 vehicles max.',
    'Paved State Highway 8. From Steelville, head east on Hwy 8 approximately 8 miles. Bridge is well-visible from the road.',
    'No facilities. This is a highway bridge crossing only. Steep, difficult bank access — not ideal for loading/unloading boats.',
    false,
    ARRAY['paved']::text[],
    'limited',
    6.9,
    true,
    '<p>Good spot to check water levels before committing to a float. If the water looks thin here, turn back — everything upstream will be worse. The USGS gauge (07014000) is nearby for real-time readings.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Red Bluff Access — Mile 8.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Red Bluff Access',
    'red-bluff',
    ST_SetSRID(ST_MakePoint(-91.3390, 37.8862), 4326),
    'access',
    ARRAY['access'],
    true,
    'county',
    'Scenic access point at mile 8.3 with Red Bluff towering on river right. Access is on the left bank via county road. Nice gravel bar area.',
    ARRAY['parking'],
    'Small gravel pull-off. Roadside parking for approximately 5 vehicles.',
    'Gravel county road off Highway 8. Road is maintained but can be rough after heavy rain. Passenger vehicles OK in dry conditions.',
    'No facilities. Undeveloped access point with gravel bar.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    8.3,
    true
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    approved = EXCLUDED.approved;

-- Butts Low-Water Bridge — Mile 15.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
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
    'Popular mid-river access at mile 15.4. Good access with gravel bar — great campsite or lunch spot. Henpeck Hollow Creek enters from the right. Bass River Resort is nearby off Butts Road. Private campground adjacent.',
    ARRAY['parking'],
    'Gravel pull-off area near bridge. Space for approximately 10 vehicles.',
    'From Steelville, take Hwy 8 east, then turn north on Butts Road. Follow Butts Road approximately 1.5 miles to the low-water bridge. Gravel road, maintained. This is also the turn for Bass River Resort.',
    'No public facilities at bridge. Private campground adjacent with access — ask locally. Bass River Resort just over the hill on Butts Road.',
    false,
    null,
    ARRAY['gravel_maintained']::text[],
    '10',
    15.4,
    true,
    '[{"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "1.5 miles", "notes": "Full-service outfitter on Courtois Creek. Canoe/kayak/raft rentals, shuttle service for Huzzah, Courtois, and Meramec. Camping, cabins, horseback riding. Family-run 50+ years."}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Highway Z Low-Water Bridge — Mile 16.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
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
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    approved = EXCLUDED.approved;

-- Highway 8 Bridge (Lower / Dry Creek) — Mile 23.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
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
    'State highway bridge at mile 23.0. Dry Creek enters from the left just above the bridge, fed by James Spring (flow exceeds 1 million gallons per day). Private campground and access on right before the bridge. Reliable water levels from here downstream thanks to spring-fed Dry Creek.',
    ARRAY['parking'],
    'Roadside parking near bridge. Space for approximately 10 vehicles.',
    'Paved State Highway 8. From Steelville, head east on Hwy 8 approximately 15 miles. From Leasburg/I-44, head south on local roads to Hwy 8, then west. Bridge is well-signed.',
    'No public facilities at bridge. Private campground adjacent on the right (upstream side) — ask locally for access and fees.',
    false,
    null,
    ARRAY['paved']::text[],
    '10',
    23.0,
    true,
    '<p>This is a key put-in for reliable floating. Dry Creek adds significant flow from James Spring (1M+ gallons/day), so water levels downstream of here are much more consistent than the upper creek. If upper Huzzah is too low, try putting in here instead.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Huzzah Conservation Area (Upper / Hwy E Bridge) — Mile 28.4
-- Note: The existing "huzzah-conservation" record covers this area.
-- Adding a second access point for the upstream Hwy E low-water bridge specifically.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Highway E Bridge (Scotia)',
    'highway-e-bridge',
    ST_SetSRID(ST_MakePoint(-91.1200, 38.0300), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'MDC',
    'Low-water bridge on Highway E at mile 28.4, within the Huzzah Conservation Area. Common take-out for Huzzah floats. Just downstream of the Courtois Creek confluence (mile 28.1). The Huzzah Conservation Area River Access (Scotia) is the designated access name. Only 1 mile above the Meramec River.',
    ARRAY['parking', 'restrooms'],
    'Gravel parking area at the low-water bridge. Space for approximately 15 vehicles.',
    'County Highway E from Steelville heading northeast, approximately 8 miles. The low-water bridge crossing is the access point. Alternatively, from I-44 at Leasburg, take local roads south. Address: 586 State Hwy E, Steelville, MO 65565. Last stretch is gravel.',
    'Within Huzzah Conservation Area — vault toilet at nearby parking area. Primitive camping allowed Sept 15 – May 15. No water, no trash service. Pack in/pack out.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/huzzah-conservation-area',
    28.4,
    true,
    '<p>Most popular take-out for Huzzah floats. Below the Courtois Creek junction the creek widens considerably. Low-water bridge can be impassable during high water — check conditions before driving out. The Conservation Area is day-use only June through mid-September.</p>'
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Meramec River Confluence — Mile 29.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved,
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
    'Where Huzzah Creek empties into the Meramec River at mile 29.4. End point for Huzzah Creek floats. Next access is 2.5 miles downstream on the Meramec at the Hwy H low-water bridge near Onondaga Cave State Park.',
    ARRAY['parking'],
    'Limited roadside parking. Space for approximately 5 vehicles.',
    'Via Hwy E and local county roads. Gravel roads in the immediate area. Can also be reached from Hwy H via Onondaga Cave State Park area.',
    'No facilities at the confluence itself. Onondaga Cave State Park is 2.5 miles downstream on the Meramec with full campground facilities.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    29.4,
    true,
    '<p>If you float past the Hwy E take-out, you''ll end up on the Meramec River. The next take-out is 2.5 miles downstream at Hwy H near Onondaga Cave. Plan accordingly — this adds significant time to your float.</p>',
    '[{"name": "Onondaga Cave State Park", "type": "campground", "phone": "573-245-6576", "distance": "2.5 miles downstream on Meramec", "notes": "Full campground with 61 electric sites, basic sites, showers, cave tours. Hwy H low-water bridge provides Meramec access."}]'::jsonb
FROM rivers r WHERE r.slug = 'huzzah'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

COMMIT;
