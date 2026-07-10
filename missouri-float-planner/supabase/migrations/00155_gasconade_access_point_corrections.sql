-- Buzzard Bluff Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point); corroborated by OSM slipway 'Buzzard Bluff Fishing Access' 37.33201,-92.394948)
-- note: MDC place page says no camping, but the MDC GIS camping layer shows one primitive camping point near the picnic area - left camping out of amenities; human may verify. Pin moved ~90 m from area coordinate to the GIS ramp point.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Buzzard Bluff Access', 'buzzard-bluff',
    ST_SetSRID(ST_MakePoint(-92.394931, 37.331897), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'MDC access on the upper Gasconade with a concrete boat ramp and primitive picnic area, the uppermost commonly used put-in on the river (the reach above Hwy E is thin at normal flows). About 7.2 river miles above Wilbur Allen.',
    ARRAY['parking', 'boat_ramp', 'picnic']::text[],
    'Three paved parking areas (MDC GIS); no trailer-designated stalls listed.', 'From Hartville, take Highway 38 east 6.5 miles, then Route E north 2.25 miles to the access.', 'Concrete boat ramp and primitive picnic area on an 89-acre MDC access. No camping, no drinking water.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/buzzard-bluff-access', 14.3, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Wilbur Allen Memorial Conservation Area — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point - replaces area centerpoint))
-- note: Pin corrected from the conservation-area centerpoint (106 m off river) to the MDC GIS ramp point at the river.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Wilbur Allen Memorial Conservation Area', 'wilbur-allen',
    ST_SetSRID(ST_MakePoint(-92.399156, 37.396196), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC conservation area on the upper Gasconade with a gravel launch, privy and primitive camping. Common take-out for the 7.2-mile float from Buzzard Bluff.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic']::text[],
    'Two gravel parking areas (MDC GIS), one at the ramp/camping area.', 'From Manes, take Highway 95 north 1 mile, then Radford Drive west 1.5 miles.', 'Gravel boat ramp, privy, primitive individual campsites (14-day limit), picnic area on a 380-acre conservation area with about a mile of Gasconade frontage.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/wilbur-allen-memorial-conservation-area', 21.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Camp Branch Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point))
