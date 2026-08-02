-- Migration: 20260803120000_campsite_availability.sql
-- Description: Live campsite availability for the coming weekend.
--
-- Two tables and one data correction.
--
-- ── Why a curated link table rather than a regex ──────────────────────────
--
-- `nearby_services.reservation_url` and `nps_campgrounds.reservation_url`
-- already hold recreation.gov URLs, so pulling the facility id out with a
-- regex is the obvious move. It is also wrong three ways:
--
--   1. Six stored ids (the 10174182 family, seeded by 00084) are DEAD. They
--      404 on recreation.gov's public website, not merely on the API, so those
--      Reserve buttons have been sending people to an error page. Corrected
--      at the bottom of this migration.
--   2. Three ids are district-wide backcountry permits, not campgrounds —
--      10344874 "Jacks Fork / Middle Current", 10344920 "Lower Current
--      District", 10344948 "Upper Current District" — and seventeen individual
--      gravel-bar campground names point at them. Attributing a district's
--      inventory to Powder Mill would print a confident, wrong number.
--   3. 10001451 is claimed by both Ozark and Steel Creek. Recreation.gov calls
--      it Steel Creek; Ozark's URL is simply wrong.
--
-- `access_points.ridb_facility_id` (added by 00046) cannot help either: it is
-- populated on 0 of 406 rows.
--
-- Every id seeded below was fetched live and confirmed to return per-site,
-- per-night data before being written down.

-- ─────────────────────────────────────────────────────────────
-- 1. Which facilities Eddy asks about, and what they belong to
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campsite_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'recreation_gov' (federal) or 'mo_state_parks' (UseDirect / icampmo).
  source TEXT NOT NULL CHECK (source IN ('recreation_gov', 'mo_state_parks')),

  -- Whatever identifier that source needs: a RIDB facility id for federal
  -- campgrounds, a UseDirect PlaceId for a state park. A park's bookable loops
  -- are discovered at sync time, so renumbering them needs no migration.
  source_facility_id TEXT NOT NULL,

  -- The provider's own name, so a mislinked row is obvious in the table.
  display_name TEXT NOT NULL,

  -- 'backcountry_district' rows are river-district permits covering many
  -- named campsites; they need different copy and must never be attributed
  -- to a single campground.
  kind TEXT NOT NULL DEFAULT 'campground'
    CHECK (kind IN ('campground', 'backcountry_district')),

  nps_campground_id UUID REFERENCES public.nps_campgrounds(id) ON DELETE SET NULL,
  nearby_service_id UUID REFERENCES public.nearby_services(id) ON DELETE SET NULL,

  -- Switch a facility off without a deploy. Seeded false where the id is
  -- verified but nothing in Eddy displays it yet — an enabled row that no card
  -- reads is a nightly request spent on nobody.
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Doubles as the sync cursor. A run works least-recently-synced first and
  -- stops on its time budget, so a slow night resumes where it left off on the
  -- next invocation instead of truncating and always re-syncing the same head
  -- of the list. Set even when a facility returns nothing, or a dead id would
  -- stay permanently at the front of the queue.
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campsite_facilities_source_id
  ON public.campsite_facilities (source, source_facility_id);

CREATE INDEX IF NOT EXISTS idx_campsite_facilities_nps
  ON public.campsite_facilities (nps_campground_id)
  WHERE nps_campground_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campsite_facilities_service
  ON public.campsite_facilities (nearby_service_id)
  WHERE nearby_service_id IS NOT NULL;

COMMENT ON TABLE public.campsite_facilities IS
  'Curated link between Eddy campgrounds and the booking systems that know their availability. Hand-verified: see the migration header for why a regex over reservation_url is not a substitute.';

