-- 00075_courtois_creek_access_point_details.sql
-- Add comprehensive access point details for Courtois Creek (pronounced "Coat-a-way")
--
-- Courtois Creek is a 38.6-mile stream flowing generally north/northeast from
-- northern Iron County through Washington County and Crawford County, joining
-- Huzzah Creek just before its confluence with the Meramec River near Scotia.
--
-- Sources:
-- - Missouri Department of Conservation (MDC) - Huzzah Conservation Area
-- - USDA Forest Service - Mark Twain National Forest (Berryman Campground, Hazel Creek)
-- - USGS Water Data for the Nation - Stations 07014100, 07014200
-- - OzarkAnglers.com Forum - Courtois Creek access points and river miles
-- - FloatMissouri.com / SouthwestPaddler.com - mile-by-mile float guides
-- - Missouri Canoe & Float Association (MCFA) - Huzzah & Courtois guide
-- - Outfitter websites: Bass River Resort (bassresort.com), Ozark Outdoors Resort
-- - Campendium, TheDyrt, AllStays, Good Sam - campground GPS coordinates
-- - TopoZone / GNIS - Hazel Creek Campground coordinates
-- - Midwest Journeys blog - dispersed camping coordinates
--
-- River miles use the OzarkAnglers.com system (upstream from CR 654 / Sugar Grove = 0.0)
-- FloatMissouri.com uses a different system starting from Brazil LWB.

BEGIN;

-- ============================================
-- FIX EXISTING: Berryman Campground
-- The existing coordinates (-91.0986, 37.9047) are approximate.
-- Berryman Campground is actually ~1.2 miles north of Hwy 8 on FR 2266 at 37.9297, -91.0624.
-- However, for float planning, the CREEK access is at the Hwy 8 bridge (USGS gage 37.9181, -91.1011).
-- We'll update Berryman Campground with correct campground coordinates and full details,
-- and add the Highway 8 Bridge as a separate access point.
-- ============================================
UPDATE access_points
SET
    location_orig = ST_SetSRID(ST_MakePoint(-91.0624, 37.9297), 4326),
    types = ARRAY['campground'],
    description = 'Small, remote USFS campground in the Mark Twain National Forest, located at the site of a 1937 Civilian Conservation Corps camp (Camp Number F-MO-13, "Lost Creek," 3733rd Company). Situated 1.2 miles north of Hwy 8 on County Road 207 / FR 2266. Eight individual campsites and a covered picnic pavilion (seats 30). Trailhead for the 24-mile Berryman Trail (hiking, mountain biking, equestrian) and the western section of the Courtois Section of the Ozark Trail. NOT directly on Courtois Creek — the creek access is at the Hwy 8 bridge, 1.2 miles south.',
    road_access = 'From Potosi, at the intersection of MO Hwy 21 and MO Hwy 8, head west on Hwy 8 for approximately 17.3 miles. Turn right (north) on Berryman Rd / CR 207 for approximately 1.2 miles to the campground entrance on the left. Alternatively from Steelville, head east on Hwy 8 approximately 18.5 miles, turn left on Berryman Rd. Road is paved to the campground.',
    facilities = 'Primitive USFS campground — 8 sites, each with picnic table, fire ring, and lantern post. Centralized vault toilet. Open-sided picnic pavilion (seats ~30, first-come first-served, free). No water — bring your own. No electric hookups. No trash service — pack in, pack out. No camp host. Berryman Trail and Ozark Trail trailheads depart from the campground.',
    parking_info = 'Gravel parking area at campground. Each site has a parking spur. Space for approximately 10–12 vehicles. Trailer-friendly for horse trailers accessing the Berryman Trail.',
    amenities = ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '10',
    managing_agency = 'USFS',
    fee_required = false,
    fee_notes = 'Free — no fee',
    official_site_url = 'https://www.fs.usda.gov/r09/marktwain/recreation/berryman-campground',
    river_mile_upstream = 11.6
WHERE slug = 'berryman-campground'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'courtois');