-- note: Headwaters access - most seasons this reach is too thin to float; keep but expect low use.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Camp Branch Access', 'camp-branch-access',
    ST_SetSRID(ST_MakePoint(-92.465939, 37.263392), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'MDC',
    'Uppermost MDC access on the Gasconade/Woods Fork headwaters east of Hartville, with a gravel canoe launch and designated camping. This far up the river is only floatable at higher flows; the chart places it at mile 2.5, well above the usual Buzzard Bluff put-in.',
    ARRAY['parking', 'camping', 'picnic']::text[],
    'Paved parking area (MDC GIS).', 'From Hartville, take Highway 38 east 2.5 miles.', 'Gravel canoe launch, picnic area, designated primitive camping sites on a 27.5-acre MDC access.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/camp-branch-access', 2.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Odin Access — medium (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/26 (MDC parking-lot GIS point; no boat ramp exists))
-- note: guide_mile null: upstream of the chart datum zero on Woods Fork. Coordinate is the MDC parking lot (medium - MDC GIS official but distance to the creek unverified). Human may choose to exclude from a float planner.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Odin Access', 'odin-access',
    ST_SetSRID(ST_MakePoint(-92.605636, 37.27028), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '124-acre MDC bank-fishing and walk-in access on the Woods Fork of the Gasconade west of Hartville. It lies upstream of the float chart''s mile-0 datum (the Hwy 38 bridge east of Hartville) and the stream here is a wadeable headwater creek, not a float reach.',
    ARRAY['parking']::text[],
    'Single paved parking area off Highway 38.', 'From Hartville, take Highway 38 west 6 miles to Odin; parking area on the south side of the highway.', 'Parking only; walk-in bank access. No ramp, no privy, no camping.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/odin-access', NULL, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Anna M. Adams Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Anna M. Adams Access', 'anna-m-adams-access',
    ST_SetSRID(ST_MakePoint(-92.328623, 37.628801), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'MDC access at the Dawn Road bridge (the chart''s ''Anna Adams Access, slab ford'' at mile 51.6) in Laclede County. Breaks up the long, lightly accessed reach between Wilbur Allen and the Gasconade Hills/Hazelgreen area.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Parking lot adjacent to the Dawn Road bridge.', 'From Lebanon, take Highway 32 east 18 miles, then Route K north 3 miles, and Dawn Road east 3 miles to the river.', 'Concrete boat ramp and parking lot adjacent to the Dawn Road bridge; small bank-fishing stretch. Donated to MDC in 1994.',
    false, NULL,
    NULL, 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/anna-m-adams-access', 51.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Barlow Ford — medium (OpenStreetMap slipway node 'Barlow Ford Access' 37.720215,-92.36171 (adjacent node 'Froggy's River Resort Landing' 37.720599,-92.36137))
-- note: Name resolved: the moherp trip report called this 'Blacks Ford', but the 6.0-mile distance above Gasconade Hills Resort matches OSM's 'Barlow Ford Access' at this exact pin; the outfitters' actual 'Black Ford' is a separate put-in ~10 miles above the resort (~chart mile 61.4) with no verifiable coordinate, so it was not added. Public legal status of the ford is unverified (kept is_public=false); needs human review.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Barlow Ford', 'blacks-ford',
    ST_SetSRID(ST_MakePoint(-92.36171, 37.720215), 4326),
    'access', ARRAY['access']::text[],
    false, NULL,
    'Unimproved low-water ford (chart mile 65.2) used as the 6-mile shuttle put-in for floats down to Gasconade Hills Resort and Froggy''s River Resort. No developed facilities.',
    NULL,
    NULL, 'Reached by outfitter shuttle from Gasconade Hills Resort or Froggy''s River Resort; an unimproved low-water ford off the Route AB area roads.', 'Unimproved gravel ford / gravel-bar launch; no facilities. Froggy''s River Resort''s landing is immediately adjacent.',
    false, NULL,
    NULL, 'unknown', NULL,
    NULL, 65.2, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Gasconade Hills Resort — high (OpenStreetMap slipway 'Gasconade Hills Resort' 37.750182,-92.397583 (river landing, ~120 m from the prior resort-buildings geocode))
-- note: Pin moved from the resort buildings to the OSM-mapped river landing.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Gasconade Hills Resort', 'gasconade-hills-resort',
    ST_SetSRID(ST_MakePoint(-92.397583, 37.750182), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    false, 'private',
    'Private family resort and float outfitter near the Route K/AB bridge (chart mile 71.1), about 4 river miles above the MDC Hazelgreen Access. Put-in/take-out for resort customers.',
    ARRAY['parking', 'camping', 'restrooms', 'store']::text[],
    'On-site resort parking for guests.', '28425 Spring Road, off historic Route 66 near Richland (I-44 exit 150 area).', 'Private resort: cabins, RV and tent sites, camp store, pool, showers, canoe/kayak/raft/tube rental, river landing.',
    true, 'Customer/fee landing - private resort and outfitter.',
    NULL, 'unknown', 'Private',
    'https://gasconadehills.com/', 71.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Hazelgreen Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; matches USGS gauge 06928000 site and OSM 'Hazelgreen Access Canoe Ramp'))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hazelgreen Access', 'hazelgreen-access',
    ST_SetSRID(ST_MakePoint(-92.452556, 37.759286), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'MDC access at the old Route 66/I-44 crossing, less than a mile below the Osage Fork mouth. The reference access for the upper-river Hazelgreen gauge.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved parking area at the ramp.', 'From I-44 exit 140 (Route N), take the south outer road east about 2 miles; the old Route 66 bridge itself is closed.', 'Concrete boat ramp suitable for small boats and canoes. No privy, no camping. USGS Hazelgreen gauge (06928000) is at this site.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/hazelgreen-access', 75.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Mitschele Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM slipway 'MO 7' at same spot))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mitschele Access', 'mitschele-access',
    ST_SetSRID(ST_MakePoint(-92.340908, 37.800837), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'Small MDC ramp at the Highway 7 bridge (chart mile 92.5), the main public access between Hazelgreen and Schlicht Springs. Note the retired ''Cave Lodge'' DB point had mistakenly been pinned at this exact spot.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved parking area (MDC GIS).', 'From Richland, take Highway 7 south about 5 miles; or from the Highway 7 exit on I-44, take Highway 7 north 3 miles.', 'Boat ramp and parking on a 1-acre MDC access at the Highway 7 bridge. No camping, no privy.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/mitschele-access', 92.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Schlicht Springs Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point))
