-- Boxley — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer, 'Boxley Bridge'); corroborated by OSM slipway node 12544120379 (35.961291,-93.404230, ~64 m))
-- note: NPS GIS layer and brochure name this 'Boxley Bridge'; the online mileage chart uses 'Boxley'. Parking is an undeveloped pull-in (unverified capacity).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Boxley', 'boxley',
    ST_SetSRID(ST_MakePoint(-93.40366, 35.96094), 4326),
    'bridge', ARRAY['bridge', 'access']::text[],
    true, 'NPS',
    'Uppermost NPS river access at the Boxley Bridge (AR 21), mile 0 of the NPS mileage chart. The 6.1-mile Boxley-to-Ponca reach is the most technical section of the Buffalo — NPS recommends it only for highly experienced whitewater paddlers, and the river runs straight into willow thickets below the bridge. Rain-dependent; floatable only at seasonal high flows.',
    ARRAY['parking']::text[],
    'Small roadside pull-in at the bridge; no developed lot documented.', 'At the AR Highway 21 bridge over the Buffalo in Boxley Valley, about 5 miles south of Ponca. Paved highway to the bridge; put in beneath the bridge.', 'Undeveloped, unpaved put-in beneath the Hwy 21 bridge. No toilets, water, or camping.',
    false, NULL,
    ARRAY['paved']::text[], 'roadside', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 0.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Ponca — official (OSM slipway node 12544103523 ('Ponca River Access Point') at the low-water bridge; NPS BUFF_River_Accesses layer point (36.0209,-93.355118) is ~22 m away; USGS gauge 07055660 ~160 m upstream)
-- note: Restroom presence at the access could not be verified from official sources — flagged for human check. Overnight parking prohibited per BRT trailhead guidance.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Ponca', 'ponca',
    ST_SetSRID(ST_MakePoint(-93.355116, 36.021098), 4326),
    'access', ARRAY['access', 'bridge']::text[],
    true, 'NPS',
    'The classic upper-Buffalo put-in at the Ponca low-water bridge, used when the USGS Ponca gauge (07055660) shows floatable flows. Launches the famous Ponca-to-Kyles Landing run (10.7 mi) past Big Bluff and Hemmed-in Hollow. Boaters coming from Boxley must portage the low-water bridge.',
    ARRAY['parking']::text[],
    'Gravel parking on both sides of the low-water bridge. No overnight parking at this access — arrange a shuttle for multi-day trips.', 'Near the AR 43/74 junction in Ponca; a short gravel spur about 40 yards past the junction leads down to the historic low-water bridge put-in.', 'Gravel launch at the 1943 WPA low-water bridge. No drinking water; no campground at the access (Steel Creek is 2.7 miles downstream).',
    false, NULL,
    ARRAY['paved', 'gravel_maintained']::text[], 'limited', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 6.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Steel Creek — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544125462 ~85 m; Recreation.gov facility 10001451)
