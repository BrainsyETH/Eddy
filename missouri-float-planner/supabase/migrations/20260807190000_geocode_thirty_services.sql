-- 30 services geocoded. Directory coverage 63 -> 93 of 156.
--
-- ── WHAT CHANGED, AND WHY IT WORKED THIS TIME ─────────────────────────────
--
-- The previous sweeps accepted a candidate only if it landed within 12 miles of
-- the row's recorded postal town. That test is the reason they stalled: the
-- recorded town is often wrong. 20260807024722 documents three cases of it —
-- Akers and Pulltite are filed under Salem and sit 18 and 22 miles away; Big
-- Spring Lodge is filed under Van Buren. All three were correct businesses that
-- the automated run threw out on a bad yardstick.
--
-- Eddy holds a better fact about these rows than their mailing address: WHICH
-- RIVER THEY SERVE, via service_rivers, against full PostGIS geometry in
-- rivers.geom. A float outfitter, campground or riverside cabin is near its
-- river — that is what makes it a float business. Calibrated against the 63 rows
-- that already had coordinates: median 0.12 mi from their river, p95 0.91 mi.
--
-- So the acceptance test is now distance to the LINKED RIVER, not to the town.
--
-- ── THE THRESHOLD IS 10 MILES, AND IT IS NOT A GUESS ──────────────────────
--
-- A tight bound throws away correct answers. Of the 30 rows below, 6 sit more
-- than a mile from their river and every one of them is right — an outfitter
-- based in town that shuttles to the water is still what somebody is looking
-- for. Ten miles also still rejects every false match this project has measured:
-- Camp River -> Two Rivers at 35 mi, Story's Creek -> Brazil Creek at 60 mi,
-- Ruby's Landing -> Twin Rivers at 71 mi. It clears those by 3.5x.
--
-- Result across the 30: all 30 landed on the river the service is linked to.
-- 24 within 0.7 mi, 5 between 2.2 and 6.4 mi, 1 at 10.6 mi (Wild Bill's
-- Outfitter, which is a Yellville storefront that shuttles to Crooked Creek).
--
-- ── SOURCES, ALL FREE AND KEYLESS ─────────────────────────────────────────
--
--   operator_site          14  coordinates the business publishes on its own
--                              site — schema.org geo, an embedded map, or a
--                              directions link
--   census                  7  US Census geocoder on the street address already
--                              in the row. Public domain, no key, no ToS limit
--                              on storing what it returns
--   operator_site+census    2  street address discovered on the operator's site,
--                              then geocoded
--   osm                     7  Nominatim, by address or business name
--
-- 23 exact, 7 approximate. NO ROW IS A TOWN CENTROID — `centroid` stays at 0,
-- and nothing here was back-filled from a ZIP or a city centre. The 63 rows this
-- pass could not resolve keep latitude NULL and stay reachable in the river
-- page's directory, which is where a service with no confirmed location belongs.
--
-- Every UPDATE is guarded on `latitude IS NULL` so a re-run cannot overwrite a
-- hand correction.

BEGIN;

-- Adventure River Resort (cabin_lodge) — nominatim_address, 0.06 mi from its river
UPDATE nearby_services SET latitude = 37.1537266, longitude = -91.3529167,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '91f8d358-a25d-4b0c-b671-f56076dd62d8' AND latitude IS NULL;

-- Bean Creek Cabins (cabin_lodge) — website_schema_geo, 0.65 mi from its river
UPDATE nearby_services SET latitude = 34.398349, longitude = -93.606593,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '56ed23f1-2d0a-4f0d-8ea9-00315f45ef61' AND latitude IS NULL;

-- Cass House (cabin_lodge) — website_schema_geo, 0.09 mi from its river
UPDATE nearby_services SET latitude = 35.6911, longitude = -93.8007,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = 'f14e344e-7c8b-4641-88dc-d5fa934f4943' AND latitude IS NULL;