-- note: Pulaski County per MDC GIS centroid layer (the place-page fetch mis-reported Gasconade County). Ruby's Landing 5-mile customer floats effectively run Schlicht Springs area to the resort.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Schlicht Springs Access', 'schlicht-springs-access',
    ST_SetSRID(ST_MakePoint(-92.284785, 37.903369), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC access at Schlicht Spring on the Moccasin Bend/Narrows reach (chart mile 106.1), just below the old grist mill spring branch. Sits inside the documented losing reach - in low water the river can nearly disappear just upstream, so check flows before putting in here.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic']::text[],
    'Two paved parking areas, one ADA (MDC GIS).', 'From Crocker, take Highway 133 south/west about 5 miles, then Resort Road south 1.25 miles, then Riverside Road east 1 mile to the access.', 'Boat ramp, ADA privy, primitive individual campsites, picnic area on 12.8 acres at Schlicht Spring.',
    false, NULL,
    NULL, 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/schlicht-springs-access', 106.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Ruby's Landing — medium (OpenStreetMap customer boat-ramp node 37.868533,-92.261069 at the river end of Ruby's Landing Drive (resort at 22474 Restful Lane))
-- note: Pin moved from the resort office (594 m off river) to the OSM-mapped customer ramp on the river; three customer ramps are mapped within 800 m (37.8685/-92.2611, 37.8716/-92.2621, 37.8644/-92.2583) and the one nearest the end of Ruby's Landing Drive was chosen. guide_mile 110.5 computed as 4.43 river miles below Schlicht Springs (106.1) along OSM river geometry.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Ruby''s Landing', 'rubys-landing',
    ST_SetSRID(ST_MakePoint(-92.261069, 37.868533), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    false, 'private',
    'Private resort and float outfitter on the east side of the Narrows reach, offering 5- and 10-mile customer floats ending at the resort. Verified as a real, active landing (customer-only).',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'On-site resort parking for guests.', '22474 Restful Lane off Highway 17, between Waynesville and Crocker (about 5.6 miles north of Waynesville), then Ruby''s Landing Drive (gravel) to the river.', 'Private 115-acre resort: 11 cabins, 99 RV sites, primitive tent sites, canoe/kayak/raft/tube rental; customer river landing.',
    true, 'Customer-only landing - private resort and outfitter (est. 2017).',
    ARRAY['gravel_maintained']::text[], 'unknown', 'Private',
    'https://rubyslanding.com/', 110.5, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Riddle Bridge Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM slipway 'Riddle Bridge Access' at same spot))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Riddle Bridge Access', 'riddle-bridge-access',
    ST_SetSRID(ST_MakePoint(-92.132669, 37.909545), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'MDC concrete-ramp access at the Route Y bridge north of St. Robert (chart mile 129.9). BSC Outdoors uses it as the put-in for its 14-mile float down to Boiling Spring, corroborating the mileage.',
    ARRAY['parking', 'restrooms', 'boat_ramp']::text[],
    'Paved parking area (MDC GIS).', 'From St. Robert at Interstate 44, take Route Y north 6 miles.', 'Concrete boat ramp, privy, parking on 9 acres. No camping.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/riddle-bridge-access', 129.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- MO 28 Bridge (Veterans Bridge) — high (OpenStreetMap slipway 'Veterans Bridge' 37.892603,-92.08128 at the Route 28 crossing (matches prior road-river intersection))
-- note: Kept is_public=false: Hawksley chart says the usable access here is private (adjacent cabins); outfitters shuttle customers to it. Needs human review if MoDOT right-of-way access is acceptable.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'MO 28 Bridge (Veterans Bridge)', 'mo-28-bridge',
    ST_SetSRID(ST_MakePoint(-92.08128, 37.892603), 4326),
    'bridge', ARRAY['bridge', 'access']::text[],
    false, NULL,
    'Route 28 ''Veterans Bridge'' crossing (chart mile 140.4), used as a put-in 3.3 miles above Boiling Spring Campground - BSC Outdoors starts its 3-mile tube floats here. An OSM slipway is mapped at the bridge.',
    NULL,
    'No developed parking; roadside only.', 'Missouri Route 28 (Veterans Bridge) over the Gasconade southwest of Dixon.', 'No facilities. Informal launch at the bridge; the float guide notes the usable bank access belongs to private cabins.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 140.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Boiling Spring Campground (BSC Outdoors) — high (OpenStreetMap slipway 'Boiling Spring' 37.88816,-92.036828; campground at 18700 Cliff Road, Dixon; position matches chart mile 143.7 spring and BSC's own float distances (Veterans Bridge 3 mi, Riddle Bridge 14 mi upstream))
-- note: The task hint 'MDC Boiling Spring Access (Pulaski Co)' resolved to this PRIVATE campground - MDC's only Boiling Spring Access is on the Big Piney in Texas County (different river).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Boiling Spring Campground (BSC Outdoors)', 'boiling-spring-campground',
    ST_SetSRID(ST_MakePoint(-92.036828, 37.88816), 4326),
    'campground', ARRAY['campground', 'boat_ramp', 'access']::text[],
    false, 'private',
    'Private campground and float outfitter at Boiling Spring (a ~42 million gal/day spring, chart mile 143.7), two miles below the Big Piney mouth. Hub for Big Piney and Gasconade floats ending at the campground; float-trip significant despite being customer-only.',
    ARRAY['parking', 'camping', 'restrooms', 'store', 'boat_ramp']::text[],
    'On-site campground parking for guests.', '18700 Cliff Road, Dixon (from Dixon take Route C/Boiling Springs Road south to Cliff Road).', 'Private campground and outfitter: tent/RV sites, cabins, camp store, showers/laundry, lighted boat ramp, canoe/kayak/raft/tube/jon-boat rental.',
    true, 'Customer landing - private campground and float outfitter.',
    NULL, 'unknown', 'Private',
    'https://www.bscoutdoors.com/', 143.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Jerome Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM slipway 'Jerome Access', operator MDC, at same spot))