-- note: DB had fee_required=true; changed to false because the fee is for overnight camping only — there is no day-use or launch fee anywhere on the Buffalo (NPS fees page).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Steel Creek', 'steel-creek',
    ST_SetSRID(ST_MakePoint(-93.33567, 36.0387), 4326),
    'campground', ARRAY['campground', 'gravel_bar']::text[],
    true, 'NPS',
    'NPS campground and gravel-bar access beneath Roark Bluff, 2.7 miles below Ponca. The standard low-water alternate put-in when Ponca is too shallow, giving an 8-mile run to Kyles Landing through the Ponca Wilderness. Tent and horse camping only.',
    ARRAY['parking', 'restrooms', 'camping']::text[],
    'Day-use parking at the river access below Roark Bluff.', 'Off AR 74 about 3 miles east of Ponca; a steep entrance road descends to the campground and river (NPS describes the Ponca-Steel Creek shuttle as almost entirely paved).', '26 tent-only sites plus 14 horse sites; seasonal flush restrooms and water spigots (vault toilet in winter); no showers or hookups; camper trailers/RVs prohibited. Gravel-bar launch at the day-use area.',
    false, 'Day use and launching are free. Camping $20/night Mar 15-Nov 14 (Recreation.gov reservations required in season); free primitive camping in winter.',
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/steel-creek-campground.htm', 8.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Kyles Landing — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 4173015866 ~42 m; Recreation.gov facility 258693 (campground, 36.055772,-93.280747))
-- note: Name updated from "Kyle's Landing" to NPS spelling "Kyles Landing". Roadside parking ban along CR 56 (2023) is worth surfacing to users.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Kyles Landing', 'kyles-landing',
    ST_SetSRID(ST_MakePoint(-93.27927, 36.05702), 4326),
    'campground', ARRAY['campground', 'gravel_bar']::text[],
    true, 'NPS',
    'NPS tent campground and gravel-bar access in the Ponca Wilderness, the standard take-out for the Ponca/Steel Creek floats and put-in for the quieter 5.7-mile run to Erbie. Reached by one of the park''s roughest access roads. Very busy on spring weekends.',
    ARRAY['parking', 'restrooms', 'camping']::text[],
    'Lot at the landing; since March 2023 no parking is allowed anywhere along Kyles Landing Road (CR 56) to keep it open for emergency vehicles — NPS suggests weekday trips and carpooling.', 'From AR 74 west of Jasper via Kyles Landing Road (County Road 56): a steep, rough, ~3-mile gravel descent. NPS recommends high-clearance, 4-wheel-drive vehicles.', '33 tent-only sites (RVs, trailers, and camper vans prohibited); seasonal flush restrooms and water, vault toilet in winter; no showers. Gravel-bar launch and Buffalo River Trail trailhead.',
    false, 'Day use and launching free. Camping $20/night Mar 15-Nov 14 (reservations via Recreation.gov beginning Sept 1, 2026); free winter primitive camping.',
    ARRAY['gravel_unmaintained']::text[], 'limited', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 16.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Erbie — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544131631 ('Erbie River Access Point') ~8 m; Recreation.gov facility 10341416)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Erbie', 'erbie',
    ST_SetSRID(ST_MakePoint(-93.21229, 36.07098), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'NPS',
    'Campground and river access in the Erbie historic district (Parker-Hickman Farmstead nearby), between Kyles Landing and Ozark. The take-out is on river right about a mile below the concrete Erbie Ford vehicle crossing. Gateway to a serene 5.4-mile float down to Ozark.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic']::text[],
    'Parking at the boat launch and campground.', 'About 6 miles down the gravel Erbie Campground Road from AR 7 north of Jasper; a rougher unpaved road also comes in from the Compton side. NPS announced road improvements for Erbie in recent years.', 'Boat launch area with picnic tables, vault toilet, and an emergency phone. Adjacent campground: 14 drive-in (RV-suitable), 13 walk-in, and 5 group sites; seasonal water and flush restrooms; vault toilet in winter.',
    false, 'Day use free. Camping $20/night individual, $50/night group Mar 15-Nov 14; free winter primitive camping.',
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 22.3, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Ozark — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544145206 ('Ozark River Access Point', surface=sand) ~40 m; Recreation.gov facility 233120)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Ozark', 'ozark',
    ST_SetSRID(ST_MakePoint(-93.1592, 36.06481), 4326),
    'campground', ARRAY['campground', 'gravel_bar']::text[],
    true, 'NPS',
    'Campground and sandy-beach access on river right, the common put-in for the short 2.1-mile Ozark-to-Pruitt day float and take-out for the Erbie run. The campground sits just uphill from the launch beach.',
    ARRAY['parking', 'restrooms', 'camping']::text[],
    'Parking at the campground/day-use area above the beach.', '3 miles down a graded gravel road off AR 7 north of Jasper.', '33-site campground (some sites RV-suitable, no hookups) with seasonal water and flush restrooms, vault toilet in winter; no showers. Sandy-beach launch below the campground; popular swimming hole.',
    false, 'Day use free. Camping $20/night Mar 15-Nov 14 (Recreation.gov reservations in season); free winter primitive camping.',
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 27.8, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Pruitt — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544103595 ('Pruitt Landing River Access Point', surface=gravel) ~24 m)
-- note: The AR 7 bridge was replaced/demolished in recent years with temporary area closures — worth a live-conditions check before publishing directions.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Pruitt', 'pruitt',
    ST_SetSRID(ST_MakePoint(-93.1359, 36.05735), 4326),
    'access', ARRAY['access']::text[],
    true, 'NPS',
    'Highway 7 access at Pruitt, take-out for the Ozark run and put-in for the 6.8-mile float to Hasty. The landing sits about a half mile downstream of the Hwy 7 bridge on river left, near the Pruitt Ranger Station and the mouth of the Little Buffalo River.',
    ARRAY['parking', 'restrooms', 'picnic']::text[],
    'Day-use parking at the landing.', 'Off AR 7 at Pruitt, about 6 miles north of Jasper; the landing (Lower Pruitt Landing) is roughly half a river mile below the Highway 7 bridge on river left, with a short spur road to the water.', 'Day-use gravel landing with picnic area and restroom at the lower launch; Pruitt Ranger Station nearby on AR 7. No camping at the landing.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 29.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Hasty — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544150004 ('Hasty River Access Point', surface=gravel) ~43 m)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Hasty', 'hasty',
    ST_SetSRID(ST_MakePoint(-93.08184, 36.00831), 4326),
    'access', ARRAY['access', 'gravel_bar']::text[],
    true, 'NPS',
    'Low-key sandy/gravel-bank access between Pruitt and Carver, put-in for the easy 4.2-mile float to Carver past the locally famous Blue Hole swimming spot. No developed facilities.',
    ARRAY['parking']::text[],
    'Informal parking at the access.', 'On Hasty Cutoff Road between Jasper and the community of Hasty (off AR 74/123); short gravel approach to the bank.', 'Undeveloped launch — NPS: ''slide your boat into the water from the sandy bank at Hasty.'' No toilets or water documented. Primitive gravel-bar camping exists downstream near Blue Hole.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 36.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Carver — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer, snaps 1 m to river); OSM slipway node 12544127385 ~82 m; Recreation.gov facility 10378448 (35.984167,-93.041603))
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Carver', 'carver',
    ST_SetSRID(ST_MakePoint(-93.04152, 35.98307), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'NPS',
    'Small campground and gravel access at the Highway 123 bridge, a frequent take-out for middle-river day floats and put-in for the remote 6.8-mile run to Mt. Hersey. The USGS ''Buffalo River at Carver'' gauge (07055780) is at this access.',
    ARRAY['parking', 'restrooms', 'camping']::text[],
    'Parking at the campground/access.', 'At the AR 123 bridge (''Big Bridge'') between Hasty and Mount Judea; the access is just downstream of the bridge on river left, with paved highway approach.', '8 tent-only campsites with vault toilet and seasonal drinking water; no flush restrooms or showers. Gravel launch; popular swimming and fishing area where Big Creek enters the Buffalo.',
    false, 'Day use free. Camping $16/night Mar 15-Nov 14 (Recreation.gov reservations in season); free winter primitive camping.',
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 40.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Mt. Hersey — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544153003 ('Mt Hersey River Access Point') ~5 m)
-- note: Some third-party sources describe the road as requiring care after rain; NPS calls it 'sometimes rough gravel road' — no official high-clearance requirement found.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Mt. Hersey', 'mt-hersey',
    ST_SetSRID(ST_MakePoint(-92.95306, 36.00909), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'NPS',
    'Remote gravel access and free primitive camping area between Carver and Woolum. Put-in for the scenic 8.6-mile float past The Narrows and Skull Bluff to Woolum. One of the quietest vehicle accesses on the middle river.',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'Informal parking at the access.', '6 miles of sometimes-rough gravel road from US 65 between Pindall and Western Grove.', 'Primitive, free camping area with no designated sites; vault toilet; no drinking water or trash service. Gravel launch (no ramp).',
    false, 'Free primitive camping, first-come first-served.',
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 47.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Woolum — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544283497 ('Woolum River Access Point') ~68 m and OSM camp_site node 12157704581)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Woolum', 'woolum',
    ST_SetSRID(ST_MakePoint(-92.88599, 35.97041), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'NPS',
    'Gravel access and free primitive camp at the mouth of Richland Creek, take-out for the Mt. Hersey run and put-in for the 10.9-mile float to Baker Ford. The river below Woolum is a losing stream that can run dry in low water — check Tyler Bend Visitor Center before floating this reach.',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'Gravel parking area (also serves Buffalo River Trail / Ozark Highlands Trail hikers).', '7 miles from US 65 at St. Joe — the first 4 miles paved, the last 3 graded gravel. The access is on river left at the Richland Creek confluence; continuing beyond Woolum requires fording Richland Creek (impassable at high water).', 'Free primitive campground with vault toilet; no drinking water or trash service; horse camping permitted. Gravel launch at the Richland Creek confluence.',
    false, 'Free primitive camping, first-come first-served.',
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 56.3, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Baker Ford — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544334808 ('Baker Ford Access Point') ~12 m)
-- note: Exact county-road routing (from US 65 near St. Joe/Snowball side) not confirmed from an official source; road surface inferred from the NPS shuttle description ('about half is gravel road').
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Baker Ford', 'baker-ford',
    ST_SetSRID(ST_MakePoint(-92.81361, 35.98083), 4326),
    'access', ARRAY['access']::text[],
    true, 'NPS',
    'Quiet ford access on river left between Woolum and Tyler Bend, take-out for the 10.9-mile Woolum float and put-in for the short 4.3-mile run to Tyler Bend. The reach upstream is a losing stream that can be dry at low water.',
    ARRAY['parking']::text[],
    'Informal parking at the access.', 'Via county roads west from US 65 (roughly half of the 11-mile shuttle from Woolum is gravel); the access is on river left.', 'Undeveloped ford/gravel access; no toilets, water, or designated camping documented.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 67.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Tyler Bend — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); sits between OSM 'Tyler Bend River Access Point Upper' (12140706379) and 'Lower' (12544336091) gravel slipways; NPS campground page GPS 35.9867152,-92.7639029; Recreation.gov facility 233119)
