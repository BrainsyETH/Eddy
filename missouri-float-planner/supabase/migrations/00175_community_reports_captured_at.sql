-- File: supabase/migrations/00175_community_reports_captured_at.sql
-- Adds capture-time metadata to community_reports so a River Visual photo can be
-- tagged with WHEN it was taken (from the image's EXIF DateTimeOriginal) and how
-- its gauge reading was determined. This lets a photo uploaded weeks or years
-- after the fact be bucketed by the river level at capture time (backfilled from
-- USGS) rather than the level at upload time.

ALTER TABLE community_reports
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reading_source TEXT;

-- Constrain reading_source to the known provenance values (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_reports_reading_source_check'
  ) THEN
    ALTER TABLE community_reports
      ADD CONSTRAINT community_reports_reading_source_check
      CHECK (reading_source IS NULL OR reading_source IN ('live', 'historical', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN community_reports.captured_at IS 'When the photo was taken (from EXIF DateTimeOriginal), when known';
COMMENT ON COLUMN community_reports.reading_source IS 'How gauge_height_ft/discharge_cfs were determined: live (current reading at submit), historical (USGS reading at capture time), or manual (user-entered)';