-- ============================================
-- FIX EXISTING: Bass River Resort
-- The existing longitude (-90.8701) is WRONG. Correct is -91.1754.
-- GPS verified via Campendium, Good Sam, RV LIFE, Yelp: 37.9922, -91.1754
-- ============================================
UPDATE access_points
SET
    location_orig = ST_SetSRID(ST_MakePoint(-91.1754, 37.9922), 4326),
    types = ARRAY['access', 'campground'],
    description = 'Family-run private resort since 1967, nestled along the crystal-clear waters of Courtois Creek at mile 20.1. Located at the Butts low-water bridge (CR 550). Offers canoe, kayak, raft, and tube rentals with shuttle service on three rivers: Courtois, Huzzah, and Meramec. Float trips of 6, 7, and 13 miles. The resort sits at a key mid-river access point — the most popular floats pass through the campground. 60 cabins, 200 RV hookups, 400 camping sites along the creek.',
    road_access = 'From I-44, take Cuba exit, south on Hwy 19 to Steelville. Go straight through the 3-way stop in Steelville, east on Hwy 8, 10.5 miles to the big yellow Bass'' River Resort sign on your left. Follow the blacktop 1.5 miles to the resort. Address: 204 Butts Rd, Steelville, MO 65565. Phone: (800) 392-3700 or (573) 786-8517.',
    facilities = 'Full-service private resort. 60 cabins (sleeping 2–20+). 200 RV sites with hookups. 400+ tent camping sites along the creek. Inground swimming pool. Sand volleyball. Horseback riding. Hayrides. Camp store with essentials. Restaurant/meals available. Shower houses. Sit-on-top kayaks for easy entry/exit. Shuttle service to put-ins on Courtois, Huzzah, and Meramec rivers.',
    parking_info = 'Large resort parking lot. Ample space for vehicles and trailers. Designated boat launch area at Butts low-water bridge.',
    amenities = ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp', 'store'],
    road_surface = ARRAY['paved']::text[],
    parking_capacity = '50+',
    managing_agency = 'Private',
    fee_required = true,
    fee_notes = 'Fee for camping, cabin rental, and float trip services. Day-use access fee for non-guests. Call (800) 392-3700 for current rates.',
    official_site_url = 'https://bassresort.com',
    river_mile_upstream = 20.1
WHERE slug = 'bass-river-resort'
  AND river_id = (SELECT id FROM rivers WHERE slug = 'courtois');

-- ============================================
-- NEW ACCESS POINTS (upstream to downstream)
-- ============================================