-- Cobblestone Lodge (cabin_lodge) — website_address+census, 0.08 mi from its river
--   address found on operator site: 52 Cobblestone Lane
UPDATE nearby_services SET latitude = 37.984070971126, longitude = -91.370161718412,
  geocode_precision = 'exact', geocode_source = 'operator_site+census', geocoded_at = now()
 WHERE id = '3689ca30-404b-45f6-a66e-d8d4d8374c24' AND latitude IS NULL;

-- Cross Country Trail Rides (cabin_lodge) — website_maps_at, 0 mi from its river
UPDATE nearby_services SET latitude = 37.1540282, longitude = -91.3555306,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = 'e4bf2f59-2549-4828-b931-1c8a4c3a1afe' AND latitude IS NULL;

-- Eminence Cottages and Camp (cabin_lodge) — nominatim_name, 0.46 mi from its river
UPDATE nearby_services SET latitude = 37.1615161, longitude = -91.3574407,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '376d92dd-8528-4eae-b3ff-b5eec3f51145' AND latitude IS NULL;

-- Float the James / Horsecreek Ranch (cabin_lodge) — website_schema_geo, 0.08 mi from its river
UPDATE nearby_services SET latitude = 36.83637399999999, longitude = -93.47074599999999,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '8b66151d-2fe4-43a9-9c32-e21224263829' AND latitude IS NULL;

-- Hangout Properties LLC (cabin_lodge) — website_schema_geo, 0.3 mi from its river
UPDATE nearby_services SET latitude = 34.3271349, longitude = -93.5497446,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '3dec1150-9dd2-4122-8aa2-9a638e016a4a' AND latitude IS NULL;

-- Jack's Fork River Resort (cabin_lodge) — nominatim_address, 0.06 mi from its river
UPDATE nearby_services SET latitude = 37.1537266, longitude = -91.3529167,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '871638e7-d532-4828-a262-759b6a714e78' AND latitude IS NULL;

-- Living Water Cabins (cabin_lodge) — website_schema_geo, 0.21 mi from its river
UPDATE nearby_services SET latitude = 34.459, longitude = -93.681,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = 'b0adc9bc-1f0d-43c2-a49c-6509704d8514' AND latitude IS NULL;

-- River of Life Farm (cabin_lodge) — census_address, 0.37 mi from its river
UPDATE nearby_services SET latitude = 36.695070448813, longitude = -92.201651554345,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = '1a52a54b-e4f6-4a5e-b001-a658b53b0435' AND latitude IS NULL;

-- Rivers Bend Guest Cabin (cabin_lodge) — website_schema_geo, 0.03 mi from its river
UPDATE nearby_services SET latitude = 34.2954751, longitude = -93.4817127,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = 'a6104e75-8d36-4619-9e34-46133783d083' AND latitude IS NULL;

-- Shady Lane Cabins (cabin_lodge) — nominatim_name, 0.11 mi from its river
UPDATE nearby_services SET latitude = 37.1565915, longitude = -91.3597074,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '1598457f-c971-4d29-83a7-164811c867c3' AND latitude IS NULL;

-- Southfork Resort (cabin_lodge) — census_address, 6.23 mi from its river
UPDATE nearby_services SET latitude = 36.352400035479, longitude = -91.633949602479,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = '4de8f00c-4a1d-4677-b98a-f70e35706fc1' AND latitude IS NULL;

-- The Landing (cabin_lodge) — website_gmaps_embed, 0.15 mi from its river
UPDATE nearby_services SET latitude = 36.9895819, longitude = -91.0136811,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '336731ea-116d-4f5a-98c9-ce41b88fe64f' AND latitude IS NULL;

-- Adventure Outdoors (outfitter) — census_address, 0.05 mi from its river
UPDATE nearby_services SET latitude = 37.9773686257, longitude = -91.457736428236,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = '4a3c79ff-96da-456a-a812-12e6a176602f' AND latitude IS NULL;

-- Bird's Nest Lodge / Meramec River Resort (outfitter) — website_maps_link, 0.07 mi from its river
UPDATE nearby_services SET latitude = 37.999789, longitude = -91.359325,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '939a6b9d-5c8e-4c75-89fc-faedb2d17a3a' AND latitude IS NULL;

