-- A stable external key, the names a search actually finds, and a date on the
-- claim that this business still exists.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- The August 2026 work took the directory from 28 located rows to 138, and
-- every one of the last 37 came from a person reading operator websites. That
-- is not repeatable quarterly. These three columns are what turn "does this
-- still exist?" from research into a scheduled read.
--
-- Each earns its place against a defect that actually happened, and none of
-- them is speculative:
--
--   * Of seven rows once marked `unverified`, FOUR were alive and merely
--     trading under another name — Caddo River Cabins is listed as Sundancer,
--     BSC Outdoors as Boiling Spring Campground, and "Three Rivers Outfitters"
--     is really "Three River Outfitter". Name drift read as death.
--   * Steele River Kayaks was permanently closed and nothing in Eddy noticed
--     until a person checked.
--   * `verified_source` has existed since 00072 and records HOW a row was
--     confirmed. Nothing has ever recorded WHEN, so a row verified against a
--     2019 review and one verified last week are the same claim.
--
-- ── Why place_id and not the rest of the Places response ──────────────────
--
-- Google's terms permit retaining `place_id` indefinitely and do NOT permit
-- retaining the coordinates, name or address that come back beside it. So this
-- is the one field a refresh can key on, and the reason the refresh reads Google
-- and writes findings rather than data.
--
-- ── Deliberately NOT added here ───────────────────────────────────────────
--
-- `driving_lat`/`driving_lng`. Hidden Ridge Cabins has a documented wrong
-- driving route, and access_points has carried driving coordinates since 00017
-- — but eddy-ios/src/components/map-sheet/sheetActions.ts builds its directions
-- URL from `pin.coordinates` and never reads them, not even for access points.
-- Adding two more unread columns beside the ones this migration is trying to
-- give meaning to would be the same defect with a fresh coat. They ship with
-- their consumer or not at all.
--
-- Nothing here reaches the app either, for the same reason: no client reads a
-- place id, an alias list or a verification date, so none of them is added to
-- RiverService. The wire type stays the shape the app actually consumes.

ALTER TABLE public.nearby_services
  ADD COLUMN IF NOT EXISTS google_place_id  TEXT,
  ADD COLUMN IF NOT EXISTS alt_names        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.nearby_services.google_place_id IS
  'Google''s stable key for this business, and the only part of a Places response we are permitted to retain. NULL means never matched — which is NOT the same as "no such place"; a row that was searched and deliberately rejected should say so in notes. Written by scripts/ingestion/propose-service-places.ts after a human reads its proposals.';

COMMENT ON COLUMN public.nearby_services.alt_names IS
  'Trade names, DBAs and the spellings a search actually finds. Empty array, never NULL. A matching input, not display copy — `name` is what a reader sees. Four of the seven rows once marked unverified were alive under another name, which is what this exists to stop.';

COMMENT ON COLUMN public.nearby_services.last_verified_at IS
  'When a human or a listing refresh last confirmed this is the business it claims to be. Pairs with verified_source, which records how. NULL means never re-confirmed, which is not the same as confirmed long ago — most of this directory pre-dates the column.';

-- A place id may belong to exactly one service.
--
-- Not defensive: two Eddy rows once matched the same OSM "Current River Inn"
-- node at 1.02 miles, comfortably inside every distance bound, and only a human
-- noticing that both had claimed it caught the error (20260807203000). That
-- observation becomes a constraint here. Partial because most rows have no
-- place id yet and NULLs must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nearby_services_google_place_id
  ON public.nearby_services (google_place_id)
  WHERE google_place_id IS NOT NULL;

-- No GIN index on alt_names. 155 rows, and the only reader is a matching script
-- that loads the table anyway; an index here would be decoration.

-- ── city is display copy, not a location ──────────────────────────────────
--
-- Six rows were filed under the wrong town until 20260809120000 corrected them
-- from their coordinates, and four of those wrong towns put the business on the
-- wrong RIVER. The fix is not to derive city — it is still the only input a row
-- without coordinates can be geocoded from — but to say plainly which field is
-- authoritative once a pin exists.
COMMENT ON COLUMN public.nearby_services.city IS
  'The town a reader is shown, and the geocoding input for rows that have no coordinates yet (scripts/ingestion/geocode-services-mapbox.ts). NOT authoritative about location: where latitude/longitude exist the pin is the authority and this is display copy. Six rows were filed under the wrong town until 20260809120000. NOT NULL is historical — the wire type allows null, because NPS campgrounds synthesised into /api/rivers/[slug]/services carry no town at all.';

-- ── Backfill ──────────────────────────────────────────────────────────────
--
-- 111 rows carry a geocoded_at from the August passes. Each of those coordinates
-- was corroborated against the river the service serves and, for most, against a
-- phone or an operator site — which is a verification event, so the date is
-- real rather than invented. The other 44 stay NULL: "never re-confirmed" is
-- the honest answer for them and is exactly what the staleness queue should
-- surface first.
--
-- verified_source is deliberately untouched. It is already populated on 153 of
-- 155 rows with richer provenance than geocode_source carries
-- ('mcfa_directory, knowledge_base'), and overwriting that with a geocoder name
-- would trade a better fact for a newer one.
UPDATE public.nearby_services
   SET last_verified_at = geocoded_at
 WHERE geocoded_at IS NOT NULL
   AND last_verified_at IS NULL;

-- ── Seed the aliases we already paid to learn ─────────────────────────────
--
-- Every one of these was discovered by hand during the August research, and
-- each is a name under which a search finds the business but Eddy's `name` does
-- not. Guarded so a re-run cannot duplicate an entry.
UPDATE public.nearby_services SET alt_names = ARRAY['Sundancer Caddo River Cabin Rental']
 WHERE id = 'b9d89c89-3410-489a-a964-311076d9d3d7' AND alt_names = '{}';

UPDATE public.nearby_services SET alt_names = ARRAY['Boiling Spring Campground']
 WHERE id = '7f2bbae5-5c20-4352-846f-ab8866af4f23' AND alt_names = '{}';

-- The name this row carried until 20260809120000 renamed it. Kept so anything
-- still searching the old spelling resolves.
UPDATE public.nearby_services SET alt_names = ARRAY['Three Rivers Outfitters']
 WHERE id = '384e4cd7-0de5-49b7-8fbb-72ac58a9ea6a' AND alt_names = '{}';

UPDATE public.nearby_services SET alt_names = ARRAY['Story''s Creek Horse & UTV Campground']
 WHERE id = '0889c522-d39f-487f-9696-82e3173a15eb' AND alt_names = '{}';

UPDATE public.nearby_services SET alt_names = ARRAY['Kick''n K Vacation Rentals']
 WHERE id = '4be61ad2-31d8-400c-b226-7d359a0c29ca' AND alt_names = '{}';

UPDATE public.nearby_services SET alt_names = ARRAY['Route 66 Canoe Rental']
 WHERE id = 'eadb2654-fdc5-4e85-abcd-a7113aefaf8e' AND alt_names = '{}';

UPDATE public.nearby_services SET alt_names = ARRAY['Meramec State Park Concessions']
 WHERE id = '687339a2-6559-4101-b1c9-f1288956ed9f' AND alt_names = '{}';

UPDATE public.nearby_services SET alt_names = ARRAY['Mulberry Mountain Lodging & Events']
 WHERE id = 'a7b8d84e-ed7e-4476-9442-0ca5810d8cfc' AND alt_names = '{}';
