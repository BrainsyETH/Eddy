-- Millstream Gardens Conservation Area (Tiemann Shut-Ins put-in) — high (https://www.openstreetmap.org/node/12694632624)
-- note: Pin moved ~260 m west from the prior mid-rapids point to the OSM-mapped MDC 'Rapid Access' canoe put-in slipway (canoe=put_in, operator=MDC, no trailer). MDC place page gives no coordinate; slipway node corroborated by MWA run descriptions (Lower St. Francis put-in at Tiemann Shut-Ins). Set is_public=true (was false in DB).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Millstream Gardens Conservation Area (Tiemann Shut-Ins put-in)', 'millstream-gardens-conservation-area',
    ST_SetSRID(ST_MakePoint(-90.46574, 37.570865), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    'MDC conservation area in Madison County that is the put-in for Missouri''s only Class II-IV whitewater run, the 2.3-mile Tiemann Shut-Ins reach down to Silver Mines. Paddlers carry down a short slope to a gravel put-in on river-left just above the rapids. The Missouri Whitewater Championships run this reach each spring.',
    ARRAY['parking', 'picnic']::text[],
    'Designated gravel/paved lots inside the conservation area near the put-in; vehicle use restricted to established parking areas.', 'From Fredericktown take Highway 72 west 8 miles to the area entrance, then follow the area road south to the river parking lots; Route D reaches the area from the south side of the river.', 'Carry-down gravel put-in on river-left above the Tiemann Shut-Ins (no constructed boat ramp); picnic areas, hiking trails and an accessible boardwalk to the shut-ins overlook within the 915.9-acre area.',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/millstream-gardens-conservation-area', 20.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Silver Mines Recreation Area (D-Bridge take-out) — high (https://www.openstreetmap.org/node/12695221470)
-- note: Pin moved ~460 m south from the USFS area reference coordinate (which sits 328 m off the river) to the OSM 'HWY D' slipway at the old D bridge day-use area, where paddlers actually take out. Twin slipway nodes exist on both banks (12695221470/12695221471), ~80 m apart; which bank hosts the main take-out lot was not fully resolved. Chart mile 23.2 retained (AW quotes the Millstream-to-D run as 2.3 mi, which would imply ~22.5; chart datum kept). Set is_public=true (was false).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Silver Mines Recreation Area (D-Bridge take-out)', 'silver-mines-recreation-area-hwy-d',
    ST_SetSRID(ST_MakePoint(-90.438287, 37.555039), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'USFS',
    'Mark Twain National Forest recreation area at the old Highway D bridge, the take-out for the Millstream Gardens/Tiemann Shut-Ins whitewater run and a put-in for the calmer float below. Slipways flank the old bridge (now a footbridge) with day-use areas on both banks and campgrounds on both sides of the river. Site of the historic Einstein silver mine and dam.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic']::text[],
    'Day-use parking lots by the old Highway D bridge (the standard whitewater take-out meeting spot) plus paved/gravel spurs in the campground loops.', 'From Fredericktown go west on Highway 72 about 4.3 miles, turn left (south) on Highway D for 2.9 miles, then turn right at the bottom of the hill at the USFS camping sign into the recreation area.', 'USFS campground with 70 individual sites (11 electric) in four loops plus a group site, ADA vault toilets, potable water, picnic tables; two day-use areas with river access at the old D bridge. Carry-in access, no constructed boat ramp. No showers or dump station.',
    true, '$5 per vehicle per day day-use fee ($10/bus, $40 season pass); camping $15-$35 per night depending on site/electric.',
    ARRAY['paved']::text[], 'unknown', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/silver-mines-recreation-area', 23.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Sam A. Baker State Park boat launch (Campground 1) — high (https://www.openstreetmap.org/node/3327686747)
-- note: MAJOR COORDINATE FIX: prior pin (37.256994,-90.502239) sat at Campground 2 on BIG CREEK, 1.74 km from the St. Francis line (Big Creek fronts most of the park). New pin is the OSM slipway 45 m from the St. Francis line adjacent to Campground 1, matching the park's documented 'concrete boat launch at Campground 1'. Moved ~2.6 km. Set is_public=true (was false).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Sam A. Baker State Park boat launch (Campground 1)', 'sam-a-baker-state-park-access',
    ST_SetSRID(ST_MakePoint(-90.512944, 37.235258), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'park']::text[],
    true, 'state_park',
    'The state park''s river access is a concrete boat launch at Campground 1 on the St. Francis River, usually shallow enough that only canoes, kayaks and small boats can launch. The park store rents canoes, kayaks and rafts for floats of roughly 4-18 miles on the St. Francis (Big Creek is kayak-only in high water). Below the park the river noticeably slows toward Wappapello Lake.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic', 'store']::text[],
    'Paved campground/day-use parking at Campground 1 near the launch.', 'From Highway 34 take Highway 143 north into the park (Patterson, Wayne County); the launch is at Campground 1 at the south end of the park on the St. Francis River.', 'Concrete boat launch on the St. Francis River at Campground 1, open except during heavy flooding; no launch fee. Full-service state park: campgrounds with showers, cabins, dining lodge, and the Mudlick Mountain park store with canoe/kayak/raft rental (floats April-November).',
    false, 'No boat launch fee; camping/cabin fees apply for overnight stays.',
    ARRAY['paved']::text[], 'unknown', 'State Park',
    'https://mostateparks.com/park/sam-baker-state-park', 66.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Hwy 34 bridge (Patterson gauge) — official (https://waterdata.usgs.gov/monitoring-location/USGS-07037500/)
-- note: Coordinate verified against USGS site 07037500 (co-located at the MO 34 bridge, pin 20-38 m from river line). Set is_public=true (was false).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hwy 34 bridge (Patterson gauge)', 'hwy-34-bridge',
    ST_SetSRID(ST_MakePoint(-90.503306, 37.194528), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'public road right-of-way (MoDOT)',
    'Road-bridge access on the flatwater reach 3.3 miles below Sam A. Baker State Park, at the USGS Patterson gauge. Used as a put-in/take-out for floats between the park and the Greenville area at the head of Wappapello Lake.',
    NULL,
    'Informal roadside parking at the bridge right-of-way only.', 'Missouri Route 34 about 3 miles east of Patterson (Wayne County); park in the road right-of-way at the bridge.', 'Undeveloped bridge access; no ramp, toilets or water. USGS gaging station 07037500 (St. Francis River near Patterson, NWS PAZM7) is at this bridge.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 69.8, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Greenville Recreation Area (Wappapello Lake, COE) — high (https://www.openstreetmap.org/node/9451590315)
-- note: IDENTITY RESOLVED: the coordinate-less MCFA 'Lake Creek (campground), mile 76.4' point is the modern Greenville Recreation Area - OSM geometry puts the Big Lake Creek mouth at exactly chart mile 76.4 with the COE campground/ramp on the same right bank 0.4 mi below (ramp = mile ~76.8). Enrichment pin (37.131558,-90.463563) was on the river line but ~1.7 km upstream of the actual facility; moved to the ramp. Consider renaming the slug to greenville-recreation-area. Ramp sits ~200 m off the OSM river centerline in the day-use inlet. guide_mile corrected 76.4 -> 76.8 within the same datum (creek mouth vs ramp). The Hwy 67 bridge (chart mile 78.6) downstream is a modern expressway crossing with no documented parking and was NOT added.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Greenville Recreation Area (Wappapello Lake, COE)', 'lake-creek',
    ST_SetSRID(ST_MakePoint(-90.468903, 37.116994), 4326),
    'campground', ARRAY['campground', 'boat_ramp', 'access']::text[],
    true, 'COE',
    'COE recreation area on the right bank of the St. Francis River at the head of Wappapello Lake, the standard last take-out below Sam A. Baker before the lake. Boat ramp with courtesy dock in the day-use area plus a large full-hookup campground on the Old Greenville townsite. Big Lake Creek enters on river-right just upstream (the old float charts'' ''Lake Creek, campground'' point at mile 76.4).',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic']::text[],
    'Paved day-use parking beside the ramp (OSM-mapped lot adjacent).', 'From US 67 at Greenville use the Old Greenville exit; the day-use boat ramp is on the east side of Highway 67 on the west bank of the St. Francis River.', 'US Army Corps of Engineers campground (106 full-hookup sites, showers, renovated 2019) with a day-use area: boat ramp with courtesy dock, 14 picnic sites, shelter, playground. Staffed April-November; built on the Old Greenville townsite.',
    true, 'A fee/day-use pass is required to use the boat ramp (Greenville Recreation Area Day Use Pass via Recreation.gov); amount not verified. Camping fees via Recreation.gov.',
    ARRAY['paved']::text[], 'unknown', 'COE',
    'https://www.recreation.gov/camping/campgrounds/233688', 76.8, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Roselle Access — high (https://www.openstreetmap.org/node/12694618289)
-- note: Was missing from DB despite being the river's reference-gauge access. OSM slipway note 'HWY 72 Access' matches MDC directions and the gauge coordinate (37.5961,-90.4986). floatmissouri/MCFA chart mile 17.7.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Roselle Access', 'roselle-access',
    ST_SetSRID(ST_MakePoint(-90.498782, 37.595069), 4326),
    'access', ARRAY['access', 'boat_ramp']::text[],
    true, 'MDC',
    'MDC access at the Highway 72 bridge, the put-in for the ''Upper St. Francis'' Class I-II whitewater run down to Millstream Gardens. The NWS/USGS Roselle gauge (07034000/ROZM7) that paddlers use for the runnable range is at this bridge. Gravel ramp serves the slow pool above the bridge for fishing when levels are low.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Gravel parking lot next to the ramp.', 'From Fredericktown take Highway 72 west 12 miles to the St. Francis River bridge and turn left immediately past the bridge (access is southwest of the bridge).', 'Gravel/dirt boat ramp near the parking lot; 21.9-acre MDC access at the confluence area of the St. Francis River and Stouts Creek. No camping (prohibited). Cafe and store historically nearby on Hwy 72.',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/roselle-access', 17.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Millstream Gardens Fisherman's Access — high (https://www.openstreetmap.org/node/12694618270)
-- note: Distinct from the Tiemann Shut-Ins put-in 0.5 mi downstream; MWA documents it as the Upper-run take-out ('Fisherman's Access in Millstream Gardens'). OSM node tagged canoe=put_in, operator=MDC, fee=no, trailer=no. Mile 19.7 interpolated from OSM geometry against the chart's Millstream 20.2.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Millstream Gardens Fisherman''s Access', 'millstream-gardens-fishermans-access',
    ST_SetSRID(ST_MakePoint(-90.47151, 37.573331), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    'The upstream (western) river access in Millstream Gardens Conservation Area, used as the take-out for the Class I-II ''Upper St. Francis'' run from Roselle and as a fishing access on the pool above the shut-ins. About half a mile upstream of the whitewater put-in.',
    ARRAY['parking']::text[],
    'Gravel lot at the access; no trailers (carry-in only).', 'Inside Millstream Gardens Conservation Area (Highway 72 west 8 miles from Fredericktown); follow the area road to the westernmost river parking lot.', 'Gravel carry-in put-in/take-out on the flatwater above the Tiemann Shut-Ins; no ramp, no camping.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/millstream-gardens-conservation-area', 19.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Gruner Ford (Hwy H bridge) — medium (https://www.openstreetmap.org/way/397133998)
-- note: Documented only by the MCFA/floatmissouri chart ('Gruner Ford, Hwy H bridge, 3 mi S of Farmington, must carry boats a short distance'); no modern trip reports found for this exact spot, so usability today is unverified - hence medium confidence and pending. Coordinate is the exact OSM MO-H bridge over the river matching the chart's description. Distinct from the second Route H crossing near Syenite at mile 7.0.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Gruner Ford (Hwy H bridge)', 'gruner-ford-hwy-h-bridge',
    ST_SetSRID(ST_MakePoint(-90.42918, 37.73973), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'public road right-of-way',
    'The mile-0 point of the traditional St. Francis float chart: the upper Route H crossing south of Farmington, a carry-in bridge access on the small headwaters stream. Only floatable at higher water; most paddlers start at Syenite or Roselle instead.',
    NULL,
    'Informal roadside parking; boats must be carried a short distance to the river.', 'From Farmington take Route H south about 3 miles to the St. Francis River bridge (St. Francois County).', 'Undeveloped road-bridge access; no facilities.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 0.0, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Syenite Access (Hwy H bridge) — high (https://www.openstreetmap.org/way/397133997)
-- note: Pin is the OSM bridge; the gravel ramp is on river-right immediately downstream (within ~150 m). Ownership/managing agency unverified - no MDC atlas page found, likely county/road right-of-way. Corroborated by three independent float sources (floatmissouri chart mile 7.0, southwestpaddler put-in, MWA forum 'Syenite to Roselle').
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Syenite Access (Hwy H bridge)', 'syenite-access',
    ST_SetSRID(ST_MakePoint(-90.40947, 37.68131), 4326),
    'access', ARRAY['access', 'bridge']::text[],
    true, NULL,
    'Gravel-ramp access at the lower Route H crossing near Syenite, the usual put-in for the Class I-II ''Syenite to Roselle'' upper run (10.7 miles to the Hwy 72 bridge) when the river is up. Southwestpaddler''s 15.7-mile Hwy H-to-Silver Mines reach starts here.',
    ARRAY['parking']::text[],
    'Small gravel area at the ramp; otherwise roadside.', 'Route H about 1 mile west of Syenite (south of Farmington/US 67, St. Francois County); the access is on river-right just downstream of the bridge.', 'Gravel ramp on the right bank just downstream of the Route H bridge; no other facilities.',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'limited', NULL,
    NULL, 7.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- Jewett Access (Hwy C bridge) — high (https://waterdata.usgs.gov/monitoring-location/USGS-07036100/)
-- note: Coordinate = USGS Saco gauge (07036100), co-located with the OSM Route C bridge (37.38487,-90.47412). The other mid-reach crossing, the Route E bridge at ~mile 27.8 (37.5025,-90.4579), has NO float-guide documentation as an access and was deliberately not added.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Jewett Access (Hwy C bridge)', 'jewett-access-hwy-c-bridge',
    ST_SetSRID(ST_MakePoint(-90.47412, 37.38487), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'public road right-of-way (MoDOT)',
    'The only documented access in the 43-mile gap between Silver Mines and Sam A. Baker State Park, at the Route C crossing near Jewett/Saco. The float chart notes a ''high bank but can be used as an access''; it splits the long middle float roughly in half (20 miles below Silver Mines, 23 above the park).',
    NULL,
    'Informal roadside parking only.', 'Route C bridge over the St. Francis River between Saco and Jewett, Madison County; park in the right-of-way at the bridge.', 'Undeveloped bridge access with a high bank - a steep carry, usable but rough. No facilities. USGS gauge 07036100 (St. Francis River near Saco) is at this crossing. Bridge replaced by MoDOT (2020s project).',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 43.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'st-francis'
ON CONFLICT (river_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    location_orig = EXCLUDED.location_orig,
    type = EXCLUDED.type,
    types = EXCLUDED.types,
    is_public = EXCLUDED.is_public,
    ownership = EXCLUDED.ownership,
    description = EXCLUDED.description,
    amenities = EXCLUDED.amenities,
    parking_info = EXCLUDED.parking_info,
    road_access = EXCLUDED.road_access,
    facilities = EXCLUDED.facilities,
    fee_required = EXCLUDED.fee_required,
    fee_notes = EXCLUDED.fee_notes,
    road_surface = EXCLUDED.road_surface,
    parking_capacity = EXCLUDED.parking_capacity,
    managing_agency = EXCLUDED.managing_agency,
    official_site_url = EXCLUDED.official_site_url,
    river_mile_downstream = EXCLUDED.river_mile_downstream,
    river_mile_upstream = EXCLUDED.river_mile_upstream,
    approved = EXCLUDED.approved,
    approved_at = COALESCE(access_points.approved_at, EXCLUDED.approved_at);

-- ---- Purge cached drive times for this river ----
DELETE FROM drive_time_cache
WHERE start_access_id IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'st-francis')
   OR end_access_id   IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'st-francis');