-- Caveman Floating at Meramec Caverns (outfitter) — website_schema_geo, 0.06 mi from its river
UPDATE nearby_services SET latitude = 38.24154670000001, longitude = -91.0922409,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '7fb78258-14af-4e5f-ab0c-8f025ab52210' AND latitude IS NULL;

-- Crooked Creek Canoes (outfitter) — website_schema_geo, 0.43 mi from its river
UPDATE nearby_services SET latitude = 36.24291, longitude = -92.81031,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '22ec9c8f-625b-4369-aaa6-bdfac687e737' AND latitude IS NULL;

-- Elk River Floats (outfitter) — website_schema_geo, 0.04 mi from its river
UPDATE nearby_services SET latitude = 36.548663, longitude = -94.494304,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '441830f8-f8a9-4f55-ae29-6e2d745cc2c7' AND latitude IS NULL;

-- Green's Canoe Rental & Campground (outfitter) — census_address, 2.21 mi from its river
UPDATE nearby_services SET latitude = 37.94230772692, longitude = -91.468307095767,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = '2ee2aa72-519c-4f19-8b26-957de24036eb' AND latitude IS NULL;

-- Indian Springs Family Resort (outfitter) — nominatim_name, 0.11 mi from its river
UPDATE nearby_services SET latitude = 37.9767709, longitude = -91.4304321,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '941e6859-3585-4ad7-b694-c622c46d7cac' AND latitude IS NULL;

-- Old Cove Canoe & Kayak (outfitter) — website_schema_geo, 0.11 mi from its river
UPDATE nearby_services SET latitude = 38.380404, longitude = -90.883444,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '3505f4a8-a2e9-4a7e-984a-0bec7f07b2b0' AND latitude IS NULL;

-- Pettit's Canoe & Campground (outfitter) — nominatim_address, 5.74 mi from its river
UPDATE nearby_services SET latitude = 36.6144777, longitude = -92.1136983,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'c865d045-fa38-4baa-bd70-059cf384cb20' AND latitude IS NULL;

-- River Wilderness Sports (outfitter) — census_address, 0.3 mi from its river
UPDATE nearby_services SET latitude = 36.319302881675, longitude = -91.48770332619,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = '22c9cb5b-ddbe-4288-bc55-663738664d20' AND latitude IS NULL;

-- Riverview Ranch (outfitter) — census_address, 6.32 mi from its river
UPDATE nearby_services SET latitude = 38.136882893178, longitude = -91.284069344413,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = 'af345f5b-1e12-488a-9b40-eadcf1b1eb2f' AND latitude IS NULL;

-- Spring River Outdoors (outfitter) — census_address, 0.64 mi from its river
UPDATE nearby_services SET latitude = 36.334486598184, longitude = -91.491975483528,
  geocode_precision = 'exact', geocode_source = 'census', geocoded_at = now()
 WHERE id = '2c3fb19c-f998-4419-9027-30cc64bfd14a' AND latitude IS NULL;

-- Trigger Gap Outfitters (outfitter) — website_schema_geo, 3.99 mi from its river
UPDATE nearby_services SET latitude = 36.396, longitude = -93.735,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '043e2152-9630-4d84-98f3-fb26c0c5f993' AND latitude IS NULL;

-- Wild Bill's Outfitter (outfitter) — website_address+census, 10.63 mi from its river
--   address found on operator site: 23 Hwy. 268 E.
UPDATE nearby_services SET latitude = 36.074227307112, longitude = -92.602417454381,
  geocode_precision = 'exact', geocode_source = 'operator_site+census', geocoded_at = now()
 WHERE id = '35f57ec0-239d-4058-95d1-54332a8afef8' AND latitude IS NULL;

-- Windy's Floats (outfitter) — nominatim_address, 0.17 mi from its river
UPDATE nearby_services SET latitude = 37.1522693, longitude = -91.3579401,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '6e9b31d6-4223-4033-af10-3173a767f65f' AND latitude IS NULL;
COMMIT;