-- note: Verified launch type: both launches are gravel (OSM surface=gravel; NPS notes no ADA ramps park-wide) — NOT classified boat_ramp despite being a 'developed' access.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Tyler Bend', 'tyler-bend',
    ST_SetSRID(ST_MakePoint(-92.76543, 35.99011), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'NPS',
    'The main developed access of the middle Buffalo, with the park''s visitor center, a full-service campground, and upper and lower gravel launches. Common overnight base for Baker Ford-to-Gilbert floats; the St. Joe USGS gauge (07056000) used for middle-river float levels is nearby.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic']::text[],
    'Paved lots at the visitor center, campground, and river access.', '2 miles off US 65 about 6 miles south of St. Joe on a paved park road; the Tyler Bend Visitor Center is at the entrance area.', 'Middle-district hub: visitor center, 27 drive-in + 10 walk-in + 5 group sites; water, hot showers, and flush restrooms year-round; seasonal dump station; no hookups. Two gravel launch lanes (upper and lower) — no concrete boat ramp.',
    false, 'Day use free. Camping $20/night individual, $50 group Mar 15-Nov 14 (Recreation.gov); free Nov 15-Mar 14 (group/walk-in areas closed in winter).',
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/tyler-bend-campground.htm', 71.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Grinders Ferry — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544334438 ('Grinders Ferry River Access Point') ~25 m)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Grinders Ferry', 'grinders-ferry',
    ST_SetSRID(ST_MakePoint(-92.74454, 35.9848), 4326),
    'gravel_bar', ARRAY['gravel_bar', 'campground']::text[],
    true, 'NPS',
    'Busy Highway 65 gravel-bar access next door to Tyler Bend, the main put-in for the popular 4.3-mile float to Gilbert past Shine Eye Bluff. NPS float-level charts key the middle district to ''Grinder''s Ferry/Highway 65''.',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'Parking on the gravel bar; the river floods it regularly, so surfaces can be soft — park at your own risk.', 'At the US 65 bridge over the Buffalo, just downhill from the Tyler Bend entrance. Vehicles may drive onto the large gravel bar at their own risk.', 'Large sand/gravel bar launch with free primitive camping; vault toilet; no water or trash service. Can be crowded on holiday weekends.',
    false, 'Free primitive gravel-bar camping.',
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 72.6, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Gilbert — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544344086 ('Gilbert River Access Point') ~17 m)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Gilbert', 'gilbert',
    ST_SetSRID(ST_MakePoint(-92.71494, 35.98656), 4326),
    'access', ARRAY['access', 'gravel_bar']::text[],
    true, 'NPS',
    'Village access and outfitter hub on river left at Gilbert, take-out for the Grinders Ferry float and put-in for the long 11.6-mile pool-and-riffle run to Maumee. One of the few accesses with a store nearby; year-round floating usually possible from here down.',
    ARRAY['parking', 'camping', 'restrooms', 'store']::text[],
    'Park on the gravel bar upstream of the access road, at your own risk (regularly flooded).', 'Paved AR 333 ends at a T intersection in Gilbert; the river access is to the right past the old general store. The gravel road onto the bar can be rough with deep sandy areas.', 'Gravel-bar launch with free primitive camping downstream of the access road; vault toilet; no water. Gilbert General Store (est. 1901) and a canoe outfitter are in the village a short walk away.',
    false, 'Free primitive gravel-bar camping.',
    ARRAY['paved', 'gravel_unmaintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 76.9, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- North Maumee — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer, 'Maumee North'); OSM slipway node 12544342542 ~17 m)
-- note: NPS GIS names it 'Maumee North'; the mileage chart uses 'North Maumee'. Chart order (N 88.5, S 89.0) matches the NPS paddling article ('North Maumee access is 1/2 mile upstream' of South Maumee).
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'North Maumee', 'north-maumee',
    ST_SetSRID(ST_MakePoint(-92.62939, 36.03485), 4326),
    'access', ARRAY['access', 'gravel_bar']::text[],
    true, 'NPS',
    'North-bank gravel access at the Maumee bend, half a mile upstream of South Maumee. Put-in for the 4.7-mile float to Spring Creek and a take-out for the long run down from Gilbert. Day-use only.',
    ARRAY['parking']::text[],
    'Informal parking at the access.', 'About 6 miles by county road from AR 14 near the community of Mull (north side of the river).', 'Launch access only — no camping facilities, toilets, or water.',
    false, NULL,
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 88.5, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- South Maumee — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer, 'Maumee South'); OSM slipway node 12544347926 ~58 m)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'South Maumee', 'south-maumee',
    ST_SetSRID(ST_MakePoint(-92.63657, 36.0395), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'NPS',
    'South-bank access and small primitive camp at the Maumee bend, on river right half a mile below North Maumee. Take-out for the 12.1-mile Gilbert float; long pools and gentle riffles characterize this lower-middle reach.',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'Parking at the camping area; no drive-on access to the gravel bar.', 'Via gravel county roads from the south (AR 27 near Morning Star / AR 14 side); about 7 of the shuttle miles from Gilbert are gravel.', '6 designated free primitive campsites with vault toilet; no water or trash service. Gravel launch; vehicles may not drive onto the bar.',
    false, 'Free primitive camping, first-come first-served.',
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 89.0, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Spring Creek — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544348086 ('Spring Creek Access Point') ~83 m toward the water)
-- note: Vehicle-assisted launching prohibited (NPS camping page) — the planner should not suggest trailer launches here.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Spring Creek', 'spring-creek',
    ST_SetSRID(ST_MakePoint(-92.5844, 36.0299), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'NPS',
    'Free lower-river campground and hand-carry access between South Maumee and Dillards Ferry. Take-out for the 4.7-mile Maumee float and put-in for the 4.6-mile run to the Highway 14 bridge, which passes the narrow Tie Chute about a mile above Dillards Ferry.',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'Parking at the campground; boats must be hand-carried from the lot to the water.', 'About 3 miles from AR 14 near Harriet (Searcy County) via gravel road.', '12 free tent sites with vault toilet; no drinking water or showers. NPS: ''Spring Creek Landing has been closed to vehicle-assisted launches'' — watercraft may still be put in/taken out but must be hand carried.',
    false, 'Camping free year-round, first-come first-served.',
    ARRAY['gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 93.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Dillards Ferry — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544348090 ('Dillards Ferry River Access Point', surface=gravel) ~29 m)
-- note: Toilet presence at the access unverified from official sources — flagged for human check.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Dillards Ferry', 'dillards-ferry',
    ST_SetSRID(ST_MakePoint(-92.57806, 36.06681), 4326),
    'access', ARRAY['access', 'bridge']::text[],
    true, 'NPS',
    'The Highway 14 bridge access, hub of the lower river and reference point for NPS lower-district float levels (''Dillard''s Ferry/Highway 14''). Currently the NPS-recommended launch in the Buffalo Point area while the Buffalo Point launch road is closed — Buffalo Point is 1.4 miles downstream, Rush 8.9.',
    ARRAY['parking', 'picnic']::text[],
    'Parking area beside the bridge with a small picnic area and canoe landing.', 'At the AR 14 bridge over the Buffalo between the communities of Mull and Harriet; paved highway directly to the access.', 'Gravel launch beside the Highway 14 bridge with parking and small picnic area; minimal facilities, no drinking water. Informal primitive camping occurs on nearby gravel bars.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/river-accesses-mileage.htm', 98.3, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Buffalo Point — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544318632 ('Buffalo Point River Access Point', surface=gravel) ~20 m; Recreation.gov facility 234043 (campground area 36.085365,-92.565655))
-- note: Launch road closure is current per the NPS mileage page (fetched 2026-07); re-check periodically. Not classified boat_ramp: launch is gravel and currently carry-only.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Buffalo Point', 'buffalo-point',
    ST_SetSRID(ST_MakePoint(-92.55479, 36.06935), 4326),
    'campground', ARRAY['campground', 'access']::text[],
    true, 'NPS',
    'The lower river''s developed hub — full-amenity campground, ranger station, and Indian Rockhouse trails — 1.4 miles below Dillards Ferry. NPS currently recommends launching/taking out at Dillards Ferry instead because the Buffalo Point launch road is closed and the bank is a steep gravel-bar carry.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic']::text[],
    'Paved lots in the developed area; launch-road closure means a steep carry between the lot and the water.', 'Via paved AR 268 off AR 14, about 3 miles to the developed area (ranger station). The road down to the river launch is CLOSED — boats and gear must be carried across a steep gravel bar between the river and the parking lot.', 'Largest developed campground on the river: 80+ drive-in sites with water and 30/50-amp electric hookups, 21 walk-in tent sites, 5 group sites, 3 pavilions; hot showers, flush restrooms, seasonal dump station; ranger station and cabins/restaurant concession nearby. River launch is currently a gravel-bar carry (no usable ramp while the launch road is closed).',
    false, 'Day use free. Camping $30/night drive-in, $20 walk-in, $50 group, pavilions $50/day (Mar 15-Nov 14); Loop B free primitive camping in winter.',
    ARRAY['paved']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/buffalo-point-campground.htm', 99.7, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Rush — official (https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/BUFF_River_Accesses/FeatureServer/0 (NPS BUFF_River_Accesses layer); OSM slipway node 12544392404 ('Rush Landing River Access Point') ~3 m; Recreation.gov facility 10378435 (campground 36.126224,-92.552195))