-- ─────────────────────────────────────────────────────────────
-- 2. One row per facility per night
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campsite_availability (
  facility_id UUID NOT NULL
    REFERENCES public.campsite_facilities(id) ON DELETE CASCADE,

  -- The night occupied, in the facility's own local day.
  date DATE NOT NULL,

  sites_open INTEGER NOT NULL DEFAULT 0,

  -- Sites bookable at all: the honest denominator. Excludes walk-up
  -- inventory, which the federal feed reports as 'Not Reservable' — Red Bluff
  -- lists 62 sites but 8 are first-come every day, and counting those would
  -- render "52 of 62 open" for a campground where only 54 can be reserved.
  sites_reservable INTEGER NOT NULL DEFAULT 0,

  -- 'closed' is seasonal and is NOT 'full'. Alley Spring reports thousands of
  -- closed site-nights in September; telling a user it is fully booked sends
  -- them hunting a cancellation that cannot exist.
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'full', 'closed', 'not_yet_released')),

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (facility_id, date)
);

CREATE INDEX IF NOT EXISTS idx_campsite_availability_date
  ON public.campsite_availability (date);

COMMENT ON TABLE public.campsite_availability IS
  'Nightly cache of campsite availability. Pages read only from here — no user request ever reaches an upstream booking system.';

-- ─────────────────────────────────────────────────────────────
-- 3. Sync log
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campsite_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  facilities_synced INTEGER NOT NULL DEFAULT 0,
  facilities_failed INTEGER NOT NULL DEFAULT 0,
  nights_written INTEGER NOT NULL DEFAULT 0,
  -- Requests actually made against the upstream host, retries included. The
  -- number to watch: a creeping budget should be visible, not discovered.
  requests_made INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 4. RLS — public read, service-role write
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.campsite_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campsite_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campsite_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campsite_facilities_public_read" ON public.campsite_facilities
  FOR SELECT USING (true);

CREATE POLICY "campsite_availability_public_read" ON public.campsite_availability
  FOR SELECT USING (true);

-- The log is operational detail; the cron writes it with the service role.
CREATE POLICY "campsite_sync_log_read" ON public.campsite_sync_log
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────
-- 5. Correct the six dead reservation URLs
-- ─────────────────────────────────────────────────────────────
--
-- Independent of availability: these Reserve buttons are broken today, and
-- linking a facility to a row whose URL 404s would ship a card that reports
-- sites open next to a button that goes nowhere.

UPDATE public.nearby_services SET
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/234046'
  WHERE reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174182';

UPDATE public.nearby_services SET
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/234044'
  WHERE reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174183';

UPDATE public.nearby_services SET
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/234442'
  WHERE reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174185';

UPDATE public.nearby_services SET
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/234357'
  WHERE reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174186';

UPDATE public.nearby_services SET
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/234045'
  WHERE reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174188';

UPDATE public.nearby_services SET
  reservation_url = 'https://www.recreation.gov/camping/campgrounds/234441'
  WHERE reservation_url = 'https://www.recreation.gov/camping/campgrounds/10174189';

-- ─────────────────────────────────────────────────────────────
-- 6. Seed the curated links
-- ─────────────────────────────────────────────────────────────
--
-- Matched on the provider id already stored on the row, so a renamed
-- campground still links and a row that has moved on simply does not.

INSERT INTO public.campsite_facilities
  (source, source_facility_id, display_name, kind, enabled)
