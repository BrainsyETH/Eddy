-- Parks Bluff Campground — medium (https://www.openstreetmap.org/node/12545662793 (named slipway, access=customers); location corroborated by parksbluff.com ('just off Highway 21 in Lesterville... right where the West Fork and the Middle Fork connect'))
-- note: is_public=false (customer landing). Included because most upper-Black floats start from the Lesterville outfitter bases. Guide mile 8.4 = the West/Middle Fork junction on the floatmissouri chart, matching the business's own location description.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Parks Bluff Campground', 'parks-bluff-campground',
    ST_SetSRID(ST_MakePoint(-90.845392, 37.442269), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    false, 'private',
    'Private outfitter campground in Lesterville at the West Fork/Middle Fork junction, one of the main commercial put-ins for the upper Black River float reach. Rents canoes, kayaks, rafts, and tubes for floats down to the Lesterville/Mill Creek area and beyond.',
    ARRAY['parking', 'camping']::text[],
    'Customer parking at the campground.', 'Just off MO Highway 21 in Lesterville; campground entrance on the river at the West Fork/Middle Fork junction.', 'Private family campground and outfitter (canoe/kayak/raft/tube rental, shuttle); riverside beach launch. Customer access only.',
    true, 'Private outfitter base - rental/camping customers (camping ~$8/person/night per their site, 2026).',
    ARRAY['paved']::text[], 'unknown', 'Private',
    'https://www.parksbluff.com/floating.html', 8.4, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'black'
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

-- Twin Rivers Landing — medium (https://www.openstreetmap.org/node/12545702392 (named slipway, access=customers); business at 375 Twin Rivers Rd, Lesterville (Hwy 21))
-- note: is_public=false (customer landing). Guide mile ~9.6 (East Fork junction on the floatmissouri chart) inferred from the name and OSM position ~1 river mile below Parks Bluff; not confirmed by an official mileage source.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Twin Rivers Landing', 'twin-rivers-landing',
    ST_SetSRID(ST_MakePoint(-90.827823, 37.438631), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    false, 'private',
    'Family-run outfitter landing and campground (50+ years) on the Black River at Lesterville, near the East Fork junction - the ''twin rivers''. A major commercial put-in/take-out for upper Black River floats.',
    ARRAY['parking', 'camping']::text[],
    'Customer parking at the campground.', 'Off MO Highway 21 at Lesterville via Twin Rivers Road; landing is on the Black River near the East Fork junction.', 'Private campground/outfitter (raft, canoe, tube floats; primitive and electric campsites; cabins). Customer access only.',
    true, 'Private outfitter base - rental/camping customers.',
    ARRAY['paved']::text[], 'unknown', 'Private',
    'https://twinriversmo-gotoblu.com/', 9.6, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'black'
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

-- Mill Creek — medium (OpenStreetMap: mouth of Mill Creek at the Black River (way 1355701762); floatmissouri chart mile 10.7 'Mill Creek on left')
-- note: HUMAN REVIEW: land tenure unverified - this is a guide/chart put-in, not an official MDC/USFS access; actual launching is likely at the iron-bridge crossing (mile 10.3) or nearby gravel bars. The official public access for this stretch is the MDC Lesterville Access ~1.4 river miles downstream (added separately). Kept is_public=true because it is a long-documented, road-reachable put-in.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mill Creek', 'mill-creek',
    ST_SetSRID(ST_MakePoint(-90.81932, 37.43359), 4326),
    'access', ARRAY['access']::text[],
    true, NULL,
    'Informal put-in at the mouth of Mill Creek on the upper Black River below Lesterville (Reynolds County). The floatmissouri chart calls this the best starting point at normal or low water, with an iron-bridge road crossing 0.4 mile upstream at chart mile 10.3. Used as the put-in for documented moherp trips (8.3 mi to the mile-19 bluff, 14.3 mi to Hwy K).',
    NULL,
    NULL, 'Reached from the Lesterville area via Peola Road (CR 342); the floatmissouri chart notes an iron bridge crossing 0.4 mile upstream (mile 10.3) as the better put-in/take-out spot.', 'Informal gravel-bar put-in at the Mill Creek confluence; no developed facilities.',
    false, NULL,
    NULL, 'unknown', NULL,
    NULL, 10.7, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'black'
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

-- Lesterville Access — official (MDC GIS (gisblue.mdc.mo.gov Discover_Nature/Area_Feature_Layers, Parking Lots layer 26, Area_ID 9201: Lat 37.417148, Long -90.825574, paved, no trailers); area centerpoint 37.4179,-90.8258)
-- note: Pin is the official MDC parking lot; the water's edge is ~0.3-0.5 mi east of it (walk-in). guide_mile 12.1 interpolated between Mill Creek (10.7) and Coil Bluff (14.5) from map position ~1.4 river miles below the Mill Creek mouth - needs confirmation. Trailer boats not practical (walk-in only).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Lesterville Access', 'lesterville-access',
    ST_SetSRID(ST_MakePoint(-90.825574, 37.417148), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '53-acre MDC walk-in access on the upper Black River below Lesterville (Reynolds County), the only official public access on the Lesterville-to-Hwy K float reach above the COE Highway K park. The river channel shifted away from the parking area, so canoes must be carried about 1/3 mile along the old gravel channel to the water.',
    ARRAY['parking']::text[],
    'Paved MDC parking lot; trailers not allowed.', 'From Lesterville, take Highway 21 east 1 mile, then Peola Road (County Road 342) south to the junction with County Road 364; take County Road 364 south 1.5 miles to the access (MDC directions).', 'Walk-in access only: the river channel has moved, and reaching the water requires a ~1/3-mile hike along the gravel path of the former channel. No ramp, no restrooms. No camping.',
    false, NULL,
    NULL, 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/lesterville-access', 12.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- Highway K Recreation Area (Clearwater Lake) — high (OpenStreetMap slipway node 12546710482 'Highway K' (sand river access at the bridge), 140 m from the official Recreation.gov facility 232604 coordinate (37.3241667, -90.7666667))
-- note: Pin is the OSM river launch (sand) at the bridge; Recreation.gov's facility coordinate is 140 m away. When Clearwater Lake's flood pool is high, slack water can back up to this area (documented in river dossier). Gate/season closures may limit vehicle access off-season - flag for outfitter confirmation.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Highway K Recreation Area (Clearwater Lake)', 'highway-k-rec-area',
    ST_SetSRID(ST_MakePoint(-90.7651, 37.324674), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'COE',
    'COE recreation area at the MO Hwy K bridge west of Annapolis - the standard take-out for the Lesterville float reach and, per the floatmissouri chart (mile 25.0), the last take-out above Clearwater Lake when the lake is at full pool. Campground with 83 sites straddles both banks at the bridge.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic']::text[],
    'Campground and day-use parking within the COE park.', 'From Annapolis, follow MO Highway K west for 5 miles; the park is on both sides of the Hwy K bridge over the Black River (address 5347 Co. Rd. 452, Annapolis).', 'US Army Corps of Engineers campground at the upper end of Clearwater Lake: 83 sites (many electric, some water hookups), showers, dump station, picnic shelter, playground, concessions; sand/gravel river launch at the bridge.',
    false, 'Camping fees apply (Recreation.gov). Campground is seasonal (approximately mid-May to mid-September); day-use/launch fee policy not published.',
    ARRAY['paved']::text[], 'unknown', 'COE',
    'https://www.recreation.gov/camping/campgrounds/232604', 25.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- River Road Park (below Clearwater Dam) — official (Recreation.gov facility 232691 (37.1336111, -90.7669444), corroborated by OSM 'River Road Public Use Area' node (37.1336635, -90.7681888))
-- note: Pin is the official Recreation.gov facility point at the campground below the dam. An OSM slipway 1.2 km further downstream (37.128065, -90.755650, with adjacent waste basket and campsites) is probably the park's actual boat ramp at the east end of the campground - human should verify against satellite and move the pin if confirmed. guide_mile 38.2 interpolated (~0.6 mi below Clearwater Dam, chart mile 37.6).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'River Road Park (below Clearwater Dam)', 'river-road-park',
    ST_SetSRID(ST_MakePoint(-90.766944, 37.133611), 4326),
    'campground', ARRAY['campground', 'boat_ramp']::text[],
    true, 'COE',
    'COE park on the Black River tailwater immediately below Clearwater Dam - the uppermost public put-in for the lower (dam-release) Black River reach that runs down past Markham Springs and Hammer Access. 107-site campground with a boat ramp; trout-like clear releases, year-round access.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp']::text[],
    'Paved roads and sites; campground and day-use parking.', 'From Piedmont, follow State Highway HH about 6 miles; the campground is immediately below Clearwater Lake Dam on the Black River.', 'US Army Corps of Engineers campground with 107 sites (most electric/water), hot showers, flush toilets, dump station, boat ramp, fish-cleaning stations, three group picnic shelters, playground. Open year-round.',
    false, 'Camping fees apply (Recreation.gov); day-use policy not published.',
    ARRAY['paved']::text[], 'unknown', 'COE',
    'https://www.recreation.gov/camping/campgrounds/232691', 38.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- Mill Spring (Hwy 49) City Park — medium (OSM MO 49 bridge over the Black River at Mill Spring (way 512659205, east end 37.0590134,-90.6868039); launch documented by the MDC Black River Watershed Inventory ('small boats or canoes can be launched from... Highway 49 (Mill Spring City Park)'))
-- note: HUMAN REVIEW: exact park/launch spot inferred - pin is the east (village) end of the Hwy 49 bridge; adjust to the park drive on satellite. Chart's 'camping available' not verified against a current source, so camping was left out of amenities.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mill Spring (Hwy 49) City Park', 'mill-spring-city-park',
    ST_SetSRID(ST_MakePoint(-90.6868, 37.05901), 4326),
    'access', ARRAY['access', 'park']::text[],
    true, 'city',
    'City park launch at the Hwy 49 bridge in Mill Spring, between Clearwater Dam and Markham Springs on the lower Black River. MDC''s watershed inventory lists it (with Hammer CA) as one of the small-boat/canoe launch points on this reach; the floatmissouri chart (mile 50.6) notes camping available at Mill Spring.',
    NULL,
    NULL, 'At the MO Highway 49 bridge over the Black River on the west edge of the village of Mill Spring (Wayne County).', 'Small-town riverside park; carry-in launch for canoes/kayaks/small boats. No developed ramp documented.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'Municipal',
    NULL, 50.6, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'black'
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

-- Markham Springs Recreation Area — high (OpenStreetMap slipway node 13205346380 'Markham' at the riverbank, bracketed by the USFS page coordinate (36.981279, -90.605007) and Recreation.gov facility 234490 (36.9733333, -90.6016667); USFS page confirms a single-lane concrete boat launch with 8 parking spots)
-- note: Pin moved from the spring/day-use area (36.97887, -90.60364, 248 m off-river) to the riverbank launch. Coordinate is the OSM slipway; USFS and Recreation.gov points are 450-700 m away at the area entrance/campground. Types upgraded to boat_ramp per USFS 'single lane concrete boat launch'. The floatmissouri chart's 'Browns Crossing (Hwy A), mile 59.6, take-out + fee camping' appears to be the road crossing at this same area (highway renumbered to MO 49) - not added separately.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Markham Springs Recreation Area', 'markham-springs',
    ST_SetSRID(ST_MakePoint(-90.599656, 36.976387), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground']::text[],
    true, 'USFS',
    'Developed USFS recreation area on the right bank of the lower Black River below Clearwater Dam, 3 miles west of Williamsville. Concrete single-lane boat launch plus campground, picnic area, springs, and trails; the usual put-in for the short float down to Hammer Access (2.7 miles).',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp']::text[],
    '8 spaces at the boat-ramp lot plus campground/day-use parking.', 'From Poplar Bluff take US 67 north ~14 miles, then MO 49 west ~9 miles (past Williamsville); take the first right after crossing the Black River.', 'Mark Twain NF recreation area: single-lane concrete boat launch, campground (electric loop + 3 primitive loops, showers, drinking water, vault toilets), day-use/picnic area with pavilion, 2-acre mill pond and springs, Fuchs House cabin rental. Campground season May 1 - Oct 1; day-use 6 AM-10 PM year-round.',
    true, 'Day use $5/vehicle (fee tubes on site); camping $10-$17/night single (2026, Recreation.gov facility 234490).',
    ARRAY['paved']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/markham-springs-recreation-area', 59.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- Hammer Access (Bradley A. Hammer Memorial CA) — official (MDC GIS Boat Ramps layer 17, Area_ID 9629 (UTM 15N 717725.8, 4093594.1 = 36.963281, -90.554368); adjacent MDC paved parking lot at 36.963165, -90.554485; matches OSM slipway node 13205787623)
-- note: Existing pin was already correct (matches the official MDC ramp feature within 20 m); coordinate refined to the MDC GIS boat-ramp point. MDC GIS also shows a second river-access parking spot ~0.8 km upstream inside the area (paved lot at ~36.96374, -90.56267, OSM slipway 13205787650) - single point kept at the main CR 424 access. Kept type 'access' (not boat_ramp) because MDC describes it as primitive/small-boat only.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hammer Access (Bradley A. Hammer Memorial CA)', 'hammer-access',
    ST_SetSRID(ST_MakePoint(-90.554368, 36.963281), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '344-acre MDC conservation area on the lower Black River about a half mile south of Williamsville, with 1.4 miles of river frontage. Primitive canoe/small-boat access off County Road 424, commonly used as the take-out 2.7 river miles below Markham Springs; primitive camping allowed.',
    ARRAY['parking', 'camping']::text[],
    'Paved MDC lot at the river access; trailers not allowed per MDC GIS.', 'From Williamsville, take Highway 49 west, then County Road 417 south, County Road 419 west, and County Road 424 north to the river (MDC directions).', 'Primitive small-boat/canoe launch (MDC watershed inventory: only small boats or canoes can be launched). Designated individual campsites on the area; no restrooms or drinking water.',
    false, NULL,
    NULL, 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/bradley-hammer-memorial-conservation-area', 62.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- Hilliard Access — official (MDC GIS Boat Ramps layer 17, Area_ID 6614 (UTM 15N 729867.6, 4078157.1 = 36.821377, -90.422786); paved parking at 36.8216, -90.422598; matches OSM slipway node 13235621436 (canoe=yes, trailer=yes, fee=no))
-- note: Official MDC spelling is 'Hilliard' (floatmissouri spells it 'Hillard'). This is the facility the old bluff-cave pin was accidentally sitting on. MDC GIS parking says trailers not allowed while OSM says trailer=yes - ramp launching implies trailers are used; left parking capacity unknown.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hilliard Access', 'hilliard-access',
    ST_SetSRID(ST_MakePoint(-90.422786, 36.821377), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '1-acre MDC ramp access on the Black River at the Highway W bridge, 2.6 miles north of Poplar Bluff. Take-out for floats coming down from the Williamsville/Hammer area; the floatmissouri chart (mile 79.1, ''Hillard'') notes the river flattens from here downstream. Popular walleye water between here and Clearwater Dam.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved MDC lot at the ramp.', 'From Poplar Bluff, take Highway W north 2.6 miles; turn left into the area immediately after crossing the Black River bridge (MDC directions).', 'MDC boat ramp and parking at the Hwy W bridge. No restrooms; camping prohibited.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/hilliard-access', 79.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- Sportsman's Park Access (Poplar Bluff) — official (MDC GIS Boat Ramps layer 17, Area_ID 8929 (UTM 15N 734033.6, 4071925.0 = 36.764235, -90.378037); paved parking at 36.763987, -90.378062; matches OSM slipway node 13235577780)
-- note: Not MDC-owned; MDC lists it under a cooperative agreement with the city (ownership=city, managing_agency=Municipal). ADA=Yes on the MDC GIS ramp feature.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Sportsman''s Park Access (Poplar Bluff)', 'sportsmans-park-access',
    ST_SetSRID(ST_MakePoint(-90.378037, 36.764235), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'park']::text[],
    true, 'city',
    'Municipal boat ramp in Sportsman''s Park on the southwest side of Poplar Bluff (floatmissouri chart mile 87.3, one mile above the US 60 bridge). Downstream limit of the commonly floated Black River in Missouri and a standard take-out/launch for the flatwater below Hilliard Access; excellent walleye and bass water.',
    ARRAY['parking', 'picnic', 'boat_ramp']::text[],
    'Paved lot with an accessible parking area added in 2019.', 'From the Highway 60 / Business 60 (E. Pine Street) junction in Poplar Bluff, take Business 60 southwest 2 miles; the park is on the right (1301 Black River Industrial Park Rd).', 'City park boat ramp on the Black River with pavilion, picnic tables, and an ADA-accessible fishing platform (built 2019). Operated by Poplar Bluff Parks & Recreation under a cooperative agreement with MDC.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'Municipal',
    'https://mdc.mo.gov/discover-nature/places/sportsmans-park-access-poplar-bluff', 87.3, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'black'
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

-- ---- Retired points (delete unless referenced by a float plan; then soft-retire) ----
-- retire bluff-cave: not an access point - floatmissouri chart landmark ('Spring and cave in bluff on right side', mile 19.0) with no named public access at that mile; stored pin was also misplaced ~70 river miles downstream on top of MDC Hilliard Access
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'black' AND ap.slug = 'bluff-cave'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'black' AND ap.slug = 'bluff-cave';

-- ---- Purge cached drive times for this river ----
DELETE FROM drive_time_cache
WHERE start_access_id IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'black')
   OR end_access_id   IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'black');