-- note: Road surface verified via OSM: Rush Rd (CR 6035) tagged asphalt for the main descent, gravel for the last segment.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Rush', 'rush',
    ST_SetSRID(ST_MakePoint(-92.54892, 36.12429), 4326),
    'access', ARRAY['access', 'campground']::text[],
    true, 'NPS',
    'Gateway to the Lower Buffalo Wilderness and the last vehicle access on the Buffalo — the next take-out is 24.2 miles downstream at Buffalo City on the White River. Clabber Creek Shoals, a quarter mile below the landing, is the notable rapid (portage possible on river left).',
    ARRAY['parking', 'camping', 'restrooms']::text[],
    'Parking at the landing; overnight vehicles common for Lower Wilderness floats.', 'From AR 14 near Caney, about 5.5 miles down Rush Road (CR 6035) through the Rush Historic District — asphalt most of the way, gravel on the final stretch to the landing. The campground entrance crosses Rush Creek and may be inaccessible during high water.', 'Rush Landing gravel launch; 12-site tent-only campground just upstream with vault toilet and seasonal water spigot (no launch at the campground itself). Rush Historic District 1880s zinc-mining ghost town adjacent.',
    false, 'Day use free. Camping $16/night Mar 15-Nov 14 (Recreation.gov reservations in season); free winter primitive camping.',
    ARRAY['paved', 'gravel_maintained']::text[], 'unknown', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 107.2, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Buffalo City — high (OSM slipway node 12544893837 (surface=concrete) and node 12544343667 ('Buffalo City River Access Point', surface=paved), west bank of the White River ~0.7 mi below the Buffalo confluence; corrected from the NPS BUFF_River_Accesses layer point (36.170235,-92.438392) which sits in the Buffalo City community ~640 m NNE of the ramp)
