-- 8 more services geocoded. Coverage 93 -> 101 of 156.
--
-- Second pass: a deeper crawl of operator sites (18 candidate paths rather than
-- 6) plus one Overpass sweep of 3,922 named POIs across MO/AR, name-matched with
-- the same Dice-bigram rule, then scored on distance to the LINKED RIVER.
--
-- ── THE RIVER TEST PAID FOR ITSELF ────────────────────────────────────────
--
-- 17 candidates went in; 7 were rejected at 79 to 236 miles from any river the
-- service serves. Name similarity alone would have written every one of them:
--
--   Arapaho Campground, Steelville   -> OSM "Arapaho"            221 mi
--   Riverside Canoe Rental, Gainesville -> "Riverside Park Cgs"  236 mi
--   Riverside Motel & River Cabins   -> OSM "Riverside Motel"    214 mi
--   4J Vacation Rentals              -> OSM "Vacation Rentals"   175 mi
--   Briarwood Cabins, Alton          -> OSM "Briarwood Inn"      143 mi
--
-- Two separate Eddy rows — Current River Canoe Rental and Current River
-- Campground — both matched the SAME "Current River Inn" node at 1.02 mi, which
-- is inside the threshold. Two businesses cannot share one point and neither is
-- an inn, so both were dropped by hand. Distance is a strong filter, not a
-- complete one, and a candidate claimed twice is the tell.
--
-- ── THREE OF THE EIGHT EXPOSED A WRONG RIVER LINK, NOT A BAD COORDINATE ───
--
-- Froggy's River Resort and Gasconade Hills Resort are filed against the Big
-- Piney and sit 15.1 and 17.3 miles from it — but 0.20 and 0.11 miles from the
-- GASCONADE, on exact-name OSM matches. One of them is called "Gasconade
-- Hills". Float Eureka is filed against War Eagle Creek at 13.4 miles and sits
-- 4.63 miles from the Kings River.
--
-- Their coordinates are written here because they are right. Their
-- `service_rivers` rows are NOT touched: a geocoding migration should not
-- quietly re-file which river a business serves, and that correction wants its
-- own change with its own evidence.
--
-- Every UPDATE is guarded on `latitude IS NULL`. `centroid` stays at 0.

BEGIN;

-- Caddo River Crossing — operator site, 0.06 mi from the Caddo
UPDATE nearby_services SET latitude = 34.3824264, longitude = -93.6064661,
  geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = now()
 WHERE id = '14b51477-ff89-4247-a5c0-c671d02ca1c3' AND latitude IS NULL;

-- Peck's Last Resort — OSM exact name, 0.06 mi from the Big Piney
UPDATE nearby_services SET latitude = 37.6704738, longitude = -92.0483225,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'f575bdd8-7bc5-4d9c-9489-8f936e840865' AND latitude IS NULL;

-- The Rafting Company — OSM "The Rafting Co" 0.84, 0.18 mi from the Meramec
UPDATE nearby_services SET latitude = 37.9857892, longitude = -91.3760597,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'f3225f25-715f-42d3-9960-5b546da95baf' AND latitude IS NULL;

-- Mulberry Mountain Lodging & RV Park — OSM "...Lodging & Events" 0.82, 1.36 mi
UPDATE nearby_services SET latitude = 35.7098672, longitude = -93.7948302,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'a7b8d84e-ed7e-4476-9442-0ca5810d8cfc' AND latitude IS NULL;

-- Rockbridge Rainbow Trout & Game Ranch — OSM exact name, 2.14 mi from Bryant Creek
UPDATE nearby_services SET latitude = 36.7894046, longitude = -92.4096475,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = '64755e1f-193f-4b03-aadc-f50d29515f15' AND latitude IS NULL;

-- Froggy's River Resort — 0.20 mi from the GASCONADE, not the Big Piney it is
-- filed under. Coordinate right, river link wants a separate correction.
UPDATE nearby_services SET latitude = 37.7209874, longitude = -92.3571745,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'f652e50c-8b88-4e36-8052-ef8d69ee9045' AND latitude IS NULL;

-- Gasconade Hills Resort — 0.11 mi from the GASCONADE, same story.
UPDATE nearby_services SET latitude = 37.7513235, longitude = -92.3971237,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'faea7b2c-1411-44b1-b86e-b35715586213' AND latitude IS NULL;

-- Float Eureka — 4.63 mi from the KINGS, 13.4 from the War Eagle it is filed
-- under. Coordinate right, river link wants review.
UPDATE nearby_services SET latitude = 36.3973775, longitude = -93.7464366,
  geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = now()
 WHERE id = 'e4e7ac0b-5375-4120-9aab-19457f9b823b' AND latitude IS NULL;

COMMIT;