-- 1. County Road 654 / Sugar Grove Church — Mile 0.0
-- Uppermost documented access point. At the abandoned Sugar Grove Church.
-- Washington County, MO. Coordinates estimated from USGS Courtois topo quad.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'County Road 654 Bridge (Sugar Grove)',
    'cr-654-sugar-grove',
    ST_SetSRID(ST_MakePoint(-91.0020, 37.8310), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge on County Road 654 at the site of the abandoned Sugar Grove Church. Uppermost documented access point on Courtois Creek (mile 0.0). The upper Courtois above this point is not regularly floated. Extremely remote — no services, no cell coverage. The creek here is very small and only floatable during high water. Not serviced by any canoe rental outfitters.',
    ARRAY['parking'],
    'Very limited roadside pull-off near the low-water bridge. Space for 3–4 vehicles at most. No designated parking area.',
    'Washington County Road 654. Remote gravel road south of Berryman in Washington County. High-clearance vehicle recommended. No signage — local knowledge required to find this access.',
    'No facilities whatsoever. Undeveloped bridge access in a very remote area. Nearest services are in Potosi (20+ miles east).',
    false,
    ARRAY['gravel_unmaintained']::text[],
    'limited',
    'County',
    0.0,
    true,
    '<p><strong>Expert-only access.</strong> The upper Courtois from CR 654 to Brazil is extremely shallow and narrow except during high water. Many portages around fallen trees likely required. Do NOT attempt unless you have checked water levels and are prepared for very challenging, remote creek floating. No cell service. No outfitter support.</p>'
FROM rivers r WHERE r.slug = 'courtois'
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

-- 2. Brazil Low-Water Bridge / County Road 657 — Mile 4.7
-- Usual head of navigation. Near the community of Brazil, Washington County.
-- Coordinates derived from Hazel Creek Campground area (37.8375, -91.0168)
-- and the fact that CR 657 / Hwy Z runs through this area.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Brazil Low-Water Bridge (CR 657)',
    'brazil-lwb',
    ST_SetSRID(ST_MakePoint(-91.0230, 37.8550), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge on Washington County Road 657 near the community of Brazil. This is the usual head of navigation for Courtois Creek — the practical upstream limit for most float trips. From here to Highway 8 it is mostly shallow, fast water with a few nice pools. The creek is not serviced by outfitters above this point — strictly a do-it-yourself float. The main paddling reach of 21.5 miles begins here.',
    ARRAY['parking'],
    'Small gravel pull-off near the low-water bridge. Space for approximately 5 vehicles.',
    'From Potosi, head south on Hwy P for 14 miles to Hwy C, then west on Hwy C for 4 miles to Hwy Z. Continue northwest on Hwy Z (also called Brazil Rd / Co Rd 657). Low-water bridge is on CR 657. Pavement ends before reaching the bridge — last stretch is gravel. Remote area — no cell service.',
    'No facilities. Undeveloped bridge access. Hazel Creek USFS Campground is approximately 3 miles upstream on a tributary (Hazel Creek, not Courtois).',
    false,
    ARRAY['paved', 'gravel_unmaintained']::text[],
    '5',
    'County',
    4.7,
    true,
    '<p><strong>Usual head of navigation.</strong> Check water levels at the USGS gage (07014100) near here before launching. From Brazil to Hwy 8 the gradient is 9.2 ft/mile — fast, shallow water with tight turns. Difficulty is frequently Class II due to sharp turns, obstructions, and narrow channels. Not for beginners in high water. Bring your own shuttle — no outfitter service this far upstream.</p>'
FROM rivers r WHERE r.slug = 'courtois'
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

-- 3. Hazel Creek Recreation Area (USFS) — Mile 7.7
-- Mark Twain National Forest. TopoZone confirmed: 37.837546, -91.016801
-- NOTE: This is on Hazel Creek near its mouth, providing access to Courtois Creek.
-- Difficult access — primarily a campground/trailhead, not a boat ramp.
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
    'hazel-creek-courtois',
    ST_SetSRID(ST_MakePoint(-91.0168, 37.8375), 4326),
    'campground',
    ARRAY['campground'],
    true,
    'USFS',
    'Primitive USFS campground in the Mark Twain National Forest at the confluence of Hazel Creek and Courtois Creek, at approximately mile 7.7. Difficult access to Courtois Creek — this is primarily a campground and trailhead, not a developed boat access. Southern trailhead for the Courtois Creek Section of the Ozark Trail (45 miles to Onondaga Cave State Park). Also connects to the Trace Creek Section heading south. Horses welcome — hitching posts at sites.',
    ARRAY['parking', 'camping'],
    'Small gravel parking area. Space for approximately 8 vehicles. Some spurs large enough for horse trailers.',
    'From Potosi, drive south on Hwy P for 14 miles; turn right on Hwy C and travel west for 4 miles to Hwy Z; continue northwest on Hwy Z for 2 miles. After pavement ends, continue straight ahead on Co. Rd. 657 for 1 mile to Hazel Creek Campground on the left. Remote area — no cell service. Contact: Potosi/Fredericktown Ranger District (573) 438-5427.',
    'Primitive campground — no mowing, no water, no toilets. Tables, fire rings, lantern posts, and hitching posts provided. Ozark Trail trailhead. Horses welcome. Elevation approximately 846 feet.',
    false,
    ARRAY['paved', 'gravel_unmaintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21846',
    7.7,
    true,
    '<p><strong>Difficult creek access.</strong> This campground is on Hazel Creek near its mouth at Courtois Creek. Getting boats to the water requires a carry through unimproved terrain. Best used as a camping base, not a primary put-in. The Ozark Trail crosses Courtois Creek multiple times in this area — wade crossings can be hazardous after rain.</p>'
FROM rivers r WHERE r.slug = 'courtois'
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

-- 4. Highway 8 Bridge (Berryman) — Mile 11.6
-- USGS Gage 07014200: 37°55'05"N, 91°06'04"W = 37.9181, -91.1011
-- This is the most popular put-in for Courtois Creek floats.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Highway 8 Bridge (Berryman)',
    'highway-8-berryman',
    ST_SetSRID(ST_MakePoint(-91.1011, 37.9181), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'USFS',
    'State highway bridge over Courtois Creek at mile 11.6, just west of the community of Berryman. THE most popular put-in for Courtois Creek float trips. Access via a small 4x4 trail on the westbound (south) side of the highway that goes under the bridge — can be muddy or washed out. USFS land extends along the west bank for approximately 3/4 mile downstream. USGS streamgage 07014200 is located here (drainage area: 173 sq mi, datum: 739 ft NAVD88). Berryman Campground (USFS, free, 8 sites) is 1.2 miles north on FR 2266. The Highway 8 (Berryman) Trailhead for the Ozark Trail and Berryman Trail is on the north side of Hwy 8.',
    ARRAY['parking'],
    'Small pull-off on the north side of Hwy 8 at the trailhead. Space for approximately 8–10 vehicles. The 4x4 trail to the creek access on the south side has very limited parking — 2–3 vehicles only.',
    'Paved State Highway 8. From Potosi, head west on Hwy 8 for approximately 17 miles. From Steelville, head east on Hwy 8 approximately 18.5 miles. The bridge is well-visible from the road. Berryman Campground is 1.2 miles north on CR 207 / FR 2266.',
    'No public facilities at the bridge itself. Berryman Campground (1.2 mi north) has vault toilets but no water. The trailhead parking area on the north side of Hwy 8 is well-maintained.',
    false,
    ARRAY['paved']::text[],
    '10',
    'USFS',
    11.6,
    true,
    '<p><strong>Primary put-in for Courtois Creek floats.</strong> The 4x4 access trail on the south side of the bridge is the traditional boat launch — 4WD recommended, especially after rain. Check the USGS gage (07014200) before launching. The 13-mile float from here to Bass River Resort (Butts LWB) is the classic Courtois day trip. First 4 miles can be very shallow with tight turns and fallen trees; improves after mile 5. If the water looks too low at the bridge, don''t attempt the float.</p>'
FROM rivers r WHERE r.slug = 'courtois'
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

-- 5. Blunt Low-Water Bridge (CR 544) — Mile 16.2
-- Mid-river access between Hwy 8 and Bass River Resort.
-- Coordinates estimated from creek course between USGS gages and known points.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Blunt Low-Water Bridge (CR 544)',
    'blunt-lwb',
    ST_SetSRID(ST_MakePoint(-91.1300, 37.9430), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge on Crawford County Road 544 at the community of Blunt, at mile 16.2. Mid-river access point that allows you to cut the 13-mile Berryman-to-Bass float in half — approximately 4.6 miles from Hwy 8 bridge, and 3.9 miles to Butts LWB. Private camping and parking reported nearby. Often referenced by floaters as "Blunt''s Bridge." FloatMissouri lists this at approximately mile 11.5 in their system.',
    ARRAY['parking'],
    'Small gravel pull-off near the low-water bridge. Space for approximately 5 vehicles. Private parking may be available nearby — ask locally.',
    'Crawford County Road 544. From Hwy 8 near Berryman, head north on local county roads. Gravel road, maintained. Specific route varies — check local maps or GPS. High-clearance vehicle recommended after rain.',
    'No public facilities. Undeveloped bridge access. Private camping reported adjacent — check locally for availability and fees.',
    false,
    null,
    ARRAY['gravel_maintained']::text[],
    '5',
    16.2,
    true,
    '<p>Good mid-trip access for splitting the Berryman-to-Bass float. The low-water bridge may be impassable by vehicle during high water. Portage required over the bridge at normal water levels. Private land on both sides — stay near the bridge and on gravel bars.</p>'
FROM rivers r WHERE r.slug = 'courtois'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    approved = EXCLUDED.approved;

-- 6. Butts Low-Water Bridge (CR 550) — Mile 20.1
-- At Bass River Resort. GPS: 37.9922, -91.1754 (verified via multiple sources)
-- This is the same location as Bass River Resort, but as a public bridge access.
-- Bass River Resort already exists as a separate access point.
-- Adding the bridge itself as a distinct public access.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Butts Low-Water Bridge (CR 550)',
    'butts-lwb',
    ST_SetSRID(ST_MakePoint(-91.1754, 37.9922), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge on Crawford County Road 550 (Butts Road) at mile 20.1. Common take-out for the 8.5-mile float from Hwy 8 bridge, and the put-in for the lower Courtois float to Huzzah Conservation Area (4.1 miles). The bridge is at Bass River Resort — Courtois Creek flows right through the resort property. Good gravel bar access. Henpeck Hollow Creek enters from the right nearby. This is the most accessible and popular mid-river access on Courtois Creek.',
    ARRAY['parking'],
    'Roadside parking near the low-water bridge. Additional parking available at Bass River Resort (fee for non-guests). Space for approximately 10 vehicles at the bridge.',
    'From Steelville, take Hwy 8 east approximately 10.5 miles to Butts Road (look for the big yellow Bass'' River Resort sign). Turn left (north) on Butts Road, follow the blacktop 1.5 miles to the low-water bridge. Paved road all the way.',
    'No public facilities at the bridge itself. Bass River Resort adjacent offers full services including restrooms, store, camping, and food for guests. The resort has been operating since 1967.',
    false,
    'Bridge access is public. Bass River Resort facilities require fee/reservation.',
    ARRAY['paved']::text[],
    '10',
    20.1,
    true,
    '<p>The classic take-out for the Hwy 8 to Bass float. Also a popular put-in for the "Butts Slab" 10-mile route: 6 miles on Courtois, 2 miles on Huzzah, 2 miles on Meramec ending at Ozark Outdoors Resort. Portage over the low-water bridge if continuing downstream. Bass Resort offers shuttle service — call (800) 392-3700.</p>',
    '[{"name": "Bass River Resort", "type": "outfitter", "phone": "573-786-8517", "website": "https://bassresort.com", "distance": "Adjacent", "notes": "Full-service outfitter since 1967. Canoe/kayak/raft/tube rentals with shuttle on Courtois, Huzzah, and Meramec. 60 cabins, 200 RV sites, 400 tent sites. Pool, horseback riding, store, restaurant."}]'::jsonb
FROM rivers r WHERE r.slug = 'courtois'
ON CONFLICT (river_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    parking_info = EXCLUDED.parking_info,
    amenities = EXCLUDED.amenities,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    local_tips = EXCLUDED.local_tips,
    nearby_services = EXCLUDED.nearby_services,
    approved = EXCLUDED.approved;

-- 7. Huzzah Conservation Area (Courtois Primitive Access) — Mile 24.2
-- MDC land. The "Upper Huzzah Conservation Area access" from OzarkAnglers.
-- Located where Courtois Creek enters the Conservation Area, at the end of the campground.
-- GPS estimated from MDC area coordinates (38.0307, -91.1881) and creek course.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    local_tips
)
SELECT
    r.id,
    'Huzzah Conservation Area (Courtois Access)',
    'huzzah-ca-courtois',
    ST_SetSRID(ST_MakePoint(-91.1980, 38.0200), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC conservation area river access at mile 24.2, on the right bank at the downstream end of the campground area. Part of the 6,225-acre Huzzah Conservation Area. This is the "Courtois Primitive" access point — the last take-out before Courtois Creek joins Huzzah Creek at mile 25.2. The Narrows, a dramatic narrow hogback ridge between Huzzah and Courtois Creeks, is in the southwest portion of the conservation area. The Ozark Trail transects the area.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Gravel parking area. Space for approximately 10 vehicles.',
    'From Steelville, take Hwy 8 east approximately 10 miles. Turn left on Butts Road, then left on Lower Narrows Road. Travel approximately 1.5 miles to the conservation area access. Alternatively, from Hwy E, follow signs to Huzzah Conservation Area. Address vicinity: 5070 Christy Mine Road, Bourbon, MO 65441. Phone: (636) 441-4554.',
    'MDC conservation area with primitive camping September 15 through May 15 (day use only remainder of year). 14-day camping limit per 30-day period. Vault toilets at parking area. No water, no trash service — pack in, pack out. Quiet hours 10 PM – 6 AM. Only foot traffic allowed within the conservation area.',
    false,
    ARRAY['gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/huzzah-conservation-area',
    24.2,
    true,
    '<p><strong>Last take-out on Courtois Creek.</strong> Below this point, Courtois Creek joins Huzzah Creek (mile 25.2) and then the Huzzah flows into the Meramec River. If you miss this take-out, the next access is the Scotia/Hwy E Bridge on Huzzah Creek, approximately 1 mile downstream of the confluence. Camping is seasonal (Sept 15 – May 15 only). Day-use only in summer.</p>'
FROM rivers r WHERE r.slug = 'courtois'
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

-- 8. Courtois-Huzzah Confluence — Mile 25.2
-- Where Courtois Creek empties into Huzzah Creek.
-- Just upstream of Scotia Bridge / Hwy E. No direct vehicle access at the confluence itself.
-- The Scotia Bridge on Huzzah Creek is the next downstream access.
-- USGS Huzzah Creek near Scotia gage (07014300) is nearby.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_upstream, approved,
    local_tips, nearby_services
)
SELECT
    r.id,
    'Courtois-Huzzah Confluence (Scotia Bridge)',
    'courtois-huzzah-confluence',
    ST_SetSRID(ST_MakePoint(-91.2120, 38.0290), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'MDC',
    'The confluence of Courtois Creek with Huzzah Creek at approximately mile 25.2, with the Scotia Bridge (MDC access on Huzzah Creek) 0.3 mile downstream on the low-water bridge off Highway E. This marks the end of Courtois Creek. The combined flow then reaches the Meramec River approximately 1 mile further downstream. Scotia Bridge is the nearest vehicle access — there is no direct road access at the actual confluence point. The Ozark Outdoors "Courtois Primitive" 5-mile float (1 mi Courtois + 2 mi Huzzah + 2 mi Meramec) ends at Ozark Outdoors Resort.',
    ARRAY['parking', 'restrooms'],
    'Gravel parking at the Scotia Bridge / Hwy E low-water bridge. Space for approximately 15 vehicles. Within Huzzah Conservation Area.',
    'Highway E from Steelville heading northeast, approximately 8 miles to the low-water bridge. Address vicinity: 586 State Hwy E, Steelville, MO 65565. Last stretch includes gravel. Also accessible from I-44 at Leasburg via Hwy H and local roads south.',
    'Within Huzzah Conservation Area. Vault toilet at nearby parking area. Primitive camping allowed Sept 15 – May 15. No water, no trash service.',
    false,
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    25.2,
    true,
    '<p>End of Courtois Creek. From here you are on Huzzah Creek flowing to the Meramec. The "Butts Slab" 10-mile float from Bass Resort ends at Ozark Outdoors Resort, passing through this confluence. Scotia Bridge can be impassable during high water. The Meramec River confluence is approximately 1 mile downstream.</p>',
    '[{"name": "Ozark Outdoors Riverfront Resort", "type": "outfitter", "phone": "573-245-6837", "website": "https://ozarkoutdoorsresort.com", "distance": "3 miles downstream on Meramec", "notes": "Full-service resort on the Meramec River. Canoe/kayak/raft/tube rentals. Camping, cabins, store. Take-out for extended Courtois-Huzzah-Meramec floats."}, {"name": "Onondaga Cave State Park", "type": "campground", "phone": "573-245-6576", "distance": "3.5 miles downstream on Meramec", "notes": "State park with 61 electric campsites, showers, cave tours. Hwy H low-water bridge access to Meramec."}]'::jsonb
FROM rivers r WHERE r.slug = 'courtois'
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

COMMIT;
