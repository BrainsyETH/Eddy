-- 25 services geocoded by hand research. APPLIED 2026-08-07.
--
-- ── Where these came from, and why they are trustworthy ───────────────────
--
-- Hand research against operator sites, NPS and Missouri State Parks pages,
-- Google Places and OSM — 120 rows attempted, 25 returned with a source, 95
-- deliberately left blank. Blank is the correct answer here and nothing was
-- back-filled from a ZIP or a town centroid.
--
-- Every one was then checked against a source the researcher did not have:
-- Eddy's own access points. All 25 land on the river you would expect, and all
-- 25 are within 3 miles of an access point on that river. That is two
-- independent methods agreeing, which is the standard `mappable.ts` asks for
-- and the reason these are safe to write where a geocoder's output was not.
--
--   Akers Campground            -> Akers Ferry, Current River          0.07 mi
--   Akers Ferry Canoe Rental    -> Akers Ferry, Current River          0.07 mi
--   Pulltite Campground         -> Pulltite Spring, Current River      0.09 mi
--   Big Elk Floats and Camping  -> City of Pineville, Elk River        0.09 mi
--   River Ranch Resort          -> Noel / Shadow Lake, Elk River       0.13 mi
--   Kozy Kamp                   -> City of Pineville, Elk River        0.15 mi
--   Devil's Elbow River Safari  -> Devil's Elbow (Hwy V), Big Piney    0.19 mi
--   James River Outfitters      -> Galena Y-Bridge, James River        0.19 mi
--   Kings River Outfitters      -> Trigger Gap Landing, Kings River    0.19 mi
--   Harvey's Alley Spring       -> Alley Spring, Jacks Fork            0.27 mi
--   Shady Beach Campground      -> Mount Shira, Elk River              0.27 mi
--   Huzzah Valley Resort        -> Huzzah Valley Resort, Huzzah Creek  0.28 mi
--   Blue Springs Ranch          -> Blue Springs Creek CA, Meramec      0.52 mi
--   Bass River Resort           -> Bass River Resort, Courtois Creek   0.55 mi
--   Jacks Fork Canoe Rental     -> Eminence City, Jacks Fork           0.55 mi
--   Two Rivers Canoe Rental     -> Two Rivers, Jacks Fork              0.55 mi
--   Eagles Nest Camp & Canoe    -> Mount Shira, Elk River              0.62 mi
--   Ozark Outdoors Resort       -> Onondaga Cave SP, Meramec           0.70 mi
--   Big Spring Lodge & Cabins   -> Beal Landing, Current River         0.75 mi
--   Dawt Mill Resort            -> Hwy PP bridge, North Fork           0.94 mi
--   Riverside Resort & Canoes   -> J.D. Fletcher, Kings River          0.98 mi
--   Two Sons Floats & Camping   -> Mount Shira, Elk River              1.29 mi
--   Meramec State Park          -> Meramec SP Lower Ramp, Meramec      1.65 mi
--   Current River State Park    -> Sinking Creek, Current River        1.75 mi
--   Many Islands Camp & Canoe   -> Bayou Access, Spring River          2.99 mi
--
-- Three of these are corroborated by NAME as well as position: Bass River
-- Resort, Huzzah Valley Resort and Meramec State Park each sit beside an access
-- point Eddy already records under the same name.
--
-- ── The postal towns were the problem all along ───────────────────────────
--
-- Akers and Pulltite are filed under Salem and sit 18 and 22 miles away on the
-- Current; Big Spring Lodge is filed under Van Buren. The automated dry run
-- rejected all three on distance from the recorded town, and it was right to —
-- the town was wrong, not the match. This is why the distance test stays as it
-- is: it correctly refuses to guess, and a human resolves what it refuses.
--
-- ── `approximate` is drawn, and that is deliberate ────────────────────────
--
-- Ten of these are `approximate`, several anchored to a landmark beside the
-- business rather than its door — a bridge, a spring, a confluence gauge. That
-- is exactly what the precision scale calls the right road, and `mappableService`
-- draws it. Only `centroid` — a town, and nothing finer — is refused, and none
-- of these is one. Current River State Park is a park-area centroid rather than
-- a town centroid, which is a far tighter claim and stays `approximate`.
--
-- ── One thing to know before this lands ───────────────────────────────────
--
-- Akers Campground and Akers Ferry Canoe Rental get the SAME coordinate,
-- because they are two businesses sharing one site at the ferry. They are in
-- different tiers, so they draw on different layers and a reader toggling
-- either can still reach both. Nothing is offset to separate them: nudging a
-- pin to make it clickable would be inventing a position, which is the one
-- thing this whole exercise refuses to do.
--
-- Pulltite is the only row here that will NOT add a pin — `drawnAsAccessPoint`
-- drops it against the campground-tagged "Pulltite Spring" access point 0.09 mi
-- away, which is the dedupe working as designed. The row is still worth
-- correcting for the river-screen list and the coverage figure.
--
-- Guarded on `latitude IS NULL` so re-running cannot overwrite a correction.

-- ── Campgrounds ───────────────────────────────────────────────────────────

