-- Migration: Add comprehensive Niangua River and Big Piney River access points
-- Safe to run against existing data: ON CONFLICT only updates 'approved' flag,
-- preserving any edits made in geo admin.
-- Niangua: 21 access points (upstream to downstream)
-- Big Piney: 18 access points (upstream to downstream)

-- ============================================
-- NIANGUA RIVER ACCESS POINTS
-- Ordered upstream to downstream
-- Sources: MDC, Missouri State Parks, USGS, Wikipedia, FloatMissouri, SouthwestPaddler
-- ============================================

-- 1. Charity Access (MDC) — Uppermost practical access
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Charity Access', 'charity-access',
    ST_SetSRID(ST_MakePoint(-92.9496, 37.4689), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'Uppermost practical access on the Niangua. Concrete boat ramp purchased by MDC in 1982. The 20 miles downstream to Big John Access is small water that runs very low in summer. Good fishing for bass, suckers, and sunfish.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking lot at river. Limited capacity.',
    'From Buffalo, take Highway 32 east 2 miles, then Route H south 8 miles, and Route M east 2.75 miles to the Niangua River.',
    'Concrete boat ramp. No restrooms, no water, no camping allowed.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/charity-access',
    0.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 2. Big John Access (MDC) — Mile 1.3 from Hwy 32 bridge
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Big John Access', 'big-john-access',
    ST_SetSRID(ST_MakePoint(-93.0305, 37.6614), 4326),
    'access', ARRAY['access'], true, 'MDC',
    'MDC access at low-water bridge on the Niangua. Good canoe/kayak access with gravel bar. Subject to flash flooding. No camping allowed. The river above Hwy 32 is seldom floatable except in high water.',
    ARRAY['parking'],
    'Small gravel lot. Limited parking for ~5 vehicles.',
    'From Buffalo, take Highway 32 east 2 miles, then Engle Lane north 1 mile, then Steelman Road east 0.25 mile to the Niangua River.',
    'Low-water bridge access. No restrooms, no water, no camping.',
    false, ARRAY['gravel_maintained']::text[], '5', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/big-john-access',
    1.3, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 3. Williams Ford Access (MDC) — Mile 12.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Williams Ford Access', 'williams-ford',
    ST_SetSRID(ST_MakePoint(-92.8830, 37.6846), 4326),
    'bridge', ARRAY['access', 'bridge'], true, 'MDC',
    'Low-water concrete slab crossing where water flows over the top. Poor canoe/kayak access due to high embankment. About half a mile of Niangua River access. Good fishing for black bass, suckers, and sunfish.',
    ARRAY['parking'],
    'Roadside parking. Very limited capacity.',
    'Off Route MM to County Road MM-123 to County Road K-143.',
    'Low-water crossing. No restrooms, no water, no camping.',
    false, ARRAY['gravel_maintained']::text[], '5', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/williams-ford-access',
    12.2, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 4. Moon Valley Access (MDC) — Mile 22.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Moon Valley Access', 'moon-valley',
    ST_SetSRID(ST_MakePoint(-92.8827, 37.7023), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'MDC access purchased in 1971. Gravel ramp and parking lot. Popular put-in for floats to Bennett Spring area.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking lot. Room for approximately 10-15 vehicles.',
    'From Bennett Spring State Park, take Route OO south 1.50 miles, then Moon Valley Road west 1.50 miles just across a low-water bridge.',
    'Gravel boat ramp. No restrooms, no water, no camping.',
    false, ARRAY['gravel_maintained']::text[], '15', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/moon-valley-access',
    22.3, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 5. Cat Hollow / Coastal Country Resort (Private) — near Mile 27
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Cat Hollow (Coastal Country Resort)', 'cat-hollow',
    ST_SetSRID(ST_MakePoint(-92.8910, 37.7369), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Privately owned campground and river access (formerly Fort Niangua River Resort). Over 200 acres with half a mile of Niangua River frontage. River access for guests only. Cabins, trailers, RV park, and primitive camping.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Private parking for campground guests.',
    'From Bennett Springs, 3 miles west on Hwy 64 to Cat Hollow Trail. Check in at main building.',
    'Modern cabins (heated/AC), trailers, RV park with hookups, primitive campgrounds. Restrooms and showers.',
    true, 'Campground fees apply. River access for guests only.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://www.coastalcountryresort.com/',
    27.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 6. Bennett Spring State Park — Mile 29
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Bennett Spring State Park', 'bennett-spring',
    ST_SetSRID(ST_MakePoint(-92.8613, 37.7337), 4326),
    'park', ARRAY['park', 'campground', 'boat_ramp'], true, 'state_park',
    'Missouri''s premier spring and trout park. First-magnitude spring producing over 100 million gallons daily at constant 58F. 3,338-acre park with camping, cabins, dining lodge, nature center, and 12 miles of hiking trails. Major landmark and popular base camp for Niangua floats.',
    ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic'],
    'Multiple large paved parking areas. Can fill on busy summer weekends.',
    'From Lebanon, take Highway 64 west 12 miles to the park. Well-signed from I-44.',
    'Full-service: campgrounds (5 areas, electric/water hookups), cabins, dining lodge, park store, nature center, shower houses, fish cleaning stations.',
    true, 'State park entrance fee. Camping and cabin fees vary by season.',
    ARRAY['paved']::text[], '50+', 'State Park',
    'https://mostateparks.com/park/bennett-spring-state-park',
    29.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 7. Bennett Spring Access (MDC) — Mile 30.2
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Bennett Spring Access (MDC)', 'bennett-spring-mdc',
    ST_SetSRID(ST_MakePoint(-92.8636, 37.7420), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'MDC-managed 178-acre access just across the Niangua River bridge on Hwy 64. Wade and float fishing access. White Ribbon Trout Area with stocked brown and rainbow trout. Day use only. Primary put-in/take-out for Bennett Spring area floats.',
    ARRAY['parking', 'restrooms', 'boat_ramp'],
    'Large paved parking lot. Accommodates vehicles with trailers.',
    'From Lebanon, take Highway 64 west 12 miles; the access is just across the Niangua River Bridge.',
    'Large parking lot, concrete boat ramp, vault toilets (multiple privies). Day use only.',
    false, ARRAY['paved']::text[], '30', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/bennett-spring-access',
    30.2, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 8. Hidden Valley Outfitters (Private) — near Mile 30.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Hidden Valley Outfitters', 'hidden-valley-outfitters',
    ST_SetSRID(ST_MakePoint(-92.8592, 37.7386), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Private campground and float trip outfitter right next to Bennett Spring State Park. Canoe, kayak, raft, and tube rentals with shuttle service. Family-friendly resort with campsites, trading post food, and cabins.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Private campground parking for guests.',
    'From I-44 & MO-5/MO-64, north 1 mi on MO-5/MO-64, then west 14 mi on MO-64W, then north on Marigold Dr. Address: 27101 Marigold Dr, Lebanon, MO 65536.',
    'Tent sites, RV hookups, cabins. Restrooms, showers, trading post with food.',
    true, 'Rental and camping fees apply. Float trip packages available.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://www.hvoutfitters.com/',
    30.5, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 9. Riverfront Campground & Canoe (Private) — near Mile 31
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Riverfront Campground & Canoe', 'riverfront-campground',
    ST_SetSRID(ST_MakePoint(-92.8708, 37.7402), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Over 200 acres fronting one mile of Niangua River. Adjacent to Bennett Spring State Park. Family-owned since 1994. Raft, canoe, kayak, and tube rentals with 5-mile and 8-mile float options. 15 rental cabins.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking. Multiple areas throughout property.',
    'From Hwy 65 and 64 junction, drive east on Hwy 64 for 17 miles. 1/4 mile west of Bramwell entrance to Bennett Spring SP. Address: 13 Riverfront Trail, Lebanon, MO 65536.',
    'Primitive campsites, full-hookup RV sites, 15 rental cabins. Hot showers, pool, hot tub, bar. UTV rentals.',
    true, 'Rental and camping fees apply. Multiple float trip packages.',
    ARRAY['paved', 'gravel_maintained']::text[], '50+', 'Private',
    'https://riverfrontcampcanoe.com/',
    31.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 10. NRO (Niangua River Oasis) Campground (Private) — near Mile 33
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Niangua River Oasis (NRO)', 'nro-campground',
    ST_SetSRID(ST_MakePoint(-92.8780, 37.7659), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Full-service canoe outfitter since 1977. Over 60 acres on the Niangua River. Canoes, rafts, tubes, and kayaks with shuttle. 2 nights free camping with boat rental. 4 miles west of Bennett Spring State Park.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking. Multiple camping areas (A is party, C is family).',
    'Route 64 to Corkery Road, follow NRO signs 1.1 miles. Address: 171 NRO Rd, Lebanon, MO 65536.',
    'Tent sites, RV sites (30/50 amp with water hookup), dump station, guesthouses, cabins. RV sites not on river.',
    true, '2 nights camping free with boat rental. Additional nights $15/person/night. Children 7 and under free.',
    ARRAY['paved', 'gravel_maintained']::text[], '30', 'Private',
    'https://nrocanoe.com/',
    33.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 11. Maggard Canoe & Corkery Campground (Private) — near Mile 34
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Maggard Canoe & Corkery Campground', 'maggard-corkery',
    ST_SetSRID(ST_MakePoint(-92.8752, 37.7715), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Float trips on the Niangua since 1972. Corkery Campground on the river banks below Bennett Springs. Canoe, kayak, raft, and tube rentals with shuttle.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Campground parking. Smaller operation, smaller trailers only.',
    'At Hwy 64 and Hwy 73 intersection, stay on Hwy 64 nine miles to Clyde''s Store. Left onto Corkery Rd, follow blacktop 4 miles. Address: 400 Corkery Rd, Lebanon, MO 65536.',
    'Tent sites. No dump station or sewer hookups. Smaller trailers only.',
    true, 'Rental and camping fees apply.',
    ARRAY['paved', 'gravel_maintained']::text[], '20', 'Private',
    'https://nianguariver.com/',
    34.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 12. Big Bear River Resort (Private) — near Mile 35
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Big Bear River Resort', 'big-bear-resort',
    ST_SetSRID(ST_MakePoint(-92.8760, 37.7750), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    '25-acre campground on the Niangua River. Name from Osage word "Niangua" meaning "bear." Open year-round. Canoe, raft, kayak, and tube rentals.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking for guests.',
    'Address: 372 Corkery Rd, Lebanon, MO 65536.',
    'Riverfront primitive campsites, RV hookups, dry and wet cabins. Hot showers, clean bathrooms.',
    true, 'Camping and rental fees apply. Year-round operation.',
    ARRAY['paved', 'gravel_maintained']::text[], '20', 'Private',
    'https://bigbearriverresort.com/',
    35.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 13. Barclay Conservation Area Access (MDC) — Mile 36.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Barclay Conservation Area Access', 'barclay-access',
    ST_SetSRID(ST_MakePoint(-92.8671, 37.7919), 4326),
    'access', ARRAY['access', 'boat_ramp'], true, 'MDC',
    'MDC conservation area, 426 acres, 1.7 miles of Niangua River frontage. Dedicated 2001 with concrete boat ramp and canoe launch. White Ribbon Trout Area. Very good brown trout, bass, sunfish. Popular take-out 7 miles from Bennett Spring Access.',
    ARRAY['parking', 'boat_ramp'],
    'Paved/gravel parking lot. 15-20 vehicles with trailers.',
    'From Bennett Spring State Park, Hwy 64 west 3.70 miles, Corkery Road north 3 miles, Barclay Springs Road east.',
    'Concrete boat ramp, gravel bar canoe launch, parking lot. No restrooms, no camping.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '20', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/barclay-conservation-area',
    36.5, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 14. Mountain Creek Family Resort (Private) — near Mile 38
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Mountain Creek Family Resort', 'mountain-creek-resort',
    ST_SetSRID(ST_MakePoint(-92.8374, 37.8006), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Eco-resort stretching over half a mile along the Niangua at the mouth of Mountain Creek. Canoe, kayak, tube rentals with 11.5-mile float from Bennett Spring. Waterslides and beach access.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking for guests.',
    'Address: 11564 Kinfolk Road, Eldridge, MO 65463. From Lebanon, Hwy 64 west, Route AA north, then Kinfolk Road.',
    'Tent sites, electric hookup sites, 8-person cabins, waterslides, beach. Open for fall hunting season.',
    true, 'Camping and rental fees apply. Float trip packages available.',
    ARRAY['paved', 'gravel_maintained']::text[], '25', 'Private',
    'https://www.mountaincreekfamilyresort.com/',
    38.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 15. Prosperine Access (MDC) — Mile 40
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Prosperine Access', 'prosperine',
    ST_SetSRID(ST_MakePoint(-92.8363, 37.7984), 4326),
    'access', ARRAY['access'], true, 'MDC',
    'MDC access purchased in 1961 at the mouth of Mountain Creek. 7.5-acre site. Gravel bar with swimming hole upstream and rocky riffle below. Private campground adjacent. End of White Ribbon Trout Area. Good trout, smallmouth bass, suckers, sunfish.',
    ARRAY['parking'],
    'Gravel parking area. ~10 vehicles.',
    'From Lebanon, Hwy 64 west 2 miles, Route AA north 12 miles until blacktop ends, Kinfolk Road west 4.50 miles. Watch for cantilever sign.',
    'Gravel bar access. No restrooms, no water on site.',
    false, ARRAY['paved', 'gravel_maintained', 'gravel_unmaintained']::text[], '10', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/prosperine-access',
    40.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 16. Lead Mine Conservation Area (MDC) — Mile 52
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Lead Mine Conservation Area', 'lead-mine',
    ST_SetSRID(ST_MakePoint(-92.9076, 37.8473), 4326),
    'access', ARRAY['access', 'boat_ramp', 'campground'], true, 'MDC',
    'Large 7,761-acre MDC area with ~2 miles of Niangua River frontage and 3.5 miles of Jakes Creek. Purchased 1965. Concrete and gravel boat ramps. 23 miles of multi-use trails. 5 free primitive camping areas (14-day limit). Contains Niangua River Hills Natural Area. Better canoe access at Herrick Ford (mile 54.3) gravel bar downstream.',
    ARRAY['parking', 'boat_ramp', 'camping'],
    'Multiple gravel parking areas. Main lot holds 15-20 vehicles.',
    'From Plad, west on Hwy 64, north on Route T, 0.5 mi east on Route YY (SW access). From Lebanon, north on Hwy 5 to Route E, becomes Bluff Trail at pavement end, 0.25 mi (NE access).',
    'Concrete and gravel boat ramps, 5 primitive camping areas (free, 14-day limit), 23 miles trails. No water or electric. Contact: (417) 532-7612.',
    false, ARRAY['paved', 'gravel_maintained', 'gravel_unmaintained']::text[], '20', 'MDC',
    'https://mdc.mo.gov/discover-nature/places/lead-mine-conservation-area',
    52.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 17. Tunnel Dam / Lake Niangua — Mile 66
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Tunnel Dam (Lake Niangua)', 'tunnel-dam',
    ST_SetSRID(ST_MakePoint(-92.8514, 37.9369), 4326),
    'boat_ramp', ARRAY['boat_ramp', 'access'], true, 'private',
    'Hydroelectric dam creating 360-acre Lake Niangua. Public boat ramp on west side. WARNING: Often NO water between dam and powerhouse (~6 miles). End float here unless water confirmed below dam. Lake is shallow (larger boats cannot access). Owned by Sho-Me Power (FERC #2561), surrendering license but keeping dam/lake open.',
    ARRAY['parking', 'boat_ramp', 'picnic'],
    'Parking lot at boat ramp and picnic area.',
    'Near Macks Creek in southern Camden County, off State Road U.',
    'Boat ramp, picnic area. No camping at dam/lake access.',
    false, ARRAY['paved', 'gravel_maintained']::text[], '15', 'Private',
    'https://www.shomepower.com/about-sho-me/niangua-river-dam',
    66.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 18. Whistle Bridge — Mile 68
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id, 'Whistle Bridge', 'whistle-bridge',
    ST_SetSRID(ST_MakePoint(-92.8343, 37.9410), 4326),
    'bridge', ARRAY['bridge', 'access'], true, 'county',
    'Low-lying concrete causeway on Tunnel Dam Road, 0.5 mi north of Edith, MO. Only usable when dry channel below Tunnel Dam has water. Good gravel area. 13.3 miles downstream to Ha Ha Tonka State Park.',
    ARRAY['parking'],
    'Roadside parking near crossing. Very limited.',
    'Junction of Whistle Road and Tunnel Dam Road, near Edith, MO, off State Road U (meets Hwy 54 between Camdenton and Macks Creek).',
    'Low-water crossing only. No amenities.',
    false, ARRAY['gravel_maintained']::text[], '5', 'County',
    68.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 19. Mother Nature's Riverfront Retreat (Private) — near Mile 70
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Mother Nature''s Riverfront Retreat', 'mother-natures-retreat',
    ST_SetSRID(ST_MakePoint(-92.8240, 37.9550), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    '300-acre campground, concert venue, and float operation on Big Niangua channel. ~2 miles float from Whistle Bridge. Previously Tunnel Dam Gardens (since 1999). Float trips, camping, camper rentals, RV hookups, lodge, bunkhouse.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic'],
    'Campground parking. Ample space on 300-acre property.',
    'Off Tunnel Dam Road in Camden County, 1 mi down Gardens Road at Tunnel Dam Garden Center sign. Address: 878 Gardens Rd, Macks Creek, MO 65786.',
    'Campgrounds, camper rentals, RV hookups, lodge, bunkhouse. Convenience store, canoe/kayak rental, shuttle, shower house.',
    true, 'Camping and rental fees apply. Beach pass fees may apply.',
    ARRAY['gravel_maintained']::text[], '50+', 'Private',
    'https://mothernaturesriverfrontretreat.com/',
    70.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 20. Riverbend RV Park and Campground (Private) — near Mile 71
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    river_mile_downstream, approved
)
SELECT
    r.id, 'Riverbend RV Park and Campground', 'riverbend-rv-park',
    ST_SetSRID(ST_MakePoint(-92.8180, 37.9600), 4326),
    'campground', ARRAY['campground', 'access'], false, 'private',
    'Small owner-operated campground high above the Niangua, below Tunnel Dam. 23 acres with 250 ft of river frontage. Hike down the hill to river access.',
    ARRAY['parking', 'restrooms', 'camping'],
    'Campground parking. Space for RVs and trailers.',
    'Address: 309 Prater Homestead Ln, Macks Creek, MO 65786. WARNING: Do not follow GPS blindly; use directions from campground.',
    'Full-hookup RV spots, primitive tent sites. Shower house. 10 RV/tent, 3 tent, 12 full hookup sites. Fire ring and picnic table each.',
    true, 'RV/tent $26-32/night (4 guests). Tent $18-25/night.',
    ARRAY['gravel_maintained', 'gravel_unmaintained']::text[], '15', 'Private',
    71.0, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- 21. Ha Ha Tonka State Park — Mile 79.5 (river meets Lake of the Ozarks)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_downstream, approved
)
SELECT
    r.id, 'Ha Ha Tonka State Park', 'ha-ha-tonka',
    ST_SetSRID(ST_MakePoint(-92.7683, 37.9595), 4326),
    'park', ARRAY['park', 'access'], true, 'state_park',
    'State park where the Niangua merges into Lake of the Ozarks. Kayak launch with steps and rail at spring area. Big Niangua River Trail (13.3-mile paddle upstream to Whistle Bridge). Boat dock from Lake of the Ozarks at 14.5-mile marker. Famous castle ruins, spring, geology.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Multiple parking areas. Spring parking lot for kayak launch.',
    'State Highway D south from Camdenton. Kayak launch: Tonka Spring Road, left from spring parking lot at Lakeside Picnic Shelter.',
    'Kayak steps and launch rail, boat docks (24-ft limit), restrooms, hiking trails, nature exhibits. No camping.',
    false, ARRAY['paved']::text[], '50+', 'State Park',
    'https://mostateparks.com/park/ha-ha-tonka-state-park',
    79.5, true
FROM rivers r WHERE r.slug = 'niangua'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- ============================================
-- BIG PINEY RIVER ACCESS POINTS
-- Sources: MDC, USFS (Mark Twain NF / Houston-Rolla-Cedar Creek Ranger District),
--          FloatMissouri, MCFA, Paddling.com, SouthwestPaddler, BSC Outdoors
-- River flows generally south-to-north through Texas and Pulaski counties,
-- joining the Gasconade River near Jerome. ~90 floatable miles.
-- ============================================

-- Baptist Camp Access (MDC) — Mile 0.0 (uppermost public access)
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Baptist Camp Access',
    'baptist-camp',
    ST_SetSRID(ST_MakePoint(-92.0185, 37.2579), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'Uppermost public put-in on the floatable Big Piney River at mile 0.0. Forested MDC area with low-water bridge and canoe/kayak access. Start of the good smallmouth bass fishing on the upper river. The gradient from here to Boiling Spring is 4.2 ft/mile — relatively swift with riffles. The river is narrow and scenic through this stretch with overhanging trees and small bluffs.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Gravel parking lot with space for approximately 10 vehicles and trailers.',
    'From Houston, take Highway 63 south 6 miles, then Route RA west 1 mile. Mailing address: Simmons, MO 65689.',
    'Privy (vault toilet), picnic area, low-water bridge. No drinking water. No boat ramp — carry-in access at low-water bridge.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/baptist-camp-access',
    0.0,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Dogs Bluff Access (MDC) — Mile ~8.5
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Dogs Bluff Access',
    'dogs-bluff',
    ST_SetSRID(ST_MakePoint(-92.0022, 37.3267), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access with concrete boat ramp on the Big Piney River, 3 miles west of Houston. Popular summer swimming hole with scenic bluffs. Good fishing for bass and sunfish. Picnic area with privy.',
    ARRAY['parking', 'restrooms', 'picnic', 'boat_ramp'],
    'Paved/gravel parking area with space for vehicles and trailers.',
    'From Houston, take Highway 17 west 3 miles. Well-signed. MDC maintained concrete ramp.',
    'Concrete boat ramp, picnic area, privy (vault toilet). No drinking water.',
    false,
    'No fee.',
    ARRAY['paved']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/dogs-bluff-access',
    8.5,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Mineral Springs Access (MDC) — Mile 14.6
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Mineral Springs Access',
    'mineral-springs',
    ST_SetSRID(ST_MakePoint(-91.9880, 37.3440), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at mile 14.6 with concrete boat ramp. 6.3-acre area on the Big Piney River near Houston. Mineral Spring is 0.5 mile up a branch. Horseshoe Bend Natural Area is across the river. Good fishing for bass and sunfish. Popular put-in for the long 40-mile run to Ross Access.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel/paved parking area for vehicles and trailers.',
    'From Highway 63 at the north Houston city limit, take Oak Hill Drive west, then Forest Drive west, then Mineral Drive north 2 miles to the access. Houston, MO 65483.',
    'MDC maintained concrete boat ramp. No restrooms on-site. No drinking water.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/mineral-springs-access',
    14.6,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Sandy Shoals Ford — Mile 19.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Sandy Shoals Ford',
    'sandy-shoals-ford',
    ST_SetSRID(ST_MakePoint(-91.9740, 37.3780), 4326),
    'access',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water ford crossing at mile 19.3. Sand Shoals Road connects Hwy E on the east to Hwy AA on the west. Popular put-in for the scenic 6–8 mile float to Boiling Spring — one of the best day trips in Missouri. Up here the river is more like a swift creek with occasional Class II riffles, sheer bluffs rising overhead topped with pine trees. Dense foliage overhangs the channel providing great shade.',
    ARRAY['parking'],
    'Roadside pull-off parking near the ford. Limited — approximately 8–10 vehicles.',
    'Take Sand Shoals Road from either Hwy E (east) or Hwy AA (west). The road crosses the Big Piney at a low-water ford. Gravel road; passable by passenger vehicles in dry conditions.',
    'No facilities. Low-water ford — may be impassable during high water.',
    false,
    'No fee.',
    ARRAY['gravel_maintained']::text[],
    '10',
    19.3,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Boiling Spring Access (MDC) — Mile 25.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Boiling Spring Access',
    'boiling-spring',
    ST_SetSRID(ST_MakePoint(-91.9700, 37.4350), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'MDC',
    'MDC access at mile 25.8 with concrete boat ramp and picnic area. Famous for Boiling Spring — a massive spring at river level pumping roughly 10 million gallons per day at a constant 50 degrees F. Classic swimming hole and rope swing at the spring pool. Common take-out for the popular Sandy Shoals to Boiling Spring day float. Also serves as a put-in for floats downstream toward Mason Bridge and Slabtown. The Resort at Boiling Springs (private campground/RV park with cabins, canoe rentals, and shuttle) is adjacent.',
    ARRAY['parking', 'picnic', 'boat_ramp'],
    'Gravel/paved parking area with space for vehicles and trailers.',
    'From Licking, take Highway 32 west, then Route BB west approximately 7 miles to the Big Piney River. Address: 15268 Hwy 32, Licking, MO 65542. Open 4 AM – 10 PM; fishing/boating 24 hrs.',
    'MDC maintained concrete boat ramp. Picnic area. No restrooms at the MDC access. No drinking water.',
    false,
    'No fee at MDC access. The Resort at Boiling Springs (adjacent private campground) charges for camping and canoe rentals.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '15',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/boiling-spring-access',
    25.8,
    true,
    '[{"name": "The Resort at Boiling Springs", "type": "campground", "phone": "(573) 889-9085", "website": "https://resortatboilingsprings.com/", "distance": "Adjacent", "notes": "Private campground and RV park with 34 full RV hookups (30/50 amp), two furnished cabins, primitive tent camping, in-ground pool, sports bar, general store, restaurant, shower houses, free WiFi. Canoe/kayak rentals and shuttle service. Float trips 5–25+ miles. Address: 15750 Highway BB, Licking, MO 65542."}]'::jsonb
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Mason Bridge Access (MDC) — Mile 31.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Mason Bridge Access',
    'mason-bridge',
    ST_SetSRID(ST_MakePoint(-91.9832, 37.5054), 4326),
    'access',
    ARRAY['access', 'boat_ramp', 'bridge'],
    true,
    'MDC',
    'MDC access at mile 31.8. 7-acre area with concrete boat ramp providing public access to the Big Piney River for canoeing and fishing. Located on Mason Bridge Road. Good bass and sunfish fishing. The river is getting wider and deeper through this section. About 8 miles downstream from Boiling Spring and 8 miles upstream from Slabtown.',
    ARRAY['parking', 'boat_ramp'],
    'Gravel parking area with space for approximately 10 vehicles and trailers.',
    'From Licking, take Highway 32 west 6 miles, then Mason Road north to the Big Piney River.',
    'MDC maintained concrete boat ramp. No restrooms. No drinking water.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/mason-bridge-access',
    31.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Warren Bridge — Mile 33.3
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Warren Bridge',
    'warren-bridge',
    ST_SetSRID(ST_MakePoint(-91.9900, 37.5200), 4326),
    'bridge',
    ARRAY['access', 'bridge'],
    true,
    'county',
    'Low-water bridge crossing at mile 33.3. Road connects Hwys FF and H. Excellent swimming hole below the bridge. Informal access — usable as a put-in or take-out but no developed facilities. About 1.5 miles downstream from Mason Bridge.',
    ARRAY['parking'],
    'Roadside pull-off parking. Limited — approximately 5 vehicles.',
    'The road connecting Hwy FF and Hwy H crosses the Big Piney at a low-water bridge. Gravel road.',
    'No facilities. Low-water crossing — may be impassable in high water.',
    false,
    ARRAY['gravel_maintained']::text[],
    '5',
    33.3,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Slabtown Recreation Area (USFS) — Mile 39.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Slabtown Recreation Area',
    'slabtown',
    ST_SetSRID(ST_MakePoint(-92.0321, 37.5615), 4326),
    'campground',
    ARRAY['access', 'campground'],
    true,
    'USFS',
    'First Forest Service access on the Big Piney at mile 39.8. Small, quiet USFS campground and river access with 5 primitive tent-only campsites. Start of the Smallmouth Bass Special Management Area (1 smallmouth, 15-inch minimum, downstream to Gasconade confluence). Popular put-in for the 6-mile float to Horse Camp or 10-mile float to Ross Bridge. 1-mile Slabtown Bluff Trail winds through hardwoods with river overlooks (best fall–spring). Downriver from here the river is narrower and shallower with multiple riffles.',
    ARRAY['parking', 'camping', 'picnic'],
    'Boat launch parking for 3 vehicles with trailers. Picnic/camping area fits 8 vehicles. Total capacity approximately 11 vehicles.',
    'From Roby, MO, take Highway 17 north 1.5 miles to County Road 800, turn right and travel 7 miles on gravel road. When you pass the Big Piney Bridge, the road turns to asphalt. Slabtown is on the right just past the bridge. Last stretch is gravel.',
    '5 primitive tent camping sites with picnic tables and fire rings. Vault toilet (accessible). No drinking water. No boat ramp — carry-in access. 1-mile Slabtown Bluff Trail. First-come, first-served. Tent camping only.',
    false,
    'No fee at any Forest Service managed sites along the Big Piney.',
    ARRAY['paved', 'gravel_unmaintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/slabtown-recreation-area',
    39.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Horse Camp Access (USFS) — Mile ~45.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Horse Camp Access',
    'horse-camp',
    ST_SetSRID(ST_MakePoint(-92.0425, 37.6435), 4326),
    'access',
    ARRAY['access', 'campground'],
    true,
    'USFS',
    'USFS river access approximately 6 miles downstream from Slabtown. Located near the Big Piney Equestrian Camp — one of 3 trailheads for the 18-mile Big Piney Trail through Paddy Creek Wilderness. The equestrian camp has 5 sites designed for horse trailers with picnic tables, fire rings, and highline posts. Road dead-ends at the river access past the horse camp. Common take-out for the 6-mile float from Slabtown.',
    ARRAY['parking', 'camping'],
    'Parking area at the trailhead/equestrian camp with space for horse trailers. Approximately 8–10 vehicle/trailer spots.',
    'From Licking, take Hwy 32 west 4 miles to Hwy N, turn right on Hwy N and go 2 miles to Hwy AF, turn left onto Hwy AF and travel 5 miles to Slabtown Road, continue straight past the asphalt for 1.5 miles. Road dead-ends at the river.',
    'Equestrian camp with 5 campsites (picnic tables, fire rings, highline posts). Trail register station. No drinking water. No vault toilet at river access. Big Piney Trail trailhead.',
    false,
    'No fee.',
    ARRAY['gravel_maintained', 'gravel_unmaintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/big-piney-equestrian-camp',
    45.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Wilderness Ridge Resort (Private) — Mile ~50
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Wilderness Ridge Resort',
    'wilderness-ridge-resort',
    ST_SetSRID(ST_MakePoint(-91.8920, 37.6410), 4326),
    'campground',
    ARRAY['campground', 'access'],
    false,
    'private',
    'Private resort and campground on the Big Piney River near Duke, MO. Offers canoe/raft/tube rentals, cabins, lodge, RV hookups, tent camping, and shuttle service. The campground sits on a bluff overlooking the Big Piney River. Relatively calm section of river, suitable for children and families. Close to Mark Twain National Forest and Paddy Creek Wilderness.',
    ARRAY['parking', 'restrooms', 'camping', 'picnic', 'boat_ramp', 'store'],
    'Large resort parking lot. Ample space for vehicles and trailers.',
    'From the north, take Hwy 63 south 23 miles to Hwy K, turn left on Hwy K and go through Duke. Address: 33850 Windsor Ln, Duke, MO 65461. Approximately 80 miles from Springfield, 100 miles from St. Louis.',
    'Lodge, cabins (A/C, linens, dishes, fridge, stove), RV sites with electric and water hookups, tent camping with fire rings and picnic tables. General amenities on a bluff overlooking the river.',
    true,
    'Canoe/raft/tube rental fees. Camping fees vary by site type. Launch fee for non-guests.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '30',
    'Private',
    'https://www.wildernessridgeresort.com/',
    50.0,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Peck's Last Resort (Private) — Mile ~51
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Peck''s Last Resort',
    'pecks-last-resort',
    ST_SetSRID(ST_MakePoint(-91.8880, 37.6440), 4326),
    'campground',
    ARRAY['campground', 'access'],
    false,
    'private',
    'Family-owned private campground and canoe outfitter on the Big Piney River near Duke, MO. Formerly known as Rich''s Last Resort. Offers camping, cabins, canoe/kayak/raft rentals, and shuttle service. Beautiful Missouri Ozark landscape. Note: cell service drops out about 20 minutes before arriving.',
    ARRAY['parking', 'camping', 'picnic', 'boat_ramp'],
    'Resort parking area.',
    'Address: 33401 Windsor Ln, Duke, MO 65461. Write down directions as cell service is lost before arrival. About 2.5 hours from Columbia, MO.',
    'Camping, cabins, canoe/kayak/raft rentals, fishing access.',
    true,
    'Camping and rental fees apply. Contact for current rates.',
    ARRAY['gravel_maintained']::text[],
    '15',
    'Private',
    'https://www.peckslastresort.com/',
    51.0,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Ross Access (MDC) — Mile ~54.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Ross Access',
    'ross-bridge',
    ST_SetSRID(ST_MakePoint(-91.8680, 37.6510), 4326),
    'access',
    ARRAY['access'],
    true,
    'MDC',
    'MDC access at approximately mile 54.8. Mostly forested gravel bar area providing access for floating and fishing. LAST TAKE-OUT before the river enters Fort Leonard Wood military reservation — no public access is permitted through the base. The 15-mile stretch from Slabtown to Ross is the core of the Smallmouth Bass Special Management Area (1 smallmouth, 15-inch minimum). After Ross, the river begins to get wider and deeper. From here the river enters Fort Leonard Wood for approximately 12 miles with no access.',
    ARRAY['parking'],
    'Gravel parking area.',
    'From Duke, take Route K west to Western Road, then Windsor Lane north 0.50 mile.',
    'Parking area. No restrooms. No drinking water. No boat ramp — gravel bar access. Open 4 AM – 10 PM; fishing/hunting/boating allowed 24 hrs.',
    false,
    'No fee.',
    ARRAY['gravel_maintained']::text[],
    '10',
    'MDC',
    'https://mdc.mo.gov/discover-nature/places/ross-access',
    54.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- East Gate Access (USFS) — Mile ~66.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'East Gate Access',
    'east-gate',
    ST_SetSRID(ST_MakePoint(-92.0583, 37.7603), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'USFS',
    'USFS river access at approximately mile 66.8 near Fort Leonard Wood''s East Gate entrance. Only developed Forest Service access in Pulaski County. Primary put-in/take-out for private recreationists and Fort Leonard Wood military personnel. The 12-mile stretch upstream from Ross Bridge passes entirely through Fort Leonard Wood — this is the first public access below the base. USGS gauge station nearby (06930000). East Gate Fort Wood Campground is on the left bank at the bridge (mile 66.5). Short 3-mile float downstream to Crossroads Access, or 11-mile float to Bookers Bend.',
    ARRAY['parking', 'boat_ramp'],
    'Small gravel parking area. Space for approximately 5–8 vehicles with trailers.',
    'Make a slight right onto East Gate Road and drive 1 mile. Access site is on the right, before the bridge. Located approximately 15 miles southeast of Waynesville.',
    'Single-lane gravel boat launch. No restrooms. No drinking water.',
    false,
    'No fee at any Forest Service managed sites along the Big Piney.',
    ARRAY['gravel_maintained']::text[],
    '10',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recarea/?recid=21814',
    66.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Crossroads Access (USFS) — Mile ~69.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Crossroads Access',
    'crossroads',
    ST_SetSRID(ST_MakePoint(-92.0780, 37.7550), 4326),
    'access',
    ARRAY['access'],
    true,
    'USFS',
    'USFS carry-in access at approximately mile 69.8. Provides parking and a 100-foot trail to the Big Piney River for canoeing and fishing — you must carry canoes/kayaks down the trail. Day use only — no overnight camping. 3-mile paddle downstream from East Gate, or 8 miles upstream from Bookers Bend. River has varying runs and riffles with mostly gravel bottom.',
    ARRAY['parking'],
    'Gravel parking area for day use.',
    'Take exit 169 for Hwy J, follow Hwy J to the left/south for 10 miles. At the junction of J Highway and M Highway, go past about 300 feet. Crossroads Access is on the right.',
    'Carry-in access only — 100-foot trail to the river. No restrooms. No drinking water. Day use only — no overnight camping.',
    false,
    'No fee.',
    ARRAY['paved', 'gravel_maintained']::text[],
    '5',
    'USFS',
    'https://www.fs.usda.gov/r09/marktwain/recreation/crossroads-access',
    69.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Bookers Bend Access (USFS) — Mile ~77.8
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity, managing_agency,
    official_site_url, river_mile_upstream, approved
)
SELECT
    r.id,
    'Bookers Bend Access',
    'bookers-bend',
    ST_SetSRID(ST_MakePoint(-92.1020, 37.7830), 4326),
    'access',
    ARRAY['access', 'boat_ramp'],
    true,
    'USFS',
    'USFS river access at approximately mile 77.8 — the last Forest Service access on the Big Piney before the Gasconade confluence. Thomas Lane dead-ends at Bookers Bend. Single-lane gravel boat launch. The river here is deeper, slower moving, and wider than upstream sections. Smallmouth bass special management area. 8 miles downstream from Crossroads, 11 miles from East Gate. From here, 8 more miles to the Gasconade River confluence. Most land along this stretch is private — stay aware of property boundaries if stopping.',
    ARRAY['parking', 'boat_ramp'],
    'Small gravel parking area. Limited — approximately 5 vehicles.',
    'Approximately 4 miles west of Hwy J on Forest Service Road 1730. Thomas Lane dead-ends at the access.',
    'Single-lane gravel boat launch. No restrooms. No drinking water.',
    false,
    'No fee.',
    ARRAY['gravel_unmaintained']::text[],
    '5',
    'USFS',
    'https://www.fs.usda.gov/recarea/mtnf/recreation/recarea/?recid=84142',
    77.8,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Devil's Elbow / Highway V Bridge — Mile 82.4
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Devil''s Elbow (Highway V Bridge)',
    'devils-elbow',
    ST_SetSRID(ST_MakePoint(-92.0960, 37.8170), 4326),
    'bridge',
    ARRAY['bridge'],
    false,
    'private',
    'Historic Highway V bridge crossing at Devil''s Elbow, mile 82.4. NO PUBLIC ACCESS at the bridge itself. This is on the famous Route 66 corridor. The old steel truss bridge is a popular Route 66 landmark. BSC Outdoors operates a private put-in called Piney Landing nearby for their 5-mile float trip to the Gasconade confluence. Shanghai Spring (Blue Spring) is 2.4 miles upstream at mile 80.0 — a massive spring comparable to Boiling Spring.',
    ARRAY[]::text[],
    'No public parking at bridge.',
    'Hwy V at Devil''s Elbow, Pulaski County. The village of Devil''s Elbow is a historic Route 66 community.',
    'No public facilities. Historic Route 66 bridge. Private access only through BSC Outdoors.',
    false,
    'Private access only through outfitters.',
    ARRAY['paved']::text[],
    'limited',
    82.4,
    true,
    '[{"name": "BSC Outdoors / Boiling Spring Campground", "type": "outfitter", "phone": "(573) 759-7294", "website": "https://www.bscoutdoors.com/", "distance": "3 miles", "notes": "Offers 5-mile float from Piney Landing at Devil''s Elbow to BSC on the Gasconade, or 8-mile float from Blue Spring to BSC. Campground on the Gasconade with full facilities. Address: 18700 Cliff Rd, Dixon, MO 65459."}]'::jsonb
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Old Route 66 Bridge — Mile 82.9
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved
)
SELECT
    r.id,
    'Old Route 66 Bridge',
    'old-route-66-bridge',
    ST_SetSRID(ST_MakePoint(-92.0940, 37.8210), 4326),
    'bridge',
    ARRAY['bridge'],
    false,
    'private',
    'Old Route 66 bridges at mile 82.9. Private access on left bank below bridge. No public access. The Big Piney River is nearing its confluence with the Gasconade River (3 miles downstream). I-44 bridges are at mile 83.2 with no access.',
    ARRAY[]::text[],
    'No public parking.',
    'Historic Route 66 near Devil''s Elbow, Pulaski County.',
    'No public facilities. Private access only.',
    false,
    'Private access only.',
    ARRAY['paved']::text[],
    'limited',
    82.9,
    true
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

-- Gasconade River Confluence — Mile 85.7
INSERT INTO access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    description, amenities, parking_info, road_access, facilities,
    fee_required, fee_notes, road_surface, parking_capacity,
    river_mile_upstream, approved,
    nearby_services
)
SELECT
    r.id,
    'Gasconade River Confluence',
    'gasconade-confluence',
    ST_SetSRID(ST_MakePoint(-92.0710, 37.8360), 4326),
    'access',
    ARRAY['access'],
    false,
    'private',
    'Junction of the Big Piney River with the Gasconade River at mile 85.7 near Jerome, MO. Private access on right bank with lodging, refreshments, and parking available. End of the Big Piney River. From here, floaters continue downstream on the Gasconade River where additional public access points exist. BSC Outdoors take-out is on the Gasconade near here.',
    ARRAY['parking'],
    'Private parking available.',
    'Near Jerome, MO, off I-44. Private access — contact outfitters for arrangements.',
    'Private access point. Lodging, refreshments available through private operators.',
    true,
    'Private access fees apply.',
    ARRAY['paved']::text[],
    '10',
    85.7,
    true,
    '[{"name": "BSC Outdoors / Boiling Spring Campground", "type": "outfitter", "phone": "(573) 759-7294", "website": "https://www.bscoutdoors.com/", "distance": "At confluence", "notes": "BSC Outdoors on the Gasconade near the Big Piney confluence. Full-service campground with RV sites, tent camping, cabins, store, and float trip services."}]'::jsonb
FROM rivers r WHERE r.slug = 'big-piney'
ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved;

