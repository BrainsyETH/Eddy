-- Append-only campsite occupancy history.
--
-- campsite_availability is pruned seven days behind today (pruneOldNights),
-- so nothing survives to say what a typical September Saturday looks like.
-- This table keeps one snapshot per facility, per night, per lead time, and
-- is never pruned. It is the baseline for relative camping-demand bands and
-- fill-pace projection later (docs/crowd-signal.md, Phase 4).
--
-- Written by the availability sync (src/lib/camping/history.ts), upserted so
-- the several nightly cron slots converge on the latest reading of the day.
--
-- Size: ~40 facilities x 365 nights x 3 lead times ≈ 45k rows a year.
--
-- Coverage is recorded explicitly: an enabled facility with no reading for
-- the night is stored with status 'missing', so a later baseline can tell an
-- unobserved campground from an empty one.
--
-- `source` is kept on every row because Missouri State Parks' feed cannot
-- separate booked from closed (usedirect.ts); a baseline must be able to
-- exclude those rows.

CREATE TABLE IF NOT EXISTS public.campsite_occupancy_history (
  facility_id UUID NOT NULL
    REFERENCES public.campsite_facilities(id) ON DELETE CASCADE,

  -- The night measured, in the facility's local day.
  date DATE NOT NULL,

  -- Days between the capture's local date and `date`: 0, 7 or 14.
  lead_days SMALLINT NOT NULL CHECK (lead_days IN (0, 7, 14)),

  source TEXT NOT NULL CHECK (source IN ('recreation_gov', 'mo_state_parks')),

  -- 'missing' = enabled facility, no reading for this night at capture time.
  status TEXT NOT NULL
    CHECK (status IN ('open', 'full', 'closed', 'not_yet_released', 'missing')),

  sites_open INTEGER CHECK (sites_open IS NULL OR sites_open >= 0),
  sites_reservable INTEGER CHECK (sites_reservable IS NULL OR sites_reservable >= 0),

  -- Largest bookable inventory seen in the 30 days before capture: the same
  -- sizing baseline the camping overview serves as expectedReservable.
  expected_reservable INTEGER,

  -- When the provider was read (campsite_availability.fetched_at); null when missing.
  observed_at TIMESTAMPTZ,
  -- When this snapshot row was written.
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (facility_id, date, lead_days)
);

CREATE INDEX IF NOT EXISTS idx_campsite_occupancy_history_date
  ON public.campsite_occupancy_history (date);

ALTER TABLE public.campsite_occupancy_history ENABLE ROW LEVEL SECURITY;

-- Mirrors campsite_availability: public reads, service-role writes.
DROP POLICY IF EXISTS "campsite_occupancy_history is public"
  ON public.campsite_occupancy_history;
CREATE POLICY "campsite_occupancy_history is public"
  ON public.campsite_occupancy_history FOR SELECT USING (true);

COMMENT ON TABLE public.campsite_occupancy_history IS
  'Never-pruned nightly occupancy snapshots at lead 0/7/14 days, with explicit missing coverage. Baseline for camping demand.';
