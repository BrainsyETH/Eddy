-- Three outfitters the dry run could not previously see. APPLIED 2026-08-07.
--
-- ── Why these are new ─────────────────────────────────────────────────────
--
-- Not new data and not a loosened threshold. The dry run swept
-- `tourism=camp_site` for EVERY service type, so asking it for outfitters
-- compared canoe liveries against campgrounds — a corpus in which none of these
-- three exists. They were never rejected; they were never candidates.
--
-- With the corpus chosen by type (`amenity=boat_rental`, `shop=rental`,
-- `shop=outdoor`, `shop=sports`) all three clear both tests unchanged, and two
-- of them at a perfect name match within half a mile of their own town:
--
--   Jadwin Canoe Rental -> Jadwin Canoe Rental    1.00   0.2 mi from Jadwin
--   RiverStop           -> RiverStop              1.00   0.3 mi from Hardy
--   Carr's Canoe Rental -> Carr's Canoe Rentals   0.97   9.9 mi from Eminence
--
-- Cross-checked against Eddy's own access points, which the sweep does not use:
--
--   RiverStop           -> Hardy (Spring Street Bridge), Spring River  0.29 mi
--   Carr's Canoe Rental -> Round Spring, Current River                 0.35 mi
--   Jadwin Canoe Rental -> Cedargrove, Current River                   4.69 mi
--
-- Jadwin is the loosest at 4.69 miles from the nearest access point, and that
-- is the right river and unsurprising: it is a road-side livery on the upper
-- Current between put-ins, not a landing. Its name and town agree to within a
-- fifth of a mile, which is the stronger evidence here.
--
-- `exact` for all three: name and town corroborate independently, which is what
-- that word means in mappable.ts.
--
-- Guarded on `latitude IS NULL` so re-running cannot overwrite a correction.

UPDATE nearby_services SET latitude = 37.28759, longitude = -91.40911,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Carr''s Canoe Rental' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 37.48458, longitude = -91.57278,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Jadwin Canoe Rental' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.31527, longitude = -91.47799,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'RiverStop' AND latitude IS NULL;

-- Applied: rentals coverage moved 34 -> 37 of 84, and the directory as a whole
-- 60 -> 63 of 156 located. `centroid` stayed at 0.
