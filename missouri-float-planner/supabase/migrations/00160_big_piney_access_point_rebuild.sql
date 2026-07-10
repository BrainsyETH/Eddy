-- Baptist Camp Access — high (https://mdc.mo.gov/discover-nature/places/baptist-camp-access)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 25 m to corrected NHD channel. Type corrected to access-only: MDC page/facilities confirm carry-in at low-water bridge, no boat ramp (was mis-typed boat_ramp in seed).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Baptist Camp Access', 'baptist-camp',
    ST_SetSRID(ST_MakePoint(-92.0185, 37.2579), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    'Uppermost public put-in on the floatable Big Piney River at mile 0.0. Forested MDC area with low-water bridge and canoe/kayak access. Start of the good smallmouth bass fishing on the upper river. The gradient from here to Boiling Spring is 4.2 ft/mile — relatively swift with riffles. The river is narrow and scenic through this stretch with overhanging trees and small bluffs.',
    ARRAY['parking', 'restrooms', 'picnic']::text[],
    'Gravel parking lot with space for approximately 10 vehicles and trailers.', 'From Houston, take Highway 63 south 6 miles, then Route RA west 1 mile. Mailing address: Simmons, MO 65689.', 'Privy (vault toilet), picnic area, low-water bridge. No drinking water. No boat ramp — carry-in access at low-water bridge.',
    false, 'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/baptist-camp-access', 19.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Dogs Bluff Access — high (https://mdc.mo.gov/discover-nature/places/dogs-bluff-access)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 12 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Dogs Bluff Access', 'dogs-bluff',
    ST_SetSRID(ST_MakePoint(-92.0022, 37.3267), 4326),
    'access', ARRAY['access', 'boat_ramp']::text[],
    true, 'MDC',
    'MDC access with concrete boat ramp on the Big Piney River, 3 miles west of Houston. Popular summer swimming hole with scenic bluffs. Good fishing for bass and sunfish. Picnic area with privy.',
    ARRAY['parking', 'restrooms', 'picnic', 'boat_ramp']::text[],
    'Paved/gravel parking area with space for vehicles and trailers.', 'From Houston, take Highway 17 west 3 miles. Well-signed. MDC maintained concrete ramp.', 'Concrete boat ramp, picnic area, privy (vault toilet). No drinking water.',
    false, 'No fee.',
    ARRAY['paved']::text[], '15', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/dogs-bluff-access', 27.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Mineral Springs Access — high (https://mdc.mo.gov/discover-nature/places/mineral-springs-access)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 49 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mineral Springs Access', 'mineral-springs',
    ST_SetSRID(ST_MakePoint(-91.988, 37.344), 4326),
    'access', ARRAY['access', 'boat_ramp']::text[],
    true, 'MDC',
    'MDC access at mile 14.6 with concrete boat ramp. 6.3-acre area on the Big Piney River near Houston. Mineral Spring is 0.5 mile up a branch. Horseshoe Bend Natural Area is across the river. Good fishing for bass and sunfish. Popular put-in for the long 40-mile run to Ross Access.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Gravel/paved parking area for vehicles and trailers.', 'From Highway 63 at the north Houston city limit, take Oak Hill Drive west, then Forest Drive west, then Mineral Drive north 2 miles to the access. Houston, MO 65483.', 'MDC maintained concrete boat ramp. No restrooms on-site. No drinking water.',
    false, 'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/mineral-springs-access', 30.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Sandy Shoals Ford — medium (seed (curated))
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 209 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Sandy Shoals Ford', 'sandy-shoals-ford',
    ST_SetSRID(ST_MakePoint(-91.974, 37.378), 4326),
    'access', ARRAY['access', 'bridge']::text[],
    true, 'county',
    'Low-water ford crossing at mile 19.3. Sand Shoals Road connects Hwy E on the east to Hwy AA on the west. Popular put-in for the scenic 6–8 mile float to Boiling Spring — one of the best day trips in Missouri. Up here the river is more like a swift creek with occasional Class II riffles, sheer bluffs rising overhead topped with pine trees. Dense foliage overhangs the channel providing great shade.',
    ARRAY['parking']::text[],
    'Roadside pull-off parking near the ford. Limited — approximately 8–10 vehicles.', 'Take Sand Shoals Road from either Hwy E (east) or Hwy AA (west). The road crosses the Big Piney at a low-water ford. Gravel road; passable by passenger vehicles in dry conditions.', 'No facilities. Low-water ford — may be impassable during high water.',
    false, 'No fee.',
    ARRAY['gravel_maintained']::text[], '10', NULL,
    NULL, 34.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Boiling Spring Access — medium (https://mdc.mo.gov/discover-nature/places/boiling-spring-access)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 454 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Boiling Spring Access', 'boiling-spring',
    ST_SetSRID(ST_MakePoint(-91.97, 37.435), 4326),
    'access', ARRAY['access', 'boat_ramp']::text[],
    true, 'MDC',
    'MDC access at mile 25.8 with concrete boat ramp and picnic area. Famous for Boiling Spring — a massive spring at river level pumping roughly 10 million gallons per day at a constant 50 degrees F. Classic swimming hole and rope swing at the spring pool. Common take-out for the popular Sandy Shoals to Boiling Spring day float. Also serves as a put-in for floats downstream toward Mason Bridge and Slabtown. The Resort at Boiling Springs (private campground/RV park with cabins, canoe rentals, and shuttle) is adjacent.',
    ARRAY['parking', 'picnic', 'boat_ramp']::text[],
    'Gravel/paved parking area with space for vehicles and trailers.', 'From Licking, take Highway 32 west, then Route BB west approximately 7 miles to the Big Piney River. Address: 15268 Hwy 32, Licking, MO 65542. Open 4 AM – 10 PM; fishing/boating 24 hrs.', 'MDC maintained concrete boat ramp. Picnic area. No restrooms at the MDC access. No drinking water.',
    false, 'No fee at MDC access. The Resort at Boiling Springs (adjacent private campground) charges for camping and canoe rentals.',
    ARRAY['paved', 'gravel_maintained']::text[], '15', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/boiling-spring-access', 42.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Mason Bridge Access — high (https://mdc.mo.gov/discover-nature/places/mason-bridge-access)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 61 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mason Bridge Access', 'mason-bridge',
    ST_SetSRID(ST_MakePoint(-91.9832, 37.5054), 4326),
    'access', ARRAY['access', 'boat_ramp', 'bridge']::text[],
    true, 'MDC',
    'MDC access at mile 31.8. 7-acre area with concrete boat ramp providing public access to the Big Piney River for canoeing and fishing. Located on Mason Bridge Road. Good bass and sunfish fishing. The river is getting wider and deeper through this section. About 8 miles downstream from Boiling Spring and 8 miles upstream from Slabtown.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Gravel parking area with space for approximately 10 vehicles and trailers.', 'From Licking, take Highway 32 west 6 miles, then Mason Road north to the Big Piney River.', 'MDC maintained concrete boat ramp. No restrooms. No drinking water.',
    false, 'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/mason-bridge-access', 50.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Warren Bridge — medium (https://www.floatmissouri.com/plan/missouri-rivers/big-piney-river/)
-- note: Low-water FF-H crossing at river mile 33.3, ~1.5 river-mi downstream (N) of Mason Bridge Access (OSM 37.50581,-91.98319). Snapped stored point onto the Big Piney channel (OSM river geometry) ~968 m W, exactly matching the ~980 m offset; the low-water slab road is not distinctly mapped in OSM so exact crossing is +/- a few hundred m.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Warren Bridge', 'warren-bridge',
    ST_SetSRID(ST_MakePoint(-92.0006, 37.5221), 4326),
    'access', ARRAY['access', 'bridge']::text[],
    true, 'county',
    'Low-water bridge crossing at mile 33.3. Road connects Hwys FF and H. Excellent swimming hole below the bridge. Informal access — usable as a put-in or take-out but no developed facilities. About 1.5 miles downstream from Mason Bridge.',
    ARRAY['parking']::text[],
    'Roadside pull-off parking. Limited — approximately 5 vehicles.', 'The road connecting Hwy FF and Hwy H crosses the Big Piney at a low-water bridge. Gravel road.', 'No facilities. Low-water crossing — may be impassable in high water.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], '5', NULL,
    NULL, 53.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Slabtown Recreation Area — high (https://www.fs.usda.gov/r09/marktwain/recreation/slabtown-recreation-area)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 92 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Slabtown Recreation Area', 'slabtown',
    ST_SetSRID(ST_MakePoint(-92.0321, 37.5615), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'USFS',
    'First Forest Service access on the Big Piney at mile 39.8. Small, quiet USFS campground and river access with 5 primitive tent-only campsites. Start of the Smallmouth Bass Special Management Area (1 smallmouth, 15-inch minimum, downstream to Gasconade confluence). Popular put-in for the 6-mile float to Horse Camp or 10-mile float to Ross Bridge. 1-mile Slabtown Bluff Trail winds through hardwoods with river overlooks (best fall–spring). Downriver from here the river is narrower and shallower with multiple riffles.',
    ARRAY['parking', 'camping', 'picnic']::text[],
    'Boat launch parking for 3 vehicles with trailers. Picnic/camping area fits 8 vehicles. Total capacity approximately 11 vehicles.', 'From Roby, MO, take Highway 17 north 1.5 miles to County Road 800, turn right and travel 7 miles on gravel road. When you pass the Big Piney Bridge, the road turns to asphalt. Slabtown is on the right just past the bridge. Last stretch is gravel.', '5 primitive tent camping sites with picnic tables and fire rings. Vault toilet (accessible). No drinking water. No boat ramp — carry-in access. 1-mile Slabtown Bluff Trail. First-come, first-served. Tent camping only.',
    false, 'No fee at any Forest Service managed sites along the Big Piney.',
    ARRAY['paved', 'gravel_unmaintained']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/slabtown-recreation-area', 59.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Horse Camp Access — high (https://www.fs.usda.gov/r09/marktwain/recreation/big-piney-equestrian-camp)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 179 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Horse Camp Access', 'horse-camp',
    ST_SetSRID(ST_MakePoint(-92.0425, 37.6435), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'USFS',
    'USFS river access approximately 6 miles downstream from Slabtown. Located near the Big Piney Equestrian Camp — one of 3 trailheads for the 18-mile Big Piney Trail through Paddy Creek Wilderness. The equestrian camp has 5 sites designed for horse trailers with picnic tables, fire rings, and highline posts. Road dead-ends at the river access past the horse camp. Common take-out for the 6-mile float from Slabtown.',
    ARRAY['parking', 'camping']::text[],
    'Parking area at the trailhead/equestrian camp with space for horse trailers. Approximately 8–10 vehicle/trailer spots.', 'From Licking, take Hwy 32 west 4 miles to Hwy N, turn right on Hwy N and go 2 miles to Hwy AF, turn left onto Hwy AF and travel 5 miles to Slabtown Road, continue straight past the asphalt for 1.5 miles. Road dead-ends at the river.', 'Equestrian camp with 5 campsites (picnic tables, fire rings, highline posts). Trail register station. No drinking water. No vault toilet at river access. Big Piney Trail trailhead.',
    false, 'No fee.',
    ARRAY['gravel_maintained', 'gravel_unmaintained']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/big-piney-equestrian-camp', 68.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Ross Access — high (https://www.openstreetmap.org/way/545664739)
-- note: OSM feature literally named 'Ross Bridge' is at 37.6635,-92.0520; MDC Ross Access gravel-bar launch sits just below (downstream/N) it on the Big Piney, co-located with USGS gauge 06930000 'Big Piney River near Big Piney' at 37.66564,-92.04992. Reached via Windsor Ln N of Duke. Stored coord was ~15 km E on broken geometry.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Ross Access', 'ross-bridge',
    ST_SetSRID(ST_MakePoint(-92.0499, 37.6656), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    'MDC access at approximately mile 54.8. Mostly forested gravel bar area providing access for floating and fishing. LAST TAKE-OUT before the river enters Fort Leonard Wood military reservation — no public access is permitted through the base. The 15-mile stretch from Slabtown to Ross is the core of the Smallmouth Bass Special Management Area (1 smallmouth, 15-inch minimum). After Ross, the river begins to get wider and deeper. From here the river enters Fort Leonard Wood for approximately 12 miles with no access.',
    ARRAY['parking']::text[],
    'Gravel parking area.', 'From Duke, take Route K west to Western Road, then Windsor Lane north 0.50 mile.', 'Parking area. No restrooms. No drinking water. No boat ramp — gravel bar access. Open 4 AM – 10 PM; fishing/hunting/boating allowed 24 hrs.',
    false, 'No fee.',
    ARRAY['gravel_maintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/ross-access', 75.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Wilderness Ridge Resort — medium (https://www.wildernessridgeresort.com/)
-- note: Active private canoe/camp resort, 33850 Windsor Ln, Duke MO 65461 (573-435-6767), on the Big Piney bluff. Placed on the Windsor Ln riverfront immediately adjacent to Peck's, at the Ross Bridge/Windsor Ln access cluster; exact riverfront point interpolated (not in OSM). KEEP.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Wilderness Ridge Resort', 'wilderness-ridge-resort',
    ST_SetSRID(ST_MakePoint(-92.0489, 37.6712), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    false, 'private',
    'Private resort and campground on the Big Piney River near Duke, MO. Offers canoe/raft/tube rentals, cabins, lodge, RV hookups, tent camping, and shuttle service. The campground sits on a bluff overlooking the Big Piney River. Relatively calm section of river, suitable for children and families. Close to Mark Twain National Forest and Paddy Creek Wilderness.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp', 'store']::text[],
    'Large resort parking lot. Ample space for vehicles and trailers.', 'From the north, take Hwy 63 south 23 miles to Hwy K, turn left on Hwy K and go through Duke. Address: 33850 Windsor Ln, Duke, MO 65461. Approximately 80 miles from Springfield, 100 miles from St. Louis.', 'Lodge, cabins (A/C, linens, dishes, fridge, stove), RV sites with electric and water hookups, tent camping with fire rings and picnic tables. General amenities on a bluff overlooking the river.',
    true, 'Canoe/raft/tube rental fees. Camping fees vary by site type. Launch fee for non-guests.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://www.wildernessridgeresort.com/', 75.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Peck's Last Resort — high (https://www.openstreetmap.org/node/12924723413)
-- note: OSM node named 'Peck's Last Resort' at 37.67047,-92.04832, on the Big Piney at the Windsor Ln river crossing; address 33401 Windsor Ln, Duke MO 65461 (573-435-6669). Verified riverfront outfitter/campground. KEEP. Stored coord was ~13 km E.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Peck''s Last Resort', 'pecks-last-resort',
    ST_SetSRID(ST_MakePoint(-92.0483, 37.6705), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    false, 'private',
    'Family-owned private campground and canoe outfitter on the Big Piney River near Duke, MO. Formerly known as Rich''s Last Resort. Offers camping, cabins, canoe/kayak/raft rentals, and shuttle service. Beautiful Missouri Ozark landscape. Note: cell service drops out about 20 minutes before arriving.',
    ARRAY['parking', 'camping', 'picnic', 'boat_ramp']::text[],
    'Resort parking area.', 'Address: 33401 Windsor Ln, Duke, MO 65461. Write down directions as cell service is lost before arrival. About 2.5 hours from Columbia, MO.', 'Camping, cabins, canoe/kayak/raft rentals, fishing access.',
    true, 'Camping and rental fees apply. Contact for current rates.',
    ARRAY['gravel_maintained']::text[], '15', 'Private',
    'https://www.peckslastresort.com/', 75.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- East Gate Access — high (https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21814)
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 40 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'East Gate Access', 'east-gate',
    ST_SetSRID(ST_MakePoint(-92.0583, 37.7603), 4326),
    'access', ARRAY['access', 'boat_ramp']::text[],
    true, 'USFS',
    'USFS river access at approximately mile 66.8 near Fort Leonard Wood''s East Gate entrance. Only developed Forest Service access in Pulaski County. Primary put-in/take-out for private recreationists and Fort Leonard Wood military personnel. The 12-mile stretch upstream from Ross Bridge passes entirely through Fort Leonard Wood — this is the first public access below the base. USGS gauge station nearby (06930000). East Gate Fort Wood Campground is on the left bank at the bridge (mile 66.5). Short 3-mile float downstream to Crossroads Access, or 11-mile float to Bookers Bend.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Small gravel parking area. Space for approximately 5–8 vehicles with trailers.', 'Make a slight right onto East Gate Road and drive 1 mile. Access site is on the right, before the bridge. Located approximately 15 miles southeast of Waynesville.', 'Single-lane gravel boat launch. No restrooms. No drinking water.',
    false, 'No fee at any Forest Service managed sites along the Big Piney.',
    ARRAY['gravel_maintained']::text[], '10', 'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21814', 87.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Crossroads Access — official (https://www.fs.usda.gov/r09/marktwain/recreation/crossroads-access)
-- note: Real USFS carry-in access. USFS page embeds 37.766662,-92.017622; corroborated by OSM Hwy M bridge over Big Piney at 37.764,-92.0202 and the 'junction of J & M highways' directions. The river genuinely meanders E to ~-92.017 here, so the point is ~5 km NE of the stored coord (the task's '1.7 km off' was an underestimate). KEEP.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Crossroads Access', 'crossroads',
    ST_SetSRID(ST_MakePoint(-92.0176, 37.7667), 4326),
    'access', ARRAY['access']::text[],
    true, 'USFS',
    'USFS carry-in access at approximately mile 69.8. Provides parking and a 100-foot trail to the Big Piney River for canoeing and fishing — you must carry canoes/kayaks down the trail. Day use only — no overnight camping. 3-mile paddle downstream from East Gate, or 8 miles upstream from Bookers Bend. River has varying runs and riffles with mostly gravel bottom.',
    ARRAY['parking']::text[],
    'Gravel parking area for day use.', 'Take exit 169 for Hwy J, follow Hwy J to the left/south for 10 miles. At the junction of J Highway and M Highway, go past about 300 feet. Crossroads Access is on the right.', 'Carry-in access only — 100-foot trail to the river. No restrooms. No drinking water. Day use only — no overnight camping.',
    false, 'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[], '5', 'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/crossroads-access', 90.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Bookers Bend Access — official (https://www.fs.usda.gov/r09/marktwain/recreation/bookers-bend)
-- note: USFS Bookers Bend Access page embeds 37.80746153,-92.0702596, on the Big Piney (river confirmed at -92.068..-92.072 at this latitude). ~2.4 km NE of stored coord, matching the stated offset. Last Forest Service access before the Gasconade confluence. KEEP.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Bookers Bend Access', 'bookers-bend',
    ST_SetSRID(ST_MakePoint(-92.0703, 37.8075), 4326),
    'access', ARRAY['access', 'boat_ramp']::text[],
    true, 'USFS',
    'USFS river access at approximately mile 77.8 — the last Forest Service access on the Big Piney before the Gasconade confluence. Thomas Lane dead-ends at Bookers Bend. Single-lane gravel boat launch. The river here is deeper, slower moving, and wider than upstream sections. Smallmouth bass special management area. 8 miles downstream from Crossroads, 11 miles from East Gate. From here, 8 more miles to the Gasconade River confluence. Most land along this stretch is private — stay aware of property boundaries if stopping.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Small gravel parking area. Limited — approximately 5 vehicles.', 'Approximately 4 miles west of Hwy J on Forest Service Road 1730. Thomas Lane dead-ends at the access.', 'Single-lane gravel boat launch. No restrooms. No drinking water.',
    false, 'No fee.',
    ARRAY['gravel_unmaintained']::text[], '5', 'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recreation/recarea/?recid=84142', 99.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Gasconade River Confluence — medium (seed (curated))
-- note: Seed-curated coordinate (MDC/USFS-cited); snaps 121 m to corrected NHD channel.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Gasconade River Confluence', 'gasconade-confluence',
    ST_SetSRID(ST_MakePoint(-92.071, 37.836), 4326),
    'access', ARRAY['access']::text[],
    false, 'private',
    'Junction of the Big Piney River with the Gasconade River at mile 85.7 near Jerome, MO. Private access on right bank with lodging, refreshments, and parking available. End of the Big Piney River. From here, floaters continue downstream on the Gasconade River where additional public access points exist. BSC Outdoors take-out is on the Gasconade near here.',
    ARRAY['parking']::text[],
    'Private parking available.', 'Near Jerome, MO, off I-44. Private access — contact outfitters for arrangements.', 'Private access point. Lodging, refreshments available through private operators.',
    true, 'Private access fees apply.',
    ARRAY['paved']::text[], '10', NULL,
    NULL, 102.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Devil's Elbow (Highway V Bridge) — high (https://visitpulaskicounty.org/communities/devils-elbow)
-- note: Access at the famous Devils Elbow on the Big Piney, at the historic Route 66 truss bridge / Elbow Inn (OSM Elbow Inn 37.84937,-92.06304). No formal public boat ramp verified; outfitters BSC Outdoors and Devils Elbow River Safari put in 'in the shadow of the steel bridge' here. De-facto river access placed at the bridge. KEEP (as landmark access). Stored coord was ~2-3 km SW.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Devil''s Elbow (Highway V Bridge)', 'devils-elbow',
    ST_SetSRID(ST_MakePoint(-92.0625, 37.8484), 4326),
    'bridge', ARRAY['bridge']::text[],
    false, 'private',
    'Historic Highway V bridge crossing at Devil''s Elbow, mile 82.4. NO PUBLIC ACCESS at the bridge itself. This is on the famous Route 66 corridor. The old steel truss bridge is a popular Route 66 landmark. BSC Outdoors operates a private put-in called Piney Landing nearby for their 5-mile float trip to the Gasconade confluence. Shanghai Spring (Blue Spring) is 2.4 miles upstream at mile 80.0 — a massive spring comparable to Boiling Spring.',
    NULL,
    'No public parking at bridge.', 'Hwy V at Devil''s Elbow, Pulaski County. The village of Devil''s Elbow is a historic Route 66 community.', 'No public facilities. Historic Route 66 bridge. Private access only through BSC Outdoors.',
    false, 'Private access only through outfitters.',
    ARRAY['paved']::text[], 'limited', NULL,
    NULL, 104.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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

-- Old Route 66 Bridge — high (https://www.openstreetmap.org/way/719302783)
-- note: OSM way 719302783 'Devils Elbow Bridge' at 37.8483342,-92.0622935 = the historic 1923 curved steel truss on the original Route 66 alignment (Teardrop Road) over the Big Piney at Devils Elbow. Exact structure coordinate from OSM. KEEP.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Old Route 66 Bridge', 'old-route-66-bridge',
    ST_SetSRID(ST_MakePoint(-92.0623, 37.8483), 4326),
    'bridge', ARRAY['bridge']::text[],
    false, 'private',
    'Old Route 66 bridges at mile 82.9. Private access on left bank below bridge. No public access. The Big Piney River is nearing its confluence with the Gasconade River (3 miles downstream). I-44 bridges are at mile 83.2 with no access.',
    NULL,
    'No public parking.', 'Historic Route 66 near Devil''s Elbow, Pulaski County.', 'No public facilities. Private access only.',
    false, 'Private access only.',
    ARRAY['paved']::text[], 'limited', NULL,
    NULL, 104.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'big-piney'
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
-- retire tone-hogan-ford-on-county-road: Vague scraped ford entry; no citable public access, junk auto-placed coordinate.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'tone-hogan-ford-on-county-road'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'tone-hogan-ford-on-county-road';

-- retire dog-8217-s-bluff-access-on-left: Scraped duplicate of Dogs Bluff Access (curated slug dogs-bluff); mangled name (HTML entity), junk coordinate.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'dog-8217-s-bluff-access-on-left'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'dog-8217-s-bluff-access-on-left';

-- retire houston: The town of Houston, MO is not a river access point; scraped landmark.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'houston'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'houston';

-- retire mineral-springs-ford: Scraped duplicate of Mineral Springs Access (curated slug mineral-springs).
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'mineral-springs-ford'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'mineral-springs-ford';

-- retire hazelton-spring: Scraped float-chart spring landmark, not a developed public access; junk coordinate.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'hazelton-spring'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'hazelton-spring';

-- retire forest-service-slabtown: Scraped duplicate of Slabtown Recreation Area (curated slug slabtown).
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'forest-service-slabtown'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'forest-service-slabtown';

-- retire horse-camp-on-left: Scraped duplicate of Horse Camp Access (curated slug horse-camp).
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'horse-camp-on-left'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'horse-camp-on-left';

-- retire six-crossings: Scraped float-chart landmark (Big Piney Trail crossings), not a boat access; junk coordinate.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'six-crossings'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'six-crossings';

-- retire national-forest: Vague scraped entry ("National Forest"), not a specific access; junk coordinate.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'national-forest'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'national-forest';

-- retire 1-44-bridges: Scraped landmark (I-44 bridges near the mouth), not a public access; the real take-outs there are Devils Elbow / Old Route 66 Bridge.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = '1-44-bridges'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = '1-44-bridges';

-- retire junction-with-gasconade-river: Scraped landmark (Big Piney/Gasconade confluence), not a developed access; represented by gasconade-confluence.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'junction-with-gasconade-river'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'junction-with-gasconade-river';

-- retire hwy-66-bridge: Scraped duplicate of Old Route 66 Bridge (curated slug old-route-66-bridge).
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'hwy-66-bridge'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'hwy-66-bridge';

-- retire hwy: Junk scraped entry (truncated "Hwy"); no coordinate meaning.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'hwy'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'hwy';

-- retire paddy-creek: Retire: RETIRE as a Big Piney access. USFS Paddy Creek Recreation Area (page embeds 37.553462,-92.04029) is a 23-site CAMPGROUND on Paddy Creek, a tributary ~0.5 mi from the Big Piney (confirmed by USFS + TheDyrt); it is a Big Piney Trail trailhead / wading creek, NOT a developed Big Piney boat launch. Any river access at the mouth (mile ~38.8, informal gravel-bar ford near 37.5536,-92.0537) is undeveloped/unnamed. Recommend retire.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'paddy-creek'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'big-piney' AND ap.slug = 'paddy-creek';

-- ---- Recompute river miles from the corrected geometry ----
-- Big Piney uses a geometry-datum mile (mile 0 = NHD headwaters), unlike the
-- chart-datum rivers. The upsert wrote offline-computed miles; this overwrites
-- them with the exact in-DB ST_LineLocatePoint value so ordering matches
-- validate_river_data()'s geometry check. Runs after the snap trigger has
-- refreshed location_snap. Only rows that snapped (<=1500 m) get a mile.
UPDATE access_points ap SET
    river_mile_downstream = ROUND((ST_LineLocatePoint(r.geom, ap.location_snap) * r.length_miles)::numeric, 1),
    river_mile_upstream   = ROUND((r.length_miles * (1 - ST_LineLocatePoint(r.geom, ap.location_snap)))::numeric, 1)
FROM rivers r
WHERE r.id = ap.river_id AND r.slug = 'big-piney' AND ap.location_snap IS NOT NULL;

-- ---- Purge cached drive times for this river ----
DELETE FROM drive_time_cache
WHERE start_access_id IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'big-piney')
   OR end_access_id   IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'big-piney');
