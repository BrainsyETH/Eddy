-- File: supabase/migrations/20260817210000_community_report_gauge_context.sql
-- Records WHERE a River Visual photo sits relative to the gauge that supplied
-- its reading, and WHICH WAY the river was moving when it was taken.
--
-- Why this exists: a stage number on its own is not the whole story a moderator
-- (or a reader) needs. "3.4 ft" is a different river depending on whether it is
-- on the way up or on the way down, and a photo taken eight miles below the
-- gauge is not showing you the water the gauge measured. Both facts were
-- derivable at submit time and neither was kept, so the review page showed a
-- bare number with no way to judge it.
--
-- All of it is DERIVED at submit time and frozen, deliberately. The trend at
-- capture time is a historical fact that stops being computable cheaply once
-- the USGS continuous window ages out (~120 days), and the mile offset would
-- otherwise be recomputed on every read of a row that cannot move.

ALTER TABLE community_reports
  ADD COLUMN IF NOT EXISTS gauge_trend TEXT,
  ADD COLUMN IF NOT EXISTS gauge_trend_delta NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gauge_trend_window_hours NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS gauge_trend_unit TEXT,
  ADD COLUMN IF NOT EXISTS gauge_relation TEXT,
  ADD COLUMN IF NOT EXISTS gauge_offset_miles NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS reading_observed_at TIMESTAMPTZ;

-- Constrain the two enum-ish columns (idempotent, matching the style of
-- community_reports_reading_source_check in 00175).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_reports_gauge_trend_check'
  ) THEN
    ALTER TABLE community_reports
      ADD CONSTRAINT community_reports_gauge_trend_check
      CHECK (gauge_trend IS NULL OR gauge_trend IN ('rising', 'falling', 'steady'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_reports_gauge_relation_check'
  ) THEN
    ALTER TABLE community_reports
      ADD CONSTRAINT community_reports_gauge_relation_check
      CHECK (gauge_relation IS NULL OR gauge_relation IN ('upstream', 'downstream', 'at'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_reports_gauge_trend_unit_check'
  ) THEN
    ALTER TABLE community_reports
      ADD CONSTRAINT community_reports_gauge_trend_unit_check
      CHECK (gauge_trend_unit IS NULL OR gauge_trend_unit IN ('ft', 'cfs'));
  END IF;
END $$;

COMMENT ON COLUMN community_reports.gauge_trend IS
  'Which way the river was moving when the photo was taken: rising, falling or steady. Derived at submit time from the USGS continuous window around captured_at.';
COMMENT ON COLUMN community_reports.gauge_trend_delta IS
  'Signed change over gauge_trend_window_hours, in gauge_trend_unit.';
COMMENT ON COLUMN community_reports.gauge_trend_unit IS
  'Unit gauge_trend_delta is measured in: ft when the site reports stage, else cfs. Stored rather than inferred from gauge_height_ft — a submitter who hand-enters a stage for a discharge-only site would otherwise have their cfs delta relabelled as feet.';
COMMENT ON COLUMN community_reports.gauge_trend_window_hours IS
  'Hours between the two samples the trend was measured across. Reported rather than assumed: USGS gaps mean the window is often not the 6h that was asked for.';
COMMENT ON COLUMN community_reports.gauge_relation IS
  'Where the PHOTO sits relative to the gauge that supplied its reading: upstream, downstream, or at (within half a mile). Not the gauge relative to the photo.';
COMMENT ON COLUMN community_reports.gauge_offset_miles IS
  'Absolute river miles between the photo and its gauge. Read with gauge_relation, which carries the direction.';
COMMENT ON COLUMN community_reports.reading_observed_at IS
  'The USGS observation timestamp actually used for gauge_height_ft/discharge_cfs. Differs from captured_at by up to the search window, and is the honest answer to "when was this measured".';

-- river_mile has existed on this table since 00085 and was never populated.
-- The derivation now snaps every river_visual submission to the flowline, which
-- is what makes gauge_relation computable at all.
COMMENT ON COLUMN community_reports.river_mile IS
  'Mile from the headwaters of the photo location, from snap_to_river. Populated for river_visual submissions; compared against river_gauges.river_mile to derive gauge_relation.';