-- note: Pin corrected ~1.1 km: previously at the USGS gauge/Route D bridge; the actual MDC ramp is at the Little Piney mouth. guide_mile corrected 151.2 -> 150.0 within the chart datum (the chart's 'Jerome Access 151.2' appears to describe an older site below the bridge; the modern ramp sits at the mouth the DB datum already carried as 150.0). +/-1 mile uncertainty.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Jerome Access', 'jerome-access',
    ST_SetSRID(ST_MakePoint(-91.975089, 37.919903), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'The main mid-river MDC access at Jerome, at the mouth of Little Piney Creek just upstream of the Route D bridge and I-44. The USGS Jerome gauge (06933500), the most-cited Gasconade float gauge, is at the bridge just downstream.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Gravel lot; the only Gasconade MDC lot flagged as allowing trailers in MDC GIS.', 'In Jerome, from Route D/Main Street take Prewett Road north 0.1 mile.', 'Concrete boat ramp and gravel parking on 12.2 acres at the Little Piney Creek mouth, with bank access to both streams. Camping prohibited.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/jerome-access', 150.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Whitehouse Ford — low (OpenStreetMap 'Table Rock' locality at the Old Whitehouse Ferry site (unchanged); nearest public-ish road is County Road 9020 through a river-cabin community)
-- note: Kept but flagged: no official source; surrounding road network is a private-leaning cabin subdivision, so legal public access is unverified. Candidate for retirement if human review finds no public route.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Whitehouse Ford', 'whitehouse-ford',
    ST_SetSRID(ST_MakePoint(-91.99655, 37.96365), 4326),
    'access', ARRAY['access']::text[],
    false, NULL,
    'Informal gravel-bar take-out about 3 miles below Jerome at Table Rock, the mushroom-shaped rock marking the Old Whitehouse Ferry site (chart mile 154.2). Used in paddler trip reports as a short-float take-out.',
    NULL,
    NULL, 'Via County Road 9020 through the cabin community north of Jerome; several approach lanes are mapped private in OSM.', 'No facilities - gravel-bar ford at Table Rock, the Old Whitehouse Ferry site.',
    false, NULL,
    ARRAY['gravel_unmaintained']::text[], 'unknown', NULL,
    NULL, 154.2, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Bell Chute Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM slipway at same spot))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Bell Chute Access', 'bell-chute-access',
    ST_SetSRID(ST_MakePoint(-91.888554, 38.075153), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC ramp-and-camping access off Route Y (chart mile 167.2, ''Bell Chute Access off Hwy Y''), the first developed public access below Whitehouse Ford and the anchor of the lightly floated Jerome-to-Vienna reach.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
    'Paved lot at the ramp (MDC GIS), ADA stall.', 'From Vienna, take Highway 63 south 2.5 miles, then Highway 28 south 2 miles, then Route Y east 6 miles (the last 2 miles are County Road 513).', 'Concrete boat ramp, ADA privy, primitive individual campsites on 6 acres.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/bell-chute-access', 167.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Indian Ford (MO 42 Bridge) — medium (OpenStreetMap: MO 42 bridge way over the Gasconade River (verified against OSM river geometry, 48 m))
-- note: No official managing agency; long-documented in float guides but facilities/legal parking unverified - medium confidence, stays pending.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Indian Ford (MO 42 Bridge)', 'indian-ford-mo-42-bridge',
    ST_SetSRID(ST_MakePoint(-91.908016, 38.188774), 4326),
    'bridge', ARRAY['bridge', 'access']::text[],
    true, NULL,
    'The Route 42 bridge at Indian Ford (chart mile 179.5), the traditional take-out for the ~104-mile run from I-44 and a mid-point between Bell Chute and Paydown. Undeveloped bridge access.',
    NULL,
    'No developed parking; roadside only.', 'Missouri Route 42 bridge over the Gasconade, about 7 miles west of Vienna.', 'No facilities - informal bridge access at the historic Indian Ford crossing.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 179.5, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Paydown Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point))
-- note: County: Maries per MDC GIS centroid layer.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Paydown Access', 'paydown-access',
    ST_SetSRID(ST_MakePoint(-91.814122, 38.230143), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC access at Paydown Spring (chart mile 187.6), site of former mills. Agnew''s guide treats Paydown as the gateway to the last ~80 miles of the lower river.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
    'Two paved parking areas (MDC GIS).', 'From Vienna, take Highway 63 north 5.5 miles, then County Road 201 east 8 miles.', 'Boat ramp, ADA privy, six primitive campsites on 4.6 acres at the old Paydown mill/spring site.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/paydown-access', 187.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Rollins Ferry Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Rollins Ferry Access', 'rollins-ferry-access',
    ST_SetSRID(ST_MakePoint(-91.820345, 38.393556), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC access at the Highway 89 bridge south of Linn (chart mile 203.4, ''Hwy 89 Bridge; Rollins Ferry Access''). Main access for the lower-middle river below Paydown.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
    'Gravel parking area (MDC GIS).', 'From Linn, take Highway 89 south 7 miles to the access at the Highway 89 bridge.', 'Boat ramp, ADA privy, 11 primitive campsites on 16 acres.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/rollins-ferry-access', 203.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Pointers Creek Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM slipway at same spot))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Pointers Creek Access', 'pointers-creek-access',
    ST_SetSRID(ST_MakePoint(-91.742161, 38.424935), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC access at Pointers Creek (chart mile 210.8), 7.4 miles below Rollins Ferry on the big-water lower river.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
    'Paved parking area (MDC GIS).', 'From Linn, take Route CC southeast 8 miles, then Route RA east to the access.', 'Boat ramp, ADA privy, primitive individual campsites on 8.7 acres near the Pointers Creek mouth.',
    false, NULL,
    NULL, 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/pointers-creek-access', 210.8, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Mt. Sterling Bridge (US 50) — medium (OpenStreetMap: US 50 bridge way over the Gasconade River at Mt. Sterling (verified against OSM river geometry, 21 m))
-- note: Documented only by the float chart/guides; no managing agency. Medium confidence, stays pending.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mt. Sterling Bridge (US 50)', 'mt-sterling-bridge',
    ST_SetSRID(ST_MakePoint(-91.628898, 38.466788), 4326),
    'bridge', ARRAY['bridge', 'access']::text[],
    true, NULL,
    'US 50 crossing at Mt. Sterling (chart mile 219.8, ''access under bridge''), an informal put-in/take-out splitting the 25-mile Pointers Creek to Helds Island gap.',
    NULL,
    'No developed parking; roadside only.', 'US Highway 50 bridge over the Gasconade at Mt. Sterling; local River Road/Riverview Drive run along the east bank.', 'No facilities - informal access under the highway bridge per float guides.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 219.8, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Helds Island Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM slipway at same spot))
-- note: Likely what the task hint 'Helms Ford' referred to - no access named Helms Ford exists on the Gasconade (web search: no results; nearest match is Hull Ford on the Osage Fork).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Helds Island Access', 'helds-island-access',
    ST_SetSRID(ST_MakePoint(-91.597762, 38.553022), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC ramp-and-camping access at Helds Island off Route K (chart mile 235.4), the main access between Mt. Sterling and Fredericksburg on the lower river.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
    'Two paved lots (MDC GIS), one ADA.', 'From Mt. Sterling, take Highway 50 east, then Route K north 4 miles until it turns to gravel, then continue 2 miles to the access entrance.', 'Boat ramp, ADA privy, about 8 primitive campsites on 9.6 acres at Helds Island.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/helds-island-access', 235.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Fredericksburg Ferry Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM 'Fredericksburg Boat Ramp' at same spot))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Fredericksburg Ferry Access', 'fredericksburg-ferry-access',
    ST_SetSRID(ST_MakePoint(-91.633194, 38.603241), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'campground', 'access']::text[],
    true, 'MDC',
    'MDC access at the historic Fredericksburg ferry crossing off Route J (chart mile 244.8), the last camping access before the mouth reach.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
    'Gravel parking area (MDC GIS).', 'From Linn, take Highway 50 east 3 miles, then Highway 89 north 3.5 miles, then Route J east 6 miles, Routes J/N north 4 miles, Route J east 2 miles, and Old Ferry Road 1 mile to the river.', 'Boat ramp, privy, roughly 10 primitive campsites on 5.1 acres at the old ferry site.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/fredericksburg-ferry-access', 244.8, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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

-- Gasconade Park Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/MapServer/17 (MDC boat-ramp GIS point; OSM 'Gasconade Access' slipway at same spot))
-- note: A separate USACE launch ramp 0.6 km downstream at 38.673559,-91.550232 is tagged private in OSM and was not added.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Gasconade Park Access', 'gasconade-park-access',
    ST_SetSRID(ST_MakePoint(-91.555183, 38.668267), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    'MDC ramp in the town of Gasconade on the west bank, about half a mile above the Missouri River confluence (chart mile 252.4) - the last take-out before the Missouri River.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Gravel lot with ADA stall (MDC GIS).', 'In the town of Gasconade, take Main Street north, then Oak Street east to the end of the street.', 'Boat ramp and parking on 2.2 acres on the west bank. No camping.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/gasconade-park-access', 252.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'gasconade'
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
-- retire osage-fork-confluence-access: not an access point - tributary confluence with no road access or landing; put-ins recorded here were float-downs from Osage Fork accesses
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'gasconade' AND ap.slug = 'osage-fork-confluence-access'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'gasconade' AND ap.slug = 'osage-fork-confluence-access';

-- retire little-piney-creek-confluence: duplicate of jerome-access - the MDC Jerome boat ramp sits at the Little Piney mouth, ~45 m from this pin
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'gasconade' AND ap.slug = 'little-piney-creek-confluence'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'gasconade' AND ap.slug = 'little-piney-creek-confluence';

-- retire cave-lodge: not an access point - a 1930s Moccasin Bend resort name from historical trip reports; its DB pin actually marked MDC Mitschele Access (added separately) and the historic site corresponds to today's Schlicht Springs Access area (added)
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'gasconade' AND ap.slug = 'cave-lodge'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'gasconade' AND ap.slug = 'cave-lodge';

-- ---- Purge cached drive times for this river ----
DELETE FROM drive_time_cache
WHERE start_access_id IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'gasconade')
   OR end_access_id   IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'gasconade');
