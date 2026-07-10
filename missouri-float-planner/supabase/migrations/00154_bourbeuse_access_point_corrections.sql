-- Mint Spring MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17 (MDC Boat Ramps layer, Area_ID 8409))
-- note: Pin moved ~90 m from area point to the MDC-mapped boat ramp at the river. Route EE (MO EE) bridge crosses immediately upstream.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mint Spring MDC Access', 'mint-spring-mdc-access',
    ST_SetSRID(ST_MakePoint(-91.534871, 38.210037), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '10.5-acre MDC access on the upper Bourbeuse in northwest Crawford County, effectively the head of navigation and mile 0.0 for this river. A gravel boat ramp launches to a shallow reach best suited to canoes; the upper river is seldom floatable without dragging in dry summers. Open 4 a.m.-10 p.m. (boating 24 hours).',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved parking lot (MDC GIS; lot not sized for trailers).', 'From Owensville, take Route EE south 9.5 miles (MDC directions); the access is in the northwest corner of Crawford County, just off the Route EE bridge over the river.', 'Gravel boat ramp (listed in MDC''s statewide boat-ramp inventory; MDC photo captions it ''Mint Spring Access boat ramp''). No restrooms, no drinking water. Camping prohibited.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/mint-spring-access', 0.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Glaser Ford low-water bridge (Koenig Road) — high (OpenStreetMap - Koenig Road bridge=yes segment over the Bourbeuse (verified against river geometry 2026-07-09))
-- note: OSM crossing matches the existing pin (29 m off river line). Do not confuse with the Glaser Hollow Road ford upstream of Mint Spring (above the head of navigation).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Glaser Ford low-water bridge (Koenig Road)', 'glaser-ford-low-water-bridge-koenig-road',
    ST_SetSRID(ST_MakePoint(-91.51931, 38.2326), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'county',
    'Low-water bridge where Koenig Road crosses the upper Bourbeuse, known locally as Glaser Ford. Undeveloped put-in/take-out on the county right-of-way, 2.3 miles below Mint Spring. The slab is a strainer/pin hazard when overtopped.',
    NULL,
    'No lot; roadside shoulder only within the county right-of-way.', 'Where Koenig Road (county road off Route EE/Highway 19 south of Owensville) crosses the upper Bourbeuse on a concrete low-water slab, Crawford County.', 'None. Undeveloped roadside crossing; the concrete low-water slab can be overtopped and is a hazard at high flows.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', 'County',
    NULL, 2.3, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Enke Road bridge — high (OpenStreetMap - Enke Road bridge=yes segment over the Bourbeuse (verified against river geometry 2026-07-09))
-- note: Pin adjusted ~25 m onto the OSM bridge segment.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Enke Road bridge', 'enke-road-bridge',
    ST_SetSRID(ST_MakePoint(-91.45671, 38.23445), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'county',
    'County road bridge over the upper Bourbeuse at mile 7.7, about a river mile above the Highway 19 crossing. Very poor access - steep, brushy right-of-way; an emergency exit more than a planned put-in. The Hawksley/floatmissouri chart notes it as ''another bridge 1.1 miles upstream'' of Hwy 19, ''reached from Hwy. 19''.',
    NULL,
    'No lot; roadside only.', 'Enke Road (county road reached from Highway 19 south of Owensville) bridge over the upper Bourbeuse, Gasconade County.', 'None. Roadside crossing with very limited/poor access to the water (Agnew).',
    false, NULL,
    NULL, 'roadside', 'County',
    NULL, 7.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Hwy 19 bridge — high (OpenStreetMap - computed intersection of MO 19 (bridge=yes) with the Bourbeuse River line)
-- note: Added from the floatmissouri.com (Hawksley) chart ('State Hwy. 19 Bridge... possible put-in'). Guide mile interpolated along the river line between Enke Road (7.7) and Hog Trough (10.7); chart offset cross-check gives 7.7-8.5.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hwy 19 bridge', 'hwy-19-bridge',
    ST_SetSRID(ST_MakePoint(-91.447848, 38.22373), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'state (MoDOT right-of-way)',
    'State Highway 19 bridge over the upper Bourbeuse, mile 0.0 of the classic Hawksley/floatmissouri mile chart, which calls it a possible put-in. Roadside access on the public right-of-way; no facilities. Useful upper-river alternative when Mint Spring''s reach is too low to bother with.',
    NULL,
    'No lot; highway shoulder parking only.', 'Where Missouri Highway 19 crosses the Bourbeuse about 8 road-miles south of Owensville, between Enke Road and Hog Trough Road.', 'None. Undeveloped state-highway bridge crossing.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 8.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Hog Trough Road low-water bridge — high (OpenStreetMap - Hog Trough Road bridge=yes segment over the Bourbeuse (verified against river geometry 2026-07-09))
-- note: Pin adjusted ~15 m onto the OSM bridge segment. Corroborated by two independent charts (Agnew mile 10.7; Hawksley mile 3.0 + 7.7 offset).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hog Trough Road low-water bridge', 'hog-trough-road-low-water-bridge',
    ST_SetSRID(ST_MakePoint(-91.42411, 38.24768), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'county',
    'Low-water bridge carrying Hog Trough Road over the upper Bourbeuse at mile 10.7. The Hawksley/floatmissouri chart lists it as a ''low-water bridge with access'' - an undeveloped roadside put-in on the county right-of-way. The slab is a hazard for floaters at higher flows.',
    NULL,
    'No lot; roadside only.', 'Hog Trough Road (county road) low-water crossing of the upper Bourbeuse; Highway 19 is about 2.8 road-miles west (floatmissouri chart).', 'None. Low-water slab crossing; overtopped and hazardous at high water.',
    false, NULL,
    NULL, 'roadside', 'County',
    NULL, 10.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Tea MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/26 (MDC parking lot, Area_ID 8007; coincides within ~15 m with the OSM slipway node))
-- note: Classified 'access' rather than 'boat_ramp': launch is unpaved/gravel and absent from MDC's official ramp inventory even though a page photo calls it a ramp.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Tea MDC Access', 'tea-mdc-access',
    ST_SetSRID(ST_MakePoint(-91.397216, 38.299019), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '3.4-acre MDC fishing and boating access on the upper Bourbeuse in Gasconade County, south of Owensville at the hamlet of Tea. An unimproved ramp and paved lot sit beside the Route T bridge. First reliable public access below Mint Spring - 17.6 river miles of thinly-accessed water above it.',
    ARRAY['parking']::text[],
    'Paved parking lot at the launch (MDC GIS).', 'From Owensville take Highway 19 south 2 miles, then Route V east 5 miles, and Route T south 4 miles to Tea Road (MDC directions). The access sits on the north bank just downstream of the Route T bridge.', 'Unimproved launch ramp to the river (MDC photo captions ''the ramp at Tea Access''; OSM tags the slipway surface as unpaved; NOT in MDC''s statewide boat-ramp inventory). No restrooms. Camping prohibited.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/tea-access', 17.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Hwy H bridge — high (OpenStreetMap - computed intersection of MO H (bridge=yes) with the Bourbeuse River line)
-- note: Added from the floatmissouri.com (Hawksley) chart (their mile 23.4 = datum mile 31.1; interpolated river-line mile agrees at 31.1). Note: Shawnee Ford Road also bridges the river near mile ~25 but is documented nowhere as an access, so it was not added.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hwy H bridge', 'hwy-h-bridge',
    ST_SetSRID(ST_MakePoint(-91.332719, 38.318217), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'state (MoDOT right-of-way)',
    'Route H highway bridge over the Bourbeuse at mile 31.1, the only mapped crossing in the 17-mile gap between Tea Access and Mill Rock Access. Listed in the Hawksley/floatmissouri chart as an access, with the caveat ''poor access''. Roadside right-of-way only; no facilities.',
    NULL,
    'No lot; highway shoulder only.', 'Where Missouri Route H crosses the Bourbeuse, roughly 10 miles north of Sullivan via Highway 185 and Route H (same approach as Mill Rock Access).', 'None. Undeveloped state-highway bridge; the Hawksley/floatmissouri chart rates it ''poor access''.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 31.1, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Mill Rock MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17 (MDC Boat Ramps layer, Area_ID 7604; OSM slipway 'Mill Rock Access' within 10 m))
-- note: Pin moved ~110 m from the area point to the MDC-mapped ramp at the river (12 m off the river line). Mill Rock Road final approach assumed gravel (county road); field-verify.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mill Rock MDC Access', 'mill-rock-mdc-access',
    ST_SetSRID(ST_MakePoint(-91.302751, 38.331102), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '10.1-acre MDC access on the middle Bourbeuse in Franklin County, reached from Sullivan via Highway 185, Route H and Mill Rock Road. Ramp launch on a scenic reach known for smallmouth, sunfish and catfish. Standard pairing: Tea to Mill Rock (~17 mi) or Mill Rock to Wenkel Ford (~7 mi).',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved parking lot near the ramp (MDC GIS).', 'From Sullivan, take Highway 185 north, then Route H north 10 miles, and Mill Rock Road east 3 miles to the area (MDC directions).', 'Boat/canoe ramp (in MDC''s statewide ramp inventory; OSM also maps a drive-down ford track beside it). Paved lot. No restrooms. Camping prohibited.',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/mill-rock-access', 34.8, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Hwy CC bridge — high (OpenStreetMap - computed intersection of MO CC (bridge=yes) with the Bourbeuse River line (matches existing pin exactly))
-- note: Kept because Agnew lists it as a (very poor) access; Hawksley says none. Consider excluding from trip-planner suggestions.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hwy CC bridge', 'hwy-cc-bridge',
    ST_SetSRID(ST_MakePoint(-91.277532, 38.31199), 4326),
    'bridge', ARRAY['bridge']::text[],
    true, 'state (MoDOT right-of-way)',
    'Route CC highway bridge at mile 39.0, four miles below Mill Rock. Both published charts warn there is little to no practical access here - treat it as a landmark/emergency exit, not a planned put-in. Wenkel Ford Access is 3 miles downstream.',
    NULL,
    'No lot; highway shoulder only.', 'Missouri Route CC (Champion City) bridge over the Bourbeuse between Mill Rock and Wenkel Ford accesses.', 'None. Agnew rates access here ''very poor''; the Hawksley/floatmissouri chart says ''Champion City (Hwy CC) Bridge. No access.''',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', NULL,
    NULL, 39.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Wenkel Ford MDC Access — high (OpenStreetMap slipway node 'Wenkel Ford' at the water, cross-checked against MDC GIS parking lot (Area_ID 8225) 90 m south)
-- note: MDC spells it 'Wenkel Ford' (DB slug says 'wenkle' - keep slug, display name uses MDC spelling). Pin placed at the OSM launch/ford node, 21 m off the river line; official MDC lot is 90 m away.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Wenkel Ford MDC Access', 'wenkle-ford-mdc-access',
    ST_SetSRID(ST_MakePoint(-91.256379, 38.323177), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '5.4-acre MDC fishing and canoe access at the old Wenkel Ford crossing near Spring Bluff, Franklin County. Gravel drive-to-water launch rather than a constructed ramp. Common take-out for the 7-mile float from Mill Rock.',
    ARRAY['parking']::text[],
    'Paved parking lot ~90 m from the launch (MDC GIS).', 'From Spring Bluff, take Highway 185 north, then Wenkel Ford Road north and west 4 miles to the river (MDC directions).', 'Unimproved gravel ford/carry-down canoe launch (OSM tags the crossing ford=yes; no ramp in MDC''s inventory). No restrooms. Camping prohibited.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/wenkel-ford-access', 42.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Laubinger Ford — medium (OpenStreetMap - gap in Laubinger Ford Road alignment at the river (road mapped on both banks), point snapped to channel)
-- note: HUMAN REVIEW: OSM maps Laubinger Ford Road on both banks but the mapped road stops ~110 m short of the water with no ford way; the crossing right-of-way status is unverified and the approach may cross private land. Not in the Hawksley/floatmissouri chart. Kept (pending) because the road is named for the ford on both banks and Agnew lists it; retire if ground-truthing shows posted land.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Laubinger Ford', 'laubinger-ford',
    ST_SetSRID(ST_MakePoint(-91.2446, 38.34075), 4326),
    'access', ARRAY['access']::text[],
    true, NULL,
    'Very obscure unimproved ford where Laubinger Ford Road historically crossed the Bourbeuse, three miles below Wenkel Ford. Agnew lists it as an access but calls it hard to find; there are no facilities and effectively no parking. Interpolated river-line mile (44.8) confirms Agnew''s mile 45.0.',
    NULL,
    'No parking; unimproved road end.', 'At the river end of Laubinger Ford Road (named on both banks), between Wenkel Ford and Peters Ford. Very obscure and hard to find (Agnew).', 'None. Unimproved former ford; no developed access.',
    false, NULL,
    ARRAY['gravel_unmaintained']::text[], 'limited', NULL,
    NULL, 45.0, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Peters Ford — high (OpenStreetMap - Peters Ford Road ford=yes track crossing the Bourbeuse, matching the GNIS 'Peters Ford' locality)
-- note: Genuine public access confirmed by two independent charts plus an OSM ford crossing; existing pin verified (sits mid-ford, 4 m off river line).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Peters Ford', 'peters-ford',
    ST_SetSRID(ST_MakePoint(-91.2066, 38.37457), 4326),
    'access', ARRAY['access']::text[],
    true, 'county',
    'Unimproved public ford where Peters Ford Road meets the Bourbeuse in Franklin County, 6 miles above Noser Mill. The Hawksley/floatmissouri chart lists it plainly: ''Access. County road right of way only.'' No facilities and virtually no parking - a bare-bones put-in for locals.',
    NULL,
    'County road right-of-way only; Agnew notes parking is essentially non-existent without landowner permission.', 'Reached by county road (Peters Ford Road) from Highway 185 at Noser Mill, which is 2 miles northeast (Hawksley chart). The last stretch is an unpaved track to the low-water ford.', 'None. Unimproved low-water ford; vehicles historically crossed the riverbed here.',
    false, NULL,
    ARRAY['gravel_maintained', 'dirt']::text[], 'roadside', 'County',
    NULL, 53.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Devils Back Floats (Noser Mill) — high (OpenStreetMap slipway 'Devils Back Floats' (access=customers) at the water, with OSM camp_site node 38.3951,-91.19654; devilsbackfloats.com confirms concrete ramp at 5103 Noser Mill Rd, Leslie)
-- note: Pin MOVED ~750 m from the Hwy 185 bridge (38.3913,-91.1894) to the outfitter's ramp above the dam, per Agnew ('bridge has no access... safest is Devils Back Campground above the bridge') and Hawksley ('State Hwy. 185 Bridge at old Noser Mill... Private - no access'). is_public set false (customer access). Noser Mill dam hazard at 38.39374,-91.19144 (portage). Guide mile set 58.7 (ramp is ~0.3 mi above the old bridge datum point at 59.0).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Devils Back Floats (Noser Mill)', 'hwy-185-at-noser-mill-devils-back-campground',
    ST_SetSRID(ST_MakePoint(-91.19728, 38.398077), 4326),
    'campground', ARRAY['campground', 'boat_ramp']::text[],
    false, 'private',
    'Private campground and float outfitter on the north bank above the Noser Mill dam - the practical access at Noser Mill, since the Highway 185 bridge itself has no public access. Floating downstream from here requires portaging the low mill dam about half a mile below. Marks the traditional boundary between the upper and lower Bourbeuse (upper mile 59 = lower mile 0).',
    ARRAY['parking', 'camping', 'boat_ramp']::text[],
    'Customer parking at the campground.', 'From the Highway 185 bridge over the Bourbeuse at Noser Mill, take Noser Mill Road west along the north bank to 5103 Noser Mill Road, Leslie (about an hour from St. Louis).', 'Concrete boat ramp, primitive riverside campsites, canoe/kayak/jon boat rentals. Family-run outfitter operating since 1980 - the only outfitter on the Bourbeuse. Ramp and campground customer-access; reservations required for floats.',
    true, 'Private outfitter: rental, camping and launch fees apply. Phone (573) 484-3231.',
    ARRAY['paved']::text[], 'unknown', 'Private',
    'http://www.devilsbackfloats.com/', 58.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Noser Mill Conservation Area — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/26 (MDC parking lot, Area_ID 201501, south lot ~120 m from the river below the dam))
-- note: HUMAN REVIEW: MDC's page does not explicitly advertise boat access; carry distance ~120 m across MDC land measured from official lot coordinate to river line. Field-verify bank condition before promoting as a recommended put-in.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Noser Mill Conservation Area', 'noser-mill-conservation-area',
    ST_SetSRID(ST_MakePoint(-91.18503, 38.38805), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '210.6-acre MDC conservation area on the Bourbeuse just downstream of the historic Noser Mill dam, acquired from the Corps of Engineers in 2015. Offers the only public land at the Noser Mill upper/lower river boundary - a carry-in put-in below the dam that avoids both the private Devils Back ramp and the dam portage. Undeveloped; expect a short walk from the parking lot to the water.',
    ARRAY['parking']::text[],
    'Two MDC parking lots; the south lot sits ~120 m from the left bank below Noser Mill dam.', 'From the intersection of Highways 50 and 185 in Beaufort, head south on 185 for 2 miles to the area (MDC directions); the south parking lot is east of 185 below the mill dam.', 'Undeveloped - no ramp, no restrooms. Walk-in carry to the river across MDC land from the south parking lot.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/noser-mill-conservation-area', 59.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Reiker Ford MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/26 (MDC parking lot / entry point, Area_ID 7507, 91 m from the river))
-- note: Pin moved ~180 m from area point to the official MDC lot. Snake Hill/Reiker Ford Road final approach surface assumed gravel; field-verify.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Reiker Ford MDC Access', 'reiker-ford-mdc-access',
    ST_SetSRID(ST_MakePoint(-91.074041, 38.378902), 4326),
    'access', ARRAY['access']::text[],
    true, 'MDC',
    '10.9-acre MDC access on the lower Bourbeuse southwest of Union, the first public access below Noser Mill - a long 21.5-mile reach. Popular 11-mile float from here to Mayers Landing. Carry-down launch from the parking area; no developed ramp.',
    ARRAY['parking']::text[],
    'Paved parking lot ~90 m from the water (MDC GIS).', 'From Union, take Highway 50 west 1 mile, then Route UU south 5 miles, then Snake Hill Road south 0.5 mile, and Reiker Ford Road east to the area (MDC directions).', 'Unimproved carry-down boat/canoe access - no constructed ramp (absent from MDC''s ramp inventory). No restrooms. Camping and target shooting prohibited.',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/reiker-ford-access', 80.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Mayers Landing MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17 (MDC Boat Ramps layer, Area_ID 7920; OSM slipway "Mayer's Landing" within 20 m))
-- note: Pin verified at the MDC-mapped ramp (36 m off river line).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mayers Landing MDC Access', 'mayers-landing-mdc-access',
    ST_SetSRID(ST_MakePoint(-91.046605, 38.426668), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '6.6-acre MDC access on the lower Bourbeuse just southwest of Union. The ramp remains, but the river''s main channel has migrated away from it (MDC), so expect a shallow-side landing at normal flows. Common take-out for the 11-mile float from Reiker Ford; Union Access is 8.4 miles downstream.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved parking lot at the ramp (MDC GIS).', 'From Union, take Highway 50 west 1 mile, then Route UU south 1 mile (MDC directions).', 'Boat ramp and paved lot - but MDC warns the main channel has shifted away from the ramp, so direct channel access is limited. No restrooms. Camping prohibited.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/mayers-landing-access', 91.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Union MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17 (MDC Boat Ramps layer, Area_ID 6508; OSM slipway 'Union Access', surface=concrete))
-- note: Pin verified at the MDC-mapped ramp. Guths Mill Dam hazard at 38.46186,-90.96618 (~mile 103.5, Hawksley: 'Portage') lies between here and Uhlemeyer - hazard, not an access; consider a hazard layer entry.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Union MDC Access', 'union-mdc-access',
    ST_SetSRID(ST_MakePoint(-90.996244, 38.443052), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '10.3-acre MDC boat and fishing access in the town of Union at the US 50 bridge, beside the USGS Union streamgage (07016500) that governs lower-river floatability. Concrete ramp with in-town convenience. Take-out for the 8.4-mile float from Mayers Landing; note Guths Mill Dam (portage) 3.5 miles downstream.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Paved parking lot at the ramp (MDC GIS).', 'In Union off of Highway 50, near the intersection of Highway 47, adjacent to the QuikTrip (MDC directions).', 'Concrete boat ramp (OSM surface=concrete; in MDC''s ramp inventory) plus gravel-bar bank access. No restrooms on site; convenience store adjacent. Camping prohibited.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/union-access', 99.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Dr. Henry A. and Amalia Uhlemeyer MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17 (MDC Boat Ramps layer, Area_ID 9407, ADA ramp; OSM slipway 'Uhlemeyer' within 25 m))
-- note: MDC page's '9 miles' figure not stated; acreage updated to 12.3 per MDC. Privy confirmed from MDC GIS Privies layer.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Dr. Henry A. and Amalia Uhlemeyer MDC Access', 'dr-henry-a-and-amalia-uhlemeyer-mdc-access',
    ST_SetSRID(ST_MakePoint(-90.907357, 38.439466), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '12.3-acre MDC access on the lowest Bourbeuse beneath the I-44/Historic Route 66 crossings east of Union. ADA boat ramp, privy and paved lot make it the best-equipped access on the river. Last easy access before Chouteau Claim at the Meramec confluence, 5.3 miles downstream.',
    ARRAY['parking', 'restrooms', 'boat_ramp']::text[],
    'Paved ADA parking lot (MDC GIS).', 'Exit I-44 at Route O and go south to the access, which is immediately to the west (MDC directions); the access sits where I-44/US 50 and Historic Route 66 (Route AT) cross the Bourbeuse.', 'Concrete boat ramp (ADA) and privy/vault toilet (ADA) - the only restroom on the river''s MDC accesses. Camping prohibited.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/dr-henry-amalia-uhlemeyer-access', 108.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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

-- Chouteau Claim MDC Access — official (https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17 (MDC Boat Ramps layer, Area_ID 7928; OSM slipway 'Chouteau Claim', surface=concrete, access=yes))
-- note: CORRECTION: prior record said 'no boat ramp noted - primarily walk-in'; MDC's official ramp inventory and OSM both show a concrete ramp here (also listed as 'Choteau Claim Access Boat Ramp' on paddleguide.com). Two private slipways nearby on the Bourbeuse's last bend (OSM access=private) are not this access.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Chouteau Claim MDC Access', 'chouteau-claim-mdc-access',
    ST_SetSRID(ST_MakePoint(-90.890926, 38.398778), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'MDC',
    '15-acre MDC access at the mouth of the Bourbeuse where it joins the Meramec near Moselle - the final take-out for Bourbeuse floats and a put-in/take-out for middle Meramec trips. Concrete ramp with paved and gravel parking. 5.3 miles below Uhlemeyer Access.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Two lots at the ramp: paved, plus a gravel ADA lot (MDC GIS).', 'From Moselle, take St. Mary''s Road northeast to the confluence of the Meramec and Bourbeuse rivers (MDC directions).', 'Concrete boat ramp at the Bourbeuse-Meramec confluence (MDC ramp inventory; OSM surface=concrete). No restrooms. Camping prohibited.',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/chouteau-claim-access', 114.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'bourbeuse'
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
-- retire schmitt-ford: not an access point - Stuesse Road (its stated approach) ends ~210 m short of the river with no mapped ford or track continuing to the water; the intervening land is presumably private and Agnew himself warns it 'may be posted'. No corroboration in the Hawksley/floatmissouri chart, GNIS, or OSM. Not a genuine usable public access.
DELETE FROM access_points ap
USING rivers r
WHERE ap.river_id = r.id AND r.slug = 'bourbeuse' AND ap.slug = 'schmitt-ford'
  AND NOT EXISTS (SELECT 1 FROM float_plans fp
        WHERE fp.start_access_id = ap.id OR fp.end_access_id = ap.id);
UPDATE access_points ap SET approved = false, is_public = false
FROM rivers r WHERE ap.river_id = r.id AND r.slug = 'bourbeuse' AND ap.slug = 'schmitt-ford';

-- ---- Purge cached drive times for this river ----
DELETE FROM drive_time_cache
WHERE start_access_id IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'bourbeuse')
   OR end_access_id   IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'bourbeuse');
