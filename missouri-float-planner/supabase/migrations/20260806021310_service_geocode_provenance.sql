-- Where a service's coordinates came from, and how much to trust them.
--
-- ── Why this is not just "geocode the campgrounds" ─────────────────────────
--
-- All eleven private campgrounds Eddy lists have no coordinates, so none of
-- them is drawn on the map at all. The obvious fix is to run the names through
-- a geocoder and write whatever comes back. Doing that was measured first, and
-- it would have been a disaster:
--
--   Camp River Campground, Alton      -> "Two Rivers Campground"   35 mi away
--   Story's Creek Campground, Eminence-> "Brazil Creek Campground"  60 mi away
--   Arapaho Campground, Steelville    -> "Huzzah Campground"         9 mi away
--   Ruby's Landing, Jerome            -> "Twin Rivers Landing"      71 mi away
--
-- Every one of those is a real, different campground with a similar name. A pin
-- is a claim about where a place IS, and a float trip is planned around it —
-- somebody driving to Two Rivers looking for Camp River has been actively
-- misled, which is worse than a campground that simply is not on the map.
--
-- So the durable thing is not the coordinates. It is a record of how each one
-- was arrived at, so a guess can never be mistaken for a survey, and so a
-- surface can decide for itself what precision it needs. A map pin needs to be
-- right to within a few hundred metres. A ten-mile "search stays nearby" box
-- does not care which end of town it starts from.

ALTER TABLE public.nearby_services
  ADD COLUMN IF NOT EXISTS geocode_precision TEXT
    CHECK (geocode_precision IN ('exact', 'approximate', 'centroid')),
  ADD COLUMN IF NOT EXISTS geocode_source TEXT,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.nearby_services.geocode_precision IS
  'exact = the place itself, corroborated. approximate = the right road or block. centroid = the town only, NEVER safe to draw as a pin. NULL = pre-dates this column; treated as trusted so the map does not regress.';
COMMENT ON COLUMN public.nearby_services.geocode_source IS
  'How it was arrived at: osm, street_address, operator_site, manual. Free text on purpose — the list of sources will grow.';

-- ── The rule the read path follows ────────────────────────────────────────
--
-- Pin everything EXCEPT 'centroid'. Stated as a permissive rule rather than a
-- strict one because the thirteen services already carrying coordinates have no
-- recorded provenance, and demanding 'exact' would silently un-pin every one of
-- them to make a point about a column that did not exist when they were entered.
-- NULL means "from before this was tracked", which is a different thing from
-- "known to be a guess".

-- ── The one that could be verified ────────────────────────────────────────
--
-- Circle B, in Eminence, agreed from two independent directions: an OSM
-- camp_site POI whose name matched exactly and sat 0.6 miles from the town, and
-- the operator's own street address (18823 Circle B Road) geocoded separately.
-- The two land 0.22 miles apart, which is campground scale rather than town
-- scale. Nothing else in the set cleared both tests.
--
-- Keyed by name and city rather than uuid so this reads as a checkable claim,
-- and guarded on latitude being null so a later, better coordinate is never
-- overwritten by re-running an old migration.
UPDATE public.nearby_services
SET latitude = 37.15518,
    longitude = -91.36701,
    geocode_precision = 'exact',
    geocode_source = 'osm+street_address',
    geocoded_at = NOW()
WHERE type = 'campground'
  AND name = 'Circle B Campground & Resort'
  AND city = 'Eminence'
  AND latitude IS NULL;
