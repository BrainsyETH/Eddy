-- 00068_meramec_river_access_point_details.sql
-- Add comprehensive access point details for the Meramec River (Miles 0–140)
--
-- Sources:
-- - Missouri Department of Conservation (MDC) — Conservation Area pages
-- - Missouri State Parks — Onondaga Cave SP, Meramec SP, Robertsville SP
-- - FloatMissouri.com mile-by-mile guide
-- - Fllog blog float trip reports
-- - OzarkAnglers.com forum trip reports
-- - Paddling.com access point database
-- - Local outfitters: Bass River Resort, Ozark Outdoors, Bird's Nest Lodge,
--   Old Cove Canoe & Kayak, 3 Bridges Raft Rental, Meramec Caverns

BEGIN;

-- ============================================
-- UPDATE EXISTING SEED DATA
-- ============================================

-- Maramec Spring Park (Mile 28.1) — UPDATE with rich detail
UPDATE access_points
SET
    types = ARRAY['access', 'park'],
    description = 'Historic James Foundation park at the headwaters of the Meramec River. Fifth-largest spring in Missouri (96 million gallons/day) feeds crystal-clear water into the upper Meramec. Features the restored 1857 Maramec Iron Works and museum. Rainbow trout fishing in the spring branch (catch-and-release Nov–Feb, harvest Mar–Oct). Popular put-in for upper Meramec floats — the spring branch enters the river about 0.5 miles downstream of the park.',
    road_access = 'From I-44 exit 195 (St. James), take Hwy 8 south approximately 6 miles. Follow signs to Maramec Spring Park entrance. All paved roads. From Steelville, take Hwy 8 north approximately 8 miles. Address: 21880 Maramec Spring Dr, St. James, MO 65559.',
    facilities = 'Operated by the James Foundation (private, nonprofit). Campground with 34 electric/water sites and primitive tent sites. Bathhouse with hot showers (seasonal April–October). Picnic shelters (reservable), playgrounds, nature trails. Trout hatchery and museum. General store with bait, tackle, snacks, and firewood. Rainbow trout fishing in spring branch — Missouri trout permit required. No boat ramp — carry-in access via gravel bar below spring branch.',
    parking_info = 'Large paved parking lot near spring and museum. Additional gravel parking at campground. Ample space for vehicles with trailers. Overflow parking available on busy weekends.',
    amenities = ARRAY['parking', 'restrooms', 'camping', 'picnic', 'store'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '50+',
    managing_agency = 'Private',
    fee_notes = 'Park entrance fee: $5/vehicle weekdays, $10/vehicle weekends and holidays (seasonal). Camping fees additional. Trout tag required for fishing ($3/day).',
    nearby_services = '[{"name": "St. James", "type": "lodging", "distance": "6 miles north", "notes": "Full services: gas, restaurants, grocery, lodging. Wine country — several wineries nearby."}, {"name": "Steelville", "type": "lodging", "distance": "8 miles south", "notes": "Float trip capital of Missouri. Gas, restaurants, grocery, outfitters."}]'::jsonb
WHERE slug = 'maramec-spring-park'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

-- Scotia Bridge Access (Mile ~35) — UPDATE with rich detail
UPDATE access_points
SET
    types = ARRAY['access', 'bridge'],
    description = 'County road bridge crossing on the upper Meramec. Gravel bar access below the bridge provides a convenient put-in or take-out. Located in a scenic stretch between Maramec Spring and Steelville. Moderate current with riffles and small shoals.',
    road_access = 'From Steelville, take Hwy 19 north, then turn east on County Road to Scotia. Gravel road for the last mile to the bridge. Passenger vehicles can make it in dry conditions but may be challenging after heavy rain.',
    facilities = 'No developed facilities. Undeveloped gravel bar access below the bridge. No restrooms, no trash service — pack in, pack out.',
    parking_info = 'Gravel pull-off area near bridge. Space for approximately 8–10 vehicles. Trailers can fit but turning around requires care.',
    amenities = ARRAY['parking'],
    road_surface = ARRAY['paved', 'gravel_maintained']::text[],
    parking_capacity = '10',
    managing_agency = 'County',
    nearby_services = '[{"name": "Steelville", "type": "lodging", "distance": "5 miles", "notes": "Float trip capital of Missouri. Full services: gas, restaurants, grocery, outfitters."}, {"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "8 miles", "notes": "Canoe/kayak/raft rentals, shuttle service on Courtois, Huzzah, and Meramec"}]'::jsonb
WHERE slug = 'scotia-bridge'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

-- Steelville City Park (Mile ~50) — UPDATE with rich detail
UPDATE access_points
SET
    types = ARRAY['access', 'park', 'boat_ramp'],
    description = 'Municipal park in the self-proclaimed "Float Trip Capital of Missouri." Paved boat ramp with good facilities makes this one of the most popular put-in/take-out points on the upper Meramec. City park with ball fields, playground, and picnic shelters along the river. Several outfitters operate shuttle service from here.',
    road_access = 'In the town of Steelville on Hwy 19/Hwy 8. From I-44 exit 195 (St. James), take Hwy 8 south approximately 14 miles to Steelville. The city park is on the east side of town along the river. Well-signed from Main Street.',
    facilities = 'Paved single-lane boat ramp with concrete surface — good for motorized and non-motorized craft. Public restrooms (seasonal, April–October). Picnic shelters with grills. Playground. Ball fields. No camping in the city park — campgrounds available at nearby outfitters.',
    parking_info = 'Paved parking lot with dedicated trailer parking area. Space for approximately 25 vehicles with trailers. Well-maintained.',
    amenities = ARRAY['parking', 'restrooms', 'boat_ramp', 'picnic'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '25',
    managing_agency = 'Municipal',
    nearby_services = '[{"name": "Bird''s Nest Lodge", "type": "outfitter", "phone": "573-775-2333", "distance": "2 miles", "notes": "Canoe/kayak/raft rentals, shuttle service, cabins, campground on the Meramec"}, {"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "5 miles", "notes": "Full-service outfitter. Rentals, shuttle, camping, cabins."}]'::jsonb
WHERE slug = 'steelville-city-park'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

-- Meramec State Park (Mile 88.0, Upper Ramp) — UPDATE with rich detail
UPDATE access_points
SET
    types = ARRAY['access', 'park', 'boat_ramp'],
    description = 'Missouri''s most-visited state park on the Meramec River. 6,896 acres with over 40 caves, 13 miles of hiking trails, and a scenic stretch of river. The upper boat ramp near Campground 3 and the park store is the primary launch for floaters. Concession operates canoe/kayak/raft rentals with shuttle service. Popular float: Meramec SP to Onondaga Cave SP (approximately 20 miles, full day).',
    road_access = 'From I-44 exit 226 (Sullivan), turn left off the exit, go 3 miles south on Hwy 185 to the park entrance. All paved roads. Address: 115 Meramec Park Drive, Sullivan, MO 63080.',
    facilities = 'Concrete motorboat launch and separate canoe/kayak launch near park store and Campground 3. Campground 3: 32 sites with electric hookups, picnic tables, fire rings (driveways 35–63 ft accommodate RVs). Shower house with hot water and laundry (seasonal April–October). RV dump station. Frost-free water spigot available Nov–April. Visitor center, gift shop, camp store, restaurant. Three picnic shelters (reservable, capacity ~75 each). Cave tours (Cathedral Cave, Fisher Cave). 13 miles of trails. Canoe/kayak/raft rentals and shuttle service through park concession.',
    parking_info = 'Spacious paved parking lot near boat ramp accommodates vehicles and trailers. Four large parking lots at the campground. Ample room for oversized vehicles.',
    amenities = ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic', 'store'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '50+',
    managing_agency = 'State Park',
    fee_notes = 'No entrance or launch fee. Camping $12–$48/night depending on site type. Shelter reservations $35/day. Canoe/kayak/raft rental fees vary.',
    official_site_url = 'https://mostateparks.com/park/meramec-state-park',
    nearby_services = '[{"name": "Meramec State Park Concessions", "type": "canoe_rental", "phone": "573-468-6072", "distance": "On-site", "notes": "Canoe/kayak/raft rentals with shuttle service. Must arrive 30 min before shuttle departure — no refunds for missed shuttles."}, {"name": "3 Bridges Raft Rental", "type": "outfitter", "distance": "3 miles south of Sullivan", "notes": "Raft and tube rentals for Meramec River floats"}, {"name": "Sullivan", "type": "lodging", "distance": "3 miles north", "notes": "Full services: gas, restaurants, grocery, lodging, Walmart"}]'::jsonb,
    local_tips = '<p><strong>Shuttle tip:</strong> Park concession runs shuttles on a fixed schedule — arrive 30 minutes early. No refunds for missed departures. Weekends fill up fast in summer.</p><p><strong>Cave tours:</strong> Cathedral Cave and Fisher Cave tours available — check at the visitor center for schedules and fees.</p>'
WHERE slug = 'meramec-state-park'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

-- Onondaga Cave State Park (Mile 68.4) — UPDATE with rich detail
UPDATE access_points
SET
    types = ARRAY['access', 'park'],
    description = 'State park renowned for Onondaga Cave, a National Natural Landmark with spectacular cave formations. The river landing is at the Hwy H bridge on the northeast corner. A concrete boat ramp sits upstream of the bridge on the west side, and a canoe launch is downstream in the picnic grounds. 1,317 acres with campground, trails, and cave tours.',
    road_access = 'From I-44 exit 214 (Leasburg), take Hwy H south approximately 7 miles through Leasburg. Paved road throughout. The state river landing is on the northeast corner of the Hwy H bridge. Address: 7556 Hwy H, Leasburg, MO 65535.',
    facilities = 'Concrete boat ramp upstream of bridge (west side) and separate canoe launch downstream in picnic grounds. 19 basic + 45 premium (electric/water) + 3 accessible campsites. Shower houses with hot water near campsites (seasonal April–October). Laundry facility. RV dump station. Fire rings, picnic tables, lantern hangers. Playground, amphitheater. Vault toilets at day-use areas. 6 miles of trails. Cave tours: Onondaga Cave ($15 adults, $9 ages 6–12) and Cathedral Cave ($20 adults, $12 ages 6–12). Visitor center with gift shop.',
    parking_info = 'Paved parking near visitor center and day-use areas. Two overflow lots near the campsite area. Short walk to canoe launch from day-use parking. Trailer access at the boat ramp parking area.',
    amenities = ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '50+',
    managing_agency = 'State Park',
    fee_notes = 'No entrance or launch fee. Camping fees vary by site type. Cave tour fees separate.',
    official_site_url = 'https://mostateparks.com/park/onondaga-cave-state-park',
    nearby_services = '[{"name": "Ozark Outdoors Resort", "type": "outfitter", "phone": "573-245-6517", "website": "https://ozarkoutdoors.net", "distance": "2 miles", "notes": "Canoe/kayak/raft rentals, camping, cabins, shuttle service on the Meramec"}, {"name": "Leasburg", "type": "lodging", "distance": "7 miles north", "notes": "Small community near I-44. Gas and basic supplies."}]'::jsonb,
    local_tips = '<p><strong>Two launch areas:</strong> The concrete boat ramp (upstream, west side of bridge) works well for motorized boats and trailer launches. For canoes/kayaks, the picnic grounds launch (downstream of bridge) is easier with a gentle slope.</p><p><strong>Cave tours:</strong> Worth the stop — Onondaga Cave is one of Missouri''s most beautiful show caves.</p>'
WHERE slug = 'onondaga-cave-sp'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'meramec');

-- ============================================
-- NEW ACCESS POINTS — UPPER MERAMEC (Miles 0–26)
-- ============================================

-- Short Bend Access — Mile 0.9
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Short Bend Access',
    'short-bend',
    ST_SetSRID(ST_MakePoint(-91.5200, 37.7850), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC conservation area access at mile 0.9 on the uppermost floatable reach of the Meramec River. Part of the Short Bend Conservation Area — 1,081 acres of rugged Ozark forest. The Meramec is narrow and intimate here, winding through wooded bluffs. Gravel bar access suitable for canoes and kayaks. This is the uppermost developed put-in on the Meramec.',
    ARRAY['parking'],
    'Gravel parking area. Space for approximately 10 vehicles. Trailers can fit but turning around may be tight.',
    'From Salem, take Hwy 19 south, then east on Hwy KK to the conservation area entrance. Last mile is gravel. Remote area — limited cell service.',
    'Undeveloped MDC access. No restrooms, no water, no trash service — pack in, pack out. Gravel bar launch only, no boat ramp. Primitive camping allowed per MDC regulations (Sept 15 – May 15 in conservation areas).',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/short-bend-conservation-area',
    0.9,
    true,
    '<p><strong>Remote headwaters:</strong> This is the very beginning of the Meramec. Water levels can be too low for floating much of the summer. Check the USGS gauge near Steelville before planning a trip from here. Best after recent rain or in spring.</p>',
    '[{"name": "Salem", "type": "lodging", "distance": "12 miles northwest", "notes": "County seat of Dent County. Full services: gas, restaurants, grocery, lodging."}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
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
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Hwy M Low-Water Bridge — Mile 6.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Highway M Low-Water Bridge',
    'hwy-m-lwb',
    ST_SetSRID(ST_MakePoint(-91.4880, 37.7920), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'County low-water bridge crossing at mile 6.3 on the upper Meramec. Simple gravel bar access below the bridge. The river is still narrow here with moderate current and frequent riffles over gravel bars. Watch for the low-water bridge slab — portage may be necessary at low water.',
    ARRAY['parking'],
    'Roadside gravel pull-off near bridge. Space for approximately 5 vehicles. Tight for trailers.',
    'County Highway M from Salem area heading southeast. Gravel road approaches from both sides. Passenger vehicles can access in dry conditions.',
    'No developed facilities. Undeveloped bridge access with gravel bar. No restrooms, no trash service.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    6.3,
    true,
    '<p>Low-water bridge may be impassable during high water — check conditions before driving. At very low water, you may need to portage over or around the bridge slab.</p>'
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Cook Station Access — Mile 8.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Cook Station Access',
    'cook-station',
    ST_SetSRID(ST_MakePoint(-91.4650, 37.8000), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'County road crossing near the Cook Station community on the upper Meramec at mile 8.7. Gravel bar access below a low-water bridge. The river flows through mixed hardwood forest with occasional bluffs. Named for the nearby Cook Station community along the railroad.',
    ARRAY['parking'],
    'Gravel roadside pull-off. Space for approximately 5 vehicles.',
    'From Salem, take Hwy 19 south to Cook Station area, then local county roads east to the river. Gravel roads for the last 2 miles. Remote area.',
    'No developed facilities. Undeveloped bridge access. No restrooms.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    8.7,
    true,
    '<p>Remote upper stretch access. Best combined with Short Bend for a short 8-mile float or as a put-in for the longer run to Maramec Spring (approximately 20 miles).</p>'
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Wesco Access — Mile 13.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Wesco Access',
    'wesco',
    ST_SetSRID(ST_MakePoint(-91.4450, 37.8180), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'County road crossing at the Wesco community on the upper Meramec at mile 13.7. Low-water bridge with gravel bar access. The river begins to widen slightly through this stretch with more defined pools between riffles.',
    ARRAY['parking'],
    'Gravel pull-off area near bridge. Space for approximately 5 vehicles.',
    'From the Wesco community, take county roads south to the river crossing. Gravel roads. From Salem, approximately 10 miles southeast via county roads.',
    'No developed facilities. Undeveloped bridge access. No restrooms.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    13.7,
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    approved = EXCLUDED.approved;

-- Wesco–Hwy U Access — Mile 16.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Wesco–Highway U Access',
    'wesco-hwy-u',
    ST_SetSRID(ST_MakePoint(-91.4350, 37.8280), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Highway U bridge crossing at mile 16.7 between Wesco and the Hwy U corridor. Gravel bar access below the bridge. This stretch features deeper pools with good smallmouth bass fishing.',
    ARRAY['parking'],
    'Roadside gravel pull-off near bridge. Space for approximately 5 vehicles.',
    'County Highway U heading south from the Salem area. Paved highway to the bridge area.',
    'No developed facilities. Undeveloped bridge access. No restrooms.',
    false,
    ARRAY['paved']::text[],
    '5',
    16.7,
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    approved = EXCLUDED.approved;

-- Hwy U Access — Mile 18.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Highway U Access',
    'hwy-u',
    ST_SetSRID(ST_MakePoint(-91.4300, 37.8350), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Second Highway U crossing downstream at mile 18.7. Gravel bar access. The river continues through scenic Ozark forest with deepening pools. Several tributaries enter in this stretch adding to the flow.',
    ARRAY['parking'],
    'Roadside gravel pull-off. Space for approximately 5 vehicles.',
    'County Highway U. Paved highway to the bridge crossing.',
    'No developed facilities. Undeveloped bridge access. No restrooms.',
    false,
    ARRAY['paved']::text[],
    '5',
    18.7,
    true
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    approved = EXCLUDED.approved;

-- ============================================
-- NEW ACCESS POINTS — PRIMARY FLOAT STRETCH (Miles 26–90)
-- ============================================

-- Woodson K. Woods Memorial Conservation Area — Mile 26.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Woodson K. Woods Memorial CA',
    'woodson-k-woods',
    ST_SetSRID(ST_MakePoint(-91.4280, 37.8400), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC conservation area at mile 26.2, just upstream of Maramec Spring Park. 906 acres of Ozark forest with Meramec River frontage. Named for prominent Missouri conservationist. Provides access to the river above where the Maramec Spring branch enters, adding significant cold-water flow.',
    ARRAY['parking'],
    'Gravel parking area with space for approximately 10 vehicles. Adequate for trailers.',
    'From St. James, take Hwy 8 south approximately 5 miles, then turn west on local roads to the conservation area. Last stretch is gravel. From Steelville, take Hwy 8 north, then local roads east.',
    'Undeveloped MDC access. No restrooms, no water, no trash service. Gravel bar access — no formal boat ramp. Primitive camping allowed per MDC regulations (Sept 15 – May 15). Hunting permitted in season.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/woodson-k-woods-memorial-conservation-area',
    26.2,
    true,
    '<p>Good put-in for floating to Maramec Spring Park (2 miles) or beyond to Steelville (approximately 24 miles). Below this point, Maramec Spring adds massive cold-water flow that sustains the river through summer.</p>',
    '[{"name": "Maramec Spring Park", "type": "campground", "distance": "2 miles downstream", "notes": "Historic spring park with campground, museum, store, trout fishing. Entrance fee required."}, {"name": "St. James", "type": "lodging", "distance": "5 miles north", "notes": "Full services: gas, restaurants, grocery, lodging. Wine country."}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
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
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Scotts Ford Access — Mile 35.1
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Scotts Ford Access',
    'scotts-ford',
    ST_SetSRID(ST_MakePoint(-91.3600, 37.8600), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access at mile 35.1, downstream of Maramec Spring. Named for a historic river ford. 36-acre site with boat ramp access to the Meramec. Good smallmouth bass fishing in this spring-fed stretch. Popular put-in for the scenic middle section of the upper Meramec heading toward Steelville.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking area with space for approximately 15 vehicles. Adequate for boat trailers.',
    'From Steelville, take Hwy 19 north, then turn west on local county road to the access. Gravel road for the last 0.5 miles. From St. James, take Hwy 8 south then local roads.',
    'MDC boat ramp — gravel surface. No restrooms at this specific access point. No water, no trash service — pack in, pack out.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/scotts-ford-access',
    35.1,
    true,
    '[{"name": "Steelville", "type": "lodging", "distance": "5 miles south", "notes": "Float trip capital of Missouri. Full services: gas, restaurants, grocery, outfitters."}, {"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "7 miles", "notes": "Canoe/kayak/raft rentals, shuttle service"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
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
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Riverview Public Access — Mile 42.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Riverview Public Access',
    'riverview',
    ST_SetSRID(ST_MakePoint(-91.3300, 37.8900), 4326),
    'boat_ramp',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC public access at mile 42.3 with boat ramp on the Meramec River. Located in the scenic corridor between Steelville and the Bird''s Nest area. Good access for both put-in and take-out with developed boat ramp.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking area. Space for approximately 10 vehicles with trailers.',
    'From Steelville, take local county roads northeast approximately 5 miles to the access. Gravel road for the last mile.',
    'MDC boat ramp — gravel surface, suitable for small boats and canoes/kayaks. No restrooms. No water, no trash service — pack in, pack out.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    42.3,
    true,
    '[{"name": "Bird''s Nest Lodge", "type": "outfitter", "phone": "573-775-2333", "distance": "5 miles", "notes": "Canoe/kayak/raft rentals, shuttle service, cabins, campground"}, {"name": "Steelville", "type": "lodging", "distance": "5 miles southwest", "notes": "Full services: gas, restaurants, grocery, outfitters"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Fishing Spring Road Access — Mile 46.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Fishing Spring Road Access',
    'fishing-spring-road',
    ST_SetSRID(ST_MakePoint(-91.3200, 37.9200), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access at mile 46.8, named for nearby Fishing Spring which feeds cool water into the Meramec. 18-acre site providing boat and fishing access. Located in the popular float corridor between Steelville and Bird''s Nest area. This spring-fed stretch supports excellent smallmouth bass populations.',
    ARRAY['parking'],
    'Gravel parking area. Space for approximately 10 vehicles. Room for trailers.',
    'From Steelville, take Hwy 19 north approximately 3 miles, then east on Fishing Spring Road to the river. Gravel road for the last mile.',
    'MDC access — gravel bar launch, no formal boat ramp. No restrooms, no water, no trash service. Pack in, pack out.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    46.8,
    true,
    '[{"name": "Bird''s Nest Lodge", "type": "outfitter", "phone": "573-775-2333", "distance": "3 miles", "notes": "Canoe/kayak/raft rentals, shuttle service, cabins, campground on the Meramec"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Bird's Nest Access — Mile 50.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Bird''s Nest Access',
    'birds-nest',
    ST_SetSRID(ST_MakePoint(-91.3100, 37.9400), 4326),
    'access',
    ARRAY['access'],
    true,
    'county',
    'Access point at mile 50.0 near the Bird''s Nest Lodge area. Named for the lodge and campground that has been serving floaters on the Meramec for decades. This is a key mid-river access for the popular Steelville-to-Onondaga corridor. The river is well-established here with good flow and scenic bluffs.',
    ARRAY['parking'],
    'Roadside parking area. Space for approximately 10 vehicles.',
    'From Steelville, take Hwy 19 northeast. County roads to the access area. Some gravel sections near the river.',
    'No public facilities at this access. Bird''s Nest Lodge nearby offers restrooms, camping, and supplies for guests.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    50.0,
    true,
    '[{"name": "Bird''s Nest Lodge", "type": "outfitter", "phone": "573-775-2333", "distance": "Adjacent", "notes": "Long-established Meramec outfitter. Canoe/kayak/raft rentals, shuttle service, cabins, campground, camp store."}, {"name": "Ozark Outdoors Resort", "type": "outfitter", "phone": "573-245-6517", "website": "https://ozarkoutdoors.net", "distance": "10 miles downstream", "notes": "Full-service resort with rentals, camping, cabins, shuttle"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Huzzah CA / Hwy E Access — Mile 66.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Huzzah CA / Highway E Access',
    'huzzah-ca-hwy-e',
    ST_SetSRID(ST_MakePoint(-91.1100, 38.0350), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access on the Meramec at mile 66.2, near the Hwy E bridge and the Huzzah Conservation Area. Just downstream of where Huzzah Creek enters the Meramec at mile 66.3. The Huzzah and Courtois Creeks significantly boost the Meramec''s flow from here downstream. Part of the 6,225-acre Huzzah Conservation Area.',
    ARRAY['parking', 'restrooms'],
    'Gravel parking area at the low-water bridge area. Space for approximately 15 vehicles.',
    'From Steelville, take Hwy E northeast approximately 8 miles to the Meramec crossing area. From I-44 at Leasburg, take Hwy H south, then local roads west. Last stretch is gravel.',
    'Within Huzzah Conservation Area. Vault toilets at main parking area. Primitive camping allowed Sept 15 – May 15 (day use only remainder of year). No water, no trash service — pack in, pack out. Ozark Trail access nearby.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/huzzah-conservation-area',
    66.2,
    true,
    '<p>Key confluence point — Huzzah Creek and Courtois Creek enter just upstream, nearly doubling the Meramec''s volume. From here downstream, the river is reliably floatable through most of the season. Great smallmouth bass fishing in the pools below the confluence.</p>',
    '[{"name": "Ozark Outdoors Resort", "type": "outfitter", "phone": "573-245-6517", "website": "https://ozarkoutdoors.net", "distance": "3 miles", "notes": "Canoe/kayak/raft rentals, camping, cabins, shuttle service"}, {"name": "Onondaga Cave State Park", "type": "campground", "phone": "573-245-6576", "distance": "2 miles downstream", "notes": "Full campground with electric sites, showers, cave tours"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
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
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Campbell Bridge Access — Mile 73.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Campbell Bridge Access',
    'campbell-bridge',
    ST_SetSRID(ST_MakePoint(-91.0500, 38.0100), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access at mile 73.7 in Crawford County. 10-acre site with boat and fishing access to the Meramec River. Located between Onondaga Cave State Park and the Blue Springs Creek area. Good access for mid-river floats.',
    ARRAY['parking'],
    'Paved parking area — described as having lots of paved surface. Space for approximately 15 vehicles. Likely trailer-friendly based on paved surface.',
    'From Bourbon, take Route N south approximately 10 miles to the access. Paved county road to the site.',
    'MDC boat and fishing access. No specific restroom information — may have portable or vault toilet seasonally. No water, no trash service.',
    false,
    ARRAY['paved']::text[],
    '15',
    'MDC',
    73.7,
    true,
    '[{"name": "Onondaga Cave State Park", "type": "campground", "phone": "573-245-6576", "distance": "5 miles upstream", "notes": "Full campground with electric sites, showers, cave tours"}, {"name": "Bourbon", "type": "lodging", "distance": "10 miles north", "notes": "Small community on I-44. Gas, basic supplies."}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Blue Springs Creek Conservation Area — Mile 78.6
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Blue Springs Creek Conservation Area',
    'blue-springs-creek',
    ST_SetSRID(ST_MakePoint(-91.0300, 38.0200), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC conservation area at mile 78.6 in Crawford County. 859-acre area managed primarily for rainbow trout fishing on Blue Springs Creek, which enters the Meramec here. The old low-water bridge has been removed but pilings remain. Carry-in access only — fair for canoes and kayaks. No formal boat ramp.',
    ARRAY['parking'],
    'Three parking areas in the conservation area, off Route N and Blue Springs Road. Gravel surface. Space for approximately 10 vehicles total.',
    'From Bourbon, take Route N south 2.5 miles to Blue Springs Road, then Thickety Ford Road to the river. Crawford County, approximately 2.5 miles southwest of Bourbon. Gravel road for the last mile.',
    'Carry-in access only — old low-water bridge removed, pilings remain. No formal boat ramp. No restrooms at river access. 859-acre area managed for trout fishing. Hunting and fishing permitted per regulations.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/blue-springs-creek-conservation-area',
    78.6,
    true,
    '<p><strong>Carry-in only:</strong> The old low-water bridge has been removed. Pilings remain and can be a hazard at certain water levels. This is best used as a fishing access rather than a float trip access due to the carry-in difficulty. Rainbow trout fishing on Blue Springs Creek is the main attraction.</p>'
FROM rivers r WHERE r.slug = 'meramec'
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

-- Sappington Bridge Access — Mile 83.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Sappington Bridge Access',
    'sappington-bridge',
    ST_SetSRID(ST_MakePoint(-91.0200, 38.0000), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access at mile 83.2 in Crawford County. 10-acre site with boat and fishing access to the Meramec. The USGS Meramec River gauge is located here — useful for checking water levels before floating. Convenient access between the Blue Springs Creek area and Meramec State Park.',
    ARRAY['parking'],
    'Gravel parking area. Space for approximately 10 vehicles.',
    'From Sullivan, take Route D south, then Sappington Bridge Road east to the river. Crawford County. Paved road to the bridge area.',
    'MDC boat and fishing access. No confirmed restrooms. No water, no trash service. USGS gauge on-site for real-time river level readings.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    83.2,
    true,
    '<p><strong>USGS gauge:</strong> The Meramec River gauge is located here — check readings before your float at waterdata.usgs.gov. This is the most reliable water level reference for planning Meramec floats in this corridor.</p>',
    '[{"name": "Meramec State Park", "type": "campground", "distance": "5 miles downstream", "notes": "Full campground, cave tours, canoe/kayak/raft rentals with shuttle service"}, {"name": "Sullivan", "type": "lodging", "distance": "8 miles north", "notes": "Full services: gas, restaurants, grocery, lodging, Walmart"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Meramec State Park (Lower Ramp) — Mile 90.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Meramec State Park (Lower Ramp)',
    'meramec-sp-lower',
    ST_SetSRID(ST_MakePoint(-91.0380, 37.9750), 4326),
    'boat_ramp',
    ARRAY['access', 'boat_ramp'],
    true,
    'state_park',
    'Secondary boat launch within Meramec State Park at mile 90.0, located in the campground area on the left bank. Gravel launch — may be limited to registered campers. Watch for the rock dike on the left bank as you approach. Same park amenities as the upper ramp.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp'],
    'Parking within the campground area. Primarily for camping patrons. Limited trailer access compared to the upper ramp.',
    'Within Meramec State Park via internal park roads from the Hwy 185 entrance. Follow signs to the campground area. Address: 115 Meramec Park Drive, Sullivan, MO 63080.',
    'Gravel boat launch in the campground area. Same overall park amenities: restrooms, showers (seasonal), camping, camp store. Access to the lower launch may be limited to registered campers — check at the park office.',
    false,
    'No entrance or launch fee. Camping fees apply. Access to lower launch may require campground registration.',
    ARRAY['paved']::text[],
    '25',
    'State Park',
    'https://mostateparks.com/park/meramec-state-park',
    90.0,
    true,
    '<p><strong>Camper access:</strong> This gravel launch is in the campground area and may be restricted to registered campers. If you are not camping, use the upper ramp near the park store instead.</p><p><strong>Hazard:</strong> Watch for the rock dike on the left bank as you approach — can be submerged at higher water levels.</p>',
    '[{"name": "Meramec State Park Concessions", "type": "canoe_rental", "phone": "573-468-6072", "distance": "On-site", "notes": "Canoe/kayak/raft rentals with shuttle service"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
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
-- NEW ACCESS POINTS — MID MERAMEC (Miles 90–140)
-- ============================================

-- Spanish Claim Access — Mile ~92
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Spanish Claim Access',
    'spanish-claim',
    ST_SetSRID(ST_MakePoint(-91.0250, 37.9600), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'Remote MDC access within the Meramec Conservation Area at approximately mile 92. Carry-in access only — no boat ramp. A trail of approximately 100–200 yards leads through woods and across a large gravel bar to the river. An old concrete silo marks the parking area. Part of the 3,938-acre Meramec Conservation Area.',
    ARRAY['parking'],
    'Gravel parking lot — has been upgraded from formerly muddy conditions. An old concrete silo marks the location. Boats must be carried approximately 100–200 yards to the river, making trailer access impractical.',
    'From I-44 near Sullivan, take Hwy 185 south approximately 5 miles past the Meramec Work Station. Turn left onto Rt. K, follow 1.4 miles, turn left onto Spanish Claim Road (gravel). Follow approximately 4.5 miles to the dead-end parking area. Road is entirely gravel and is not well-marked on maps. Remote location.',
    'Carry-in access only. No boat ramp. Trail (100–200 yards) through woods to gravel bar and river — has been cleared and widened in recent years. No restrooms at this specific access point. The broader Meramec Conservation Area offers 10.5 miles of multi-use trails, paved ADA walking path, horseback riding, and 6 caves.',
    false,
    ARRAY['gravel_unmaintained']::text[],
    '10',
    'MDC',
    92.0,
    true,
    '<p><strong>Remote access:</strong> Spanish Claim Road is entirely gravel, poorly mapped, and dead-ends at the parking area. Plan accordingly and consider 4WD in wet conditions. The 100–200 yard carry to the river makes this unsuitable for heavy boats.</p>'
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- Sand Ford Access — Mile 95.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Sand Ford Access',
    'sand-ford',
    ST_SetSRID(ST_MakePoint(-91.0100, 37.9500), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at mile 95.4 near Stanton in Franklin County. 31-acre site with two boat ramps and 3/10 mile of public fishing access on the Meramec River. Located near Meramec Caverns (mile 94.3). Fair fishing for bass, catfish, suckers, and sunfish. Hours: open 4 AM to 10 PM daily; boat launching allowed 24 hours.',
    ARRAY['parking', 'boat_ramp'],
    'Parking area for the 31-acre site. Two boat ramps suggest adequate trailer parking. Surface type not confirmed — likely gravel.',
    'From Stanton (on I-44), take Route W southeast approximately 2 miles to the river. Well-signed from the highway. Franklin County.',
    'Two boat ramps (surface material not confirmed). 3/10 mile of public fishing access on the Meramec. Open 4 AM – 10 PM daily; boat launching allowed 24 hours. No overnight boat storage permitted. No confirmed restrooms on-site.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    95.4,
    true,
    '<p><strong>Near Meramec Caverns:</strong> Just 1 mile upstream from Sand Ford, Meramec Caverns offers cave tours and riverside attractions. Caveman Floating operates raft rentals nearby. Boat launching allowed 24 hours — no overnight boat storage.</p>',
    '[{"name": "Meramec Caverns / Caveman Floating", "type": "outfitter", "distance": "1 mile upstream", "notes": "Cave tours (one of Missouri''s most famous show caves) and raft rentals for Meramec River floats"}, {"name": "Stanton", "type": "lodging", "distance": "2 miles", "notes": "Small community on I-44. Gas, basic supplies. Several campgrounds in the area."}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Red Horse Access — Mile ~112
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Red Horse Access',
    'red-horse',
    ST_SetSRID(ST_MakePoint(-90.8800, 38.1100), 4326),
    'boat_ramp',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at approximately mile 112 in Franklin County. 43-acre site with a wide boat ramp in good condition. Located just around the bend from where Big Indian Creek enters the Meramec. Paddlers cross under the Hwy K bridge to reach the take-out. Large parking lot described as well-maintained.',
    ARRAY['parking', 'boat_ramp', 'picnic'],
    'Large parking lot in good condition. Ample room for vehicles and trailers. 43-acre site.',
    'From St. Clair, take Route K south. After crossing the Meramec River bridge, take Old Route K east across Indian Creek, then Project Road north about 0.75 mile. Franklin County.',
    'Wide boat ramp leading into a deep pool — more rocks and less mud than other Meramec access points. Picnic tables on-site. Wheelchair accessible areas. Campsites reported on Paddling.com (verify in field). No confirmed restrooms outside of user-submitted reports.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '25',
    'MDC',
    112.0,
    true,
    '<p><strong>Directions note:</strong> After crossing the Hwy K bridge southbound, the turn to Old Route K is easy to miss. Watch for the turn east just after the bridge. The ramp leads into a deep pool — good for launching but watch the rocks at lower water levels.</p>',
    '[{"name": "Old Cove Canoe & Kayak", "type": "outfitter", "distance": "8 miles downstream", "notes": "Float trips on upper and lower Meramec. Rentals and shuttle service."}, {"name": "St. Clair", "type": "lodging", "distance": "5 miles north", "notes": "Full services on I-44: gas, restaurants, grocery, lodging"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- River 'Round Conservation Area — Mile 127.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'River ''Round Conservation Area',
    'river-round',
    ST_SetSRID(ST_MakePoint(-90.8200, 38.1800), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC conservation area at mile 127.2 in Franklin County. 330-acre area with 3.3 miles of Meramec River frontage. Sandbars, upland and bottomland forest. Boat ramp provides access for both paddlers and motorized boats. Good take-out for mid-Meramec floats.',
    ARRAY['parking', 'boat_ramp'],
    'Large parking lot in good condition. Trailer access confirmed — boat ramp present. Gravel surface.',
    'From St. Clair, take Route TT east, then Mill Hill Road east about 0.25 mile, take Old Cove Road north, then River Round Road east. Franklin County. Mix of paved and gravel roads.',
    'MDC boat ramp (surface type unconfirmed). 330-acre area with river frontage. No confirmed restrooms or camping on-site.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    127.2,
    true,
    '[{"name": "Old Cove Canoe & Kayak", "type": "outfitter", "distance": "Adjacent area", "notes": "Float trips on upper and lower Meramec. Rentals and shuttle service."}, {"name": "St. Clair", "type": "lodging", "distance": "8 miles", "notes": "Full services on I-44: gas, restaurants, grocery, lodging"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Chouteau Claim Access — Mile 132.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Chouteau Claim Access',
    'chouteau-claim',
    ST_SetSRID(ST_MakePoint(-90.7900, 38.2000), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at mile 132.8 in Franklin County at the confluence of the Bourbeuse and Meramec Rivers. 15-acre site with boat ramp. Named for the historic Chouteau family land claim. The Bourbeuse River enters from the west, adding significant volume. Serves paddlers on both rivers.',
    ARRAY['parking', 'boat_ramp'],
    'Parking area for the 15-acre site. Trailer access likely — boat ramp present. Specific lot surface and capacity unconfirmed.',
    'From Moselle, take St. Mary''s Road northeast to the confluence of the Meramec and Bourbeuse rivers. Access via Hwy AH to St. Mary''s Road. Franklin County. Road condition warning: St. Mary''s Road has had historical problems including potholes, partial flooding, and gate closures — verify current conditions before visiting.',
    'MDC boat ramp (surface type unconfirmed). Located at the confluence of the Bourbeuse and Meramec Rivers. No confirmed restrooms or camping.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    132.8,
    true,
    '<p><strong>Road warning:</strong> St. Mary''s Road has had issues with potholes, seasonal flooding, and occasional gate closures. Franklin County and MDC have worked to improve access but verify conditions before visiting, especially after heavy rain.</p><p><strong>Confluence:</strong> The Bourbeuse River enters here — watch for increased current and debris after rain events on the Bourbeuse watershed.</p>',
    '[{"name": "Robertsville State Park", "type": "campground", "distance": "3 miles downstream", "notes": "State park campground with electric sites, showers, boat launch. Excellent smallmouth fishing."}, {"name": "Pacific/Eureka", "type": "lodging", "distance": "15 miles east", "notes": "Full services in the St. Louis metro area"}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- Robertsville State Park — Mile 136.0
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Robertsville State Park',
    'robertsville-sp',
    ST_SetSRID(ST_MakePoint(-90.7700, 38.2200), 4326),
    'park',
    ARRAY['access', 'park', 'boat_ramp'],
    true,
    'state_park',
    'State park approximately 40 miles west of downtown St. Louis with 2+ miles of Meramec River frontage. Single-lane boat launch at the day-use area. 12 basic + 13 electric campsites, family campsite, and 3 tent-platform sites. Excellent smallmouth bass fishing. Popular with St. Louis metro paddlers for accessible weekend floats.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic'],
    'Large paved parking lot at the boat-launching area. Accommodates vehicles with trailers. Four large parking lots at the campground. Additional parking near picnic shelters and trailheads.',
    'Approximately 40 miles west of downtown St. Louis, just off I-44. From I-44, take the Robertsville exit and follow signs to the park. All paved roads. Address: 900 State Park Road, Robertsville, MO 63072. Franklin County.',
    'Single-lane boat launch at the day-use area — suitable for small boats and canoes/kayaks. 2+ miles of river frontage. 12 basic + 13 electric campsites (reservable). 3 tent-platform sites + 1 family campsite. RV dump station, frost-free water spigots. Restroom/shower area (seasonal April 1 – October 31). Two large picnic shelters (electricity, grills, seating for 75 each, water faucets — reservable). Firewood and ice for purchase. Spice Bush Trail and Lost Hills Trail (2.6 miles). Playground.',
    false,
    'No entrance or launch fee. Camping fees apply (described as inexpensive). Shelter reservations at modest fee.',
    ARRAY['paved']::text[],
    '50+',
    'State Park',
    'https://mostateparks.com/park/robertsville-state-park',
    136.0,
    true,
    '<p><strong>Metro-accessible:</strong> Only 40 miles from downtown St. Louis — makes for an easy day trip or weekend camping float. The single-lane boat launch can get busy on summer weekends.</p><p><strong>Fishing:</strong> Excellent smallmouth bass fishing along the 2+ miles of river frontage. Best in spring and fall.</p>',
    '[{"name": "Pacific/Eureka", "type": "lodging", "distance": "10 miles east", "notes": "Full services in the St. Louis metro area: gas, restaurants, grocery, lodging, outdoor gear shops"}, {"name": "Chouteau Claim Access (MDC)", "type": "campground", "distance": "3 miles upstream", "notes": "MDC access at the Bourbeuse-Meramec confluence. Free access, no facilities."}]'::jsonb
FROM rivers r WHERE r.slug = 'meramec'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
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

COMMIT;