UPDATE nearby_services SET latitude = 37.37575, longitude = -91.55311,
    geocode_precision = 'exact', geocode_source = 'nps', geocoded_at = NOW()
WHERE name = 'Akers Campground' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 37.33436, longitude = -91.47825,
    geocode_precision = 'exact', geocode_source = 'nps', geocoded_at = NOW()
WHERE name = 'Pulltite Campground' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 38.20669, longitude = -91.10302,
    geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = NOW()
WHERE name = 'Meramec State Park' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.38980, longitude = -91.52778,
    geocode_precision = 'exact', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Many Islands Camp & Canoe Rental' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.58444, longitude = -94.45601,
    geocode_precision = 'exact', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Eagles Nest Camp & Canoe' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.57950, longitude = -94.46470,
    geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = NOW()
WHERE name = 'Shady Beach Campground' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.58947, longitude = -94.38945,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Kozy Kamp (Elk River Floats)' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 38.11398, longitude = -91.16445,
    geocode_precision = 'exact', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Blue Springs Ranch' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 37.84583, longitude = -92.06389,
    geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Devil''s Elbow River Safari' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.56180, longitude = -94.47570,
    geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Two Sons Floats & Camping' AND latitude IS NULL;

-- Park-area centroid, not the gated Hwy 19 entrance. Approximate, not centroid:
-- `centroid` in mappable.ts means a TOWN, which this is not.
UPDATE nearby_services SET latitude = 37.32167, longitude = -91.43667,
    geocode_precision = 'approximate', geocode_source = 'operator_site', geocoded_at = NOW()
WHERE name = 'Current River State Park' AND latitude IS NULL;

-- ── Outfitters ────────────────────────────────────────────────────────────

UPDATE nearby_services SET latitude = 37.37575, longitude = -91.55311,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Akers Ferry Canoe Rental' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 37.99253, longitude = -91.17541,
    geocode_precision = 'exact', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Bass River Resort' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 37.97336, longitude = -91.19949,
    geocode_precision = 'exact', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Huzzah Valley Resort' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 38.04764, longitude = -91.22538,
    geocode_precision = 'exact', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Ozark Outdoors Resort' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.39027, longitude = -93.62041,
    geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = NOW()
WHERE name = 'Riverside Resort & Canoes' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.58759, longitude = -94.38613,
    geocode_precision = 'exact', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Big Elk Floats and Camping' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 37.14966, longitude = -91.34901,
    geocode_precision = 'approximate', geocode_source = 'google', geocoded_at = NOW()
WHERE name = 'Jacks Fork Canoe Rental & Campground' AND latitude IS NULL;

-- Anchored to the USGS gauge at the Jacks Fork / Current confluence.
UPDATE nearby_services SET latitude = 37.18310, longitude = -91.28097,
    geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Two Rivers Canoe Rental' AND latitude IS NULL;

-- Across Hwy 106 from Alley Spring; anchored to the spring.
UPDATE nearby_services SET latitude = 37.14417, longitude = -91.44389,
    geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Harvey''s Alley Spring Canoe Rental' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.80770, longitude = -93.46499,
    geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'James River Outfitters' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.31515, longitude = -93.66696,
    geocode_precision = 'approximate', geocode_source = 'osm', geocoded_at = NOW()
WHERE name = 'Kings River Outfitters' AND latitude IS NULL;

UPDATE nearby_services SET latitude = 36.55083, longitude = -94.49278,
    geocode_precision = 'approximate', geocode_source = 'operator_site', geocoded_at = NOW()
WHERE name = 'River Ranch Resort' AND latitude IS NULL;

-- ── Cabins and lodges ─────────────────────────────────────────────────────

UPDATE nearby_services SET latitude = 36.60985, longitude = -92.27757,
    geocode_precision = 'exact', geocode_source = 'operator_site', geocoded_at = NOW()
WHERE name = 'Dawt Mill Resort' AND latitude IS NULL;

-- The historic lodge at Big Spring, end of Hwy 103. A directory coordinate
-- placing it 2.6 mi north at a road junction was rejected in research.
UPDATE nearby_services SET latitude = 36.94861, longitude = -90.99306,
    geocode_precision = 'approximate', geocode_source = 'nps', geocoded_at = NOW()
WHERE name = 'Big Spring Lodge & Cabins' AND latitude IS NULL;

-- ── WHAT IT ACTUALLY DID, and the prediction was wrong ───────────────────
--
-- Predicted roughly 22/84, 15/81, 27/80. Measured after applying:
--
--   outfitters    14 -> 34 of 84   (17% -> 40%)
--   lodging       13 -> 28 of 81   (16% -> 35%)
--   campgrounds   18 -> 48 of 80   (23% -> 60%)
--
-- The prediction assumed each geocoded row lifts ONE tier. It does not: 21 of
-- these 32 rows are in two tiers or more, so a single coordinate lifts several
-- at once. 20 of them reach rentals, 30 reach camping, 15 reach lodging — which
-- is exactly 14+20, 18+30 and 13+15. The capability model compounds, and this
-- is the clearest measurement of it so far.
--
-- `centroid` stayed at 0 and no coordinate landed outside the region.
