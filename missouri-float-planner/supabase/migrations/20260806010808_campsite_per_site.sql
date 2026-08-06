-- Per-site campsite inventory.
--
-- ── Why this costs no new upstream requests ────────────────────────────────
--
-- Both booking systems already send per-site, per-night data in the SAME
-- response Eddy reads its counts from, and the adapters threw it away in the
-- parse step. Recreation.gov's month payload keys `campsites` by id and carries
-- `site` (the printed number), `loop`, `campsite_type`, `type_of_use` and
-- `max_num_people` alongside a whole month of statuses; UseDirect's grid carries
-- `Units[].Name` with a per-night `IsFree`. The month endpoint was integrated
-- for its calendar alone, so `MonthResponse` declared three of those fields and
-- nobody had looked at the rest.
--
-- Consequence worth stating: the documented RIDB API is NOT needed for this.
-- src/lib/usfs/ridb.ts:194 `fetchCampsites` remains uncalled. It would add ADA
-- flags and per-site coordinates and nothing else this feature uses.
--
-- ── What this fixed on the way in ──────────────────────────────────────────
--
-- Parsing `type_of_use` revealed the federal aggregate was counting day-use
-- inventory as campsites. Red Bluff (232391) returns two group picnic shelters
-- among its 62 entries, so Eddy reported "36 of 54 sites open" where the honest
-- answer is 35 of 52. The state-park adapter already excluded exactly this
-- (usedirect.ts CAMPGROUND_CATEGORY); the federal side could not, because the
-- field was never read. recgov.ts CAMPING_USE now does.
--
-- ── Drift note ─────────────────────────────────────────────────────────────
--
-- src/types/database.ts carries no `campsite_*` entries at all — it was never
-- regenerated after 20260803120000. The camping modules therefore query through
-- a bare SupabaseClient with hand-rolled row interfaces, and the two tables
-- below follow that existing local convention rather than half-converting it.
-- `npm run db:gen-types` plus `make check-db` is the separate follow-up.

-- ═══ 1. The catalog ════════════════════════════════════════════════════════
--
-- Rewritten nightly by whichever sync sees the facility, but rows are stable:
-- a site keeps its uuid across runs, so the availability table below never has
-- to be rebuilt and anything holding a site id keeps working.

CREATE TABLE IF NOT EXISTS public.campsite_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.campsite_facilities(id) ON DELETE CASCADE,

  -- The provider's own id. For recreation.gov this is `campsite_id`, which is
  -- ALSO the /camping/campsites/{id} path segment the app deep-links to — one
  -- key, two uses. For UseDirect it is the Units dictionary key.
  source_site_id TEXT NOT NULL,

  -- What the booking page PRINTS: 'RTL3', '012', 'Electric 50 amp #178'.
  -- source_site_id is what a machine reads; this is what a camper reads, and
  -- the two are never the same string.
  name TEXT,

  -- Trimmed on the way in. Recreation.gov ships the same loop spelled two ways
  -- inside one response — 'Ridge Top Loop' and 'Ridge Top Loop ' — which would
  -- otherwise render as two groups of the same place.
  loop TEXT,

  -- The provider's vocabulary, verbatim and unmapped: 'STANDARD ELECTRIC',
  -- 'TENT ONLY', 'RV ELECTRIC'. Mapping it to Eddy's own words is a display
  -- decision and belongs where the words are, not in the store.
  -- NULL for every UseDirect row: Missouri State Parks fold the type into the
  -- name and publish no separate field. Absent is the honest record of that.
  site_type TEXT,
  max_occupancy INTEGER,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- The join the availability table needs, and the upsert key the sync uses.
  UNIQUE (facility_id, source_site_id)
);

-- ═══ 2. The calendar ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.campsite_site_availability (
  site_id UUID NOT NULL REFERENCES public.campsite_sites(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- The SAME five states foldNight already reasons in, one cell per row rather
  -- than folded. A boolean here would discard exactly the two distinctions the
  -- aggregate is built on: walk-up inventory is real but never bookable and
  -- must stay out of the denominator, and 'closed for the season' is the
  -- opposite situation from 'fully booked' to somebody deciding whether to
  -- keep checking for a cancellation.
  --
  -- UseDirect can only ever emit 'open' or 'reserved' — its grid publishes a
  -- bare IsFree boolean. That asymmetry with the federal feed is real, and the
  -- read path must not imply a state park told us more than it did.
  status TEXT NOT NULL
    CHECK (status IN ('open', 'reserved', 'walk_up', 'closed', 'not_yet_released')),

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, date)
);

-- The read path asks for one night across a facility's sites, and the prune
-- asks for every site before a cutoff. Both are date-led; the PK is not.
CREATE INDEX IF NOT EXISTS campsite_site_availability_date_idx
  ON public.campsite_site_availability (date);

-- ═══ 3. Access ═════════════════════════════════════════════════════════════
-- Mirrors 20260803120000 exactly: availability is public information, and
-- every write goes through the service role in the nightly sync.

ALTER TABLE public.campsite_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campsite_site_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campsite_sites are public" ON public.campsite_sites;
CREATE POLICY "campsite_sites are public"
  ON public.campsite_sites FOR SELECT USING (true);

DROP POLICY IF EXISTS "campsite_site_availability is public"
  ON public.campsite_site_availability;
CREATE POLICY "campsite_site_availability is public"
  ON public.campsite_site_availability FOR SELECT USING (true);

COMMENT ON TABLE public.campsite_sites IS
  'Individual campsites, parsed from the same payloads that carry the counts. No second API.';
COMMENT ON TABLE public.campsite_site_availability IS
  'One row per site per night. Pruned to a trailing 7 days by pruneOldNights.';