VALUES
  -- Ozark National Scenic Riverways and neighbours, all verified live.
  ('recreation_gov', '232391',   'Red Bluff Campground',            'campground', TRUE),
  ('recreation_gov', '233119',   'Tyler Bend Campground',           'campground', TRUE),
  ('recreation_gov', '233279',   'War Eagle Campground',            'campground', TRUE),
  ('recreation_gov', '234043',   'Buffalo Point Campground',        'campground', TRUE),
  ('recreation_gov', '234044',   'Big Spring Campground',           'campground', TRUE),
  ('recreation_gov', '234045',   'Round Spring Campground',         'campground', TRUE),
  ('recreation_gov', '234046',   'Alley Spring Campground',         'campground', TRUE),
  ('recreation_gov', '234357',   'Pulltite Campground',             'campground', TRUE),
  ('recreation_gov', '234441',   'Two Rivers Campground',           'campground', TRUE),
  ('recreation_gov', '234442',   'Akers Group Campground',          'campground', TRUE),
  ('recreation_gov', '10001451', 'Steel Creek Campground',          'campground', TRUE),
  ('recreation_gov', '10341416', 'Erbie Campground',                'campground', TRUE),

  -- District backcountry permits. Real, verified, and deliberately disabled:
  -- Eddy has no district-level row to render them on, and hanging them off the
  -- seventeen gravel-bar campgrounds that share their ids would misreport every
  -- one of those. Enable once a surface exists.
  ('recreation_gov', '10344874', 'Jacks Fork / Middle Current Backcountry', 'backcountry_district', FALSE),
  ('recreation_gov', '10344920', 'Lower Current District Backcountry',      'backcountry_district', FALSE),
  ('recreation_gov', '10344948', 'Upper Current District Backcountry',      'backcountry_district', FALSE),

  -- Missouri State Parks, by UseDirect PlaceId.
  ('mo_state_parks', '60', 'Meramec State Park',        'campground', TRUE),
  ('mo_state_parks', '5',  'Onondaga Cave State Park',  'campground', TRUE),
  ('mo_state_parks', '83', 'St. Francois State Park',   'campground', TRUE),
  ('mo_state_parks', '96', 'Washington State Park',     'campground', TRUE),

  -- Verified working, disabled until a campground row exists to attach to.
  -- Echo Bluff and Montauk are currently typed 'cabin_lodge' in
  -- nearby_services, and the availability chip renders on campgrounds only —
  -- "1 of 72 sites open" on a lodge card would describe the wrong inventory.
  ('mo_state_parks', '111', 'Echo Bluff State Park',    'campground', FALSE),
  ('mo_state_parks', '4',   'Montauk State Park',       'campground', FALSE),
  ('mo_state_parks', '11',  'Bennett Spring State Park','campground', FALSE),
  ('mo_state_parks', '79',  'Sam A. Baker State Park',  'campground', FALSE),
  ('mo_state_parks', '39',  'Ha Ha Tonka State Park',   'campground', FALSE)
ON CONFLICT (source, source_facility_id) DO NOTHING;

-- Link to NPS campgrounds by the recreation.gov id already on the row.
UPDATE public.campsite_facilities f SET nps_campground_id = c.id
FROM public.nps_campgrounds c
WHERE f.source = 'recreation_gov'
  AND f.kind = 'campground'
  AND c.reservation_url = 'https://www.recreation.gov/camping/campgrounds/' || f.source_facility_id
  -- 10001451 is claimed by both Ozark and Steel Creek; recreation.gov calls it
  -- Steel Creek, so Ozark's URL is wrong and must not win the join.
  AND (f.source_facility_id <> '10001451' OR c.name = 'Steel Creek Campground');

-- Link to directory rows the same way, now that the dead URLs are corrected.
UPDATE public.campsite_facilities f SET nearby_service_id = s.id
FROM public.nearby_services s
WHERE f.source = 'recreation_gov'
  AND f.kind = 'campground'
  AND s.type = 'campground'
  AND s.reservation_url = 'https://www.recreation.gov/camping/campgrounds/' || f.source_facility_id;

-- Missouri parks link by their mostateparks.com page, the only stable
-- identifier on those rows — reservation_url is the bare icampmo.com homepage.
UPDATE public.campsite_facilities f SET nearby_service_id = s.id
FROM public.nearby_services s
WHERE f.source = 'mo_state_parks'
  AND s.type = 'campground'
  AND s.website = CASE f.source_facility_id
    WHEN '60' THEN 'https://mostateparks.com/park/meramec-state-park'
    WHEN '5'  THEN 'https://mostateparks.com/park/onondaga-cave-state-park'
    WHEN '83' THEN 'https://mostateparks.com/park/st-francois-state-park'
    WHEN '96' THEN 'https://mostateparks.com/park/washington-state-park'
  END;

-- A facility nothing points at is a nightly request spent on nobody.
UPDATE public.campsite_facilities
  SET enabled = FALSE
  WHERE enabled
    AND nps_campground_id IS NULL
    AND nearby_service_id IS NULL;
