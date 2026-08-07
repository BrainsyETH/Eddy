-- Seven campgrounds that cleared both geocoding tests. APPLIED 2026-08-07.
--
-- ── Where these came from ──────────────────────────────────────────────────
--
-- `npx tsx scripts/ingestion/geocode-services-dryrun.ts`, which proposes and
-- writes nothing. It read 30 campground rows with no coordinates against 168
-- named campground POIs from OSM and accepted 7. Every row below is a name
-- match of 0.87 or better AND within 10 miles of the town the row already
-- records — both tests, because name alone accepted four wrong campgrounds when
-- this was first tried.
--
-- The rejections are the reason the script exists, and the same three the
-- provenance migration cites are still being caught:
--
--   Camp River Campground, Alton       -> Two Rivers Campground     34.9 mi
--   Story's Creek Campground, Eminence -> Hazel Creek Campground    51.0 mi
--   Ruby's Landing, Jerome             -> Twin Rivers Landing       71.2 mi
--
-- One rejection is worth a second look before anybody widens the rule:
-- Pulltite Campground matched "Pulltite Campground" at a perfect 1.00 and was
-- refused at 21.8 miles. A perfect name that far out means either the row's
-- recorded town is wrong or the OSM node sits at a different part of the park.
-- It is a data question, not a threshold question, and loosening the distance
-- test to admit it would also admit Camp River.
--
-- ── Precision is `exact`, and that is a claim ─────────────────────────────
--
-- Not a default. These are corroborated by two independent facts — the name and
-- the town — which is what `exact` means in mappable.ts: the place itself,
-- corroborated. Anything that had cleared on one test would be `approximate`,
-- and a town centroid would be `centroid` and would never be drawn. Nothing
-- here is either.
--
-- ── What this does NOT change ─────────────────────────────────────────────
--
-- Five of these seven are Ozark National Scenic Riverways campgrounds that also
-- exist as access points, and `drawnAsAccessPoint` drops a service pin sitting
-- on top of one. So the map may gain only two pins from this. The rows are
-- still worth correcting: they feed the river screen's list, the coverage
-- figure under each tier, and any future join to the directory.
--
-- Guarded on `latitude IS NULL` so re-running cannot overwrite a coordinate
-- somebody has since corrected by hand.

UPDATE nearby_services SET
    latitude = 37.14646, longitude = -91.44869,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Alley Spring Campground' AND latitude IS NULL;

UPDATE nearby_services SET
    latitude = 36.96321, longitude = -90.98112,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Big Spring Campground' AND latitude IS NULL;

UPDATE nearby_services SET
    latitude = 38.24655, longitude = -91.08811,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Meramec Caverns Campground' AND latitude IS NULL;

UPDATE nearby_services SET
    latitude = 38.05840, longitude = -91.23716,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Onondaga Cave State Park' AND latitude IS NULL;

UPDATE nearby_services SET
    latitude = 36.64353, longitude = -92.22200,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Patrick Bridge Campground' AND latitude IS NULL;

UPDATE nearby_services SET
    latitude = 37.27996, longitude = -91.40792,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Round Spring Campground' AND latitude IS NULL;

UPDATE nearby_services SET
    latitude = 37.18948, longitude = -91.27559,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE type = 'campground' AND name = 'Two Rivers Campground' AND latitude IS NULL;

-- After applying, `npm run db:check-services` should show campgrounds move from
-- 18 of 80 located to 25 of 80, and `centroid` must stay at 0.