-- note: COORDINATE CORRECTED: old pin (36.170240,-92.438390, from the NPS GIS layer) was the community/rail area 796 m off the river line; new pin is the concrete ramp per OSM. HUMAN REVIEW: confirm ramp ownership (AGFC vs county/private — listed as 'Buffalo City Public Water Access' on boat-ramp directories) and confirm the ramp is the canonical take-out spot. managing_agency left null because AGFC is not in the allowed enum.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Buffalo City', 'buffalo-city',
    ST_SetSRID(ST_MakePoint(-92.440257, 36.164575), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access']::text[],
    true, 'AGFC (public access; ownership unverified)',
    'The traditional final take-out for the Buffalo, listed at mile 131.4 on the NPS mileage chart but located outside the park at the White River confluence. The last leg is on the White River, whose cold, swift dam-release flows demand caution in small craft; NPS also notes Shipps Ferry, 6 miles further down the White, as an alternative take-out. Boat rentals, camping, and cabins are available in the Buffalo City community.',
    ARRAY['parking', 'boat_ramp']::text[],
    'Vehicle and trailer parking on site with marked trailer spaces.', 'At the end of paved AR 126 at Buffalo City (Baxter County), on the west bank of the White River just downstream of the Buffalo''s mouth.', 'Concrete public launch ramp on the White River with trailer parking. The take-out for Buffalo floats: paddle past the confluence and about 0.7 mile down the White to the ramp on the left (west) bank. Ramp can flood during high White River releases from Bull Shoals Dam.',
    false, NULL,
    ARRAY['paved']::text[], 'unknown', NULL,
    NULL, 131.4, NULL,
    true, now()
FROM rivers r WHERE r.slug = 'buffalo'
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

-- Shine Eye — medium (thedyrt.com/camping/arkansas/buffalo-national-river-shine-eye-gravel-bar and campingroadtrip.com listing (35.987979,-92.734507); consistent with NPS description of a large sand/gravel bar on river left ~0.5 mile downstream of Grinders Ferry, opposite Shine Eye Bluff)
-- note: NOT on the official NPS access/mileage chart — listed on the NPS camping page as a primitive camping area. guide_mile estimated (72.6 + ~0.7). Coordinate is from campground directories (single-lineage source): medium confidence, keep pending for human pin check. Add mainly as an overnight-stop POI, not a put-in.
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, river_mile_upstream, approved, approved_at
)
SELECT
    r.id, 'Shine Eye', 'shine-eye',
    ST_SetSRID(ST_MakePoint(-92.734507, 35.987979), 4326),
    'gravel_bar', ARRAY['gravel_bar', 'campground']::text[],
    true, 'NPS',
    'NPS primitive camping gravel bar on river left about half a mile below Grinders Ferry, opposite Shine Eye Bluff. A popular overnight or swim stop on the Grinders Ferry-to-Gilbert float; walk-in or float-in only, so it is a camp/stop rather than a vehicle launch.',
    ARRAY['camping', 'restrooms']::text[],
    'Small parking where the gravel road ends; no drive-on access to the bar.', 'Short gravel detour off US 65 south of the Grinders Ferry bridge where the Buffalo River Trail crosses; per the current NPS camping page the site is walk-in or float-in only.', 'Large sand and gravel bar with 1 designated free primitive campsite; vault toilet open year-round (limited service); no water or trash service.',
    false, 'Free primitive camping.',
    ARRAY['gravel_maintained']::text[], 'limited', 'NPS',
    'https://www.nps.gov/buff/planyourvisit/camping.htm', 73.3, NULL,
    false, NULL
FROM rivers r WHERE r.slug = 'buffalo'
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
WHERE start_access_id IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'buffalo')
   OR end_access_id   IN (SELECT ap.id FROM access_points ap JOIN rivers r ON r.id = ap.river_id WHERE r.slug = 'buffalo');
