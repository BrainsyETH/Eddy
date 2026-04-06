-- File: supabase/migrations/00085_river_visual_reports.sql
-- Add river_visual report type and gauge data columns to community_reports
-- Enables community-submitted photos tagged with gauge readings for
-- condition-aware river visual display

-- ============================================
-- EXTEND REPORT TYPE ENUM
-- Add 'river_visual' to existing report_type enum
-- Handle case where enum may not exist (column may be TEXT)
-- ============================================
DO $$
BEGIN
  -- Check if the report_type enum exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
    -- Enum exists — add the new value if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'report_type'::regtype
        AND enumlabel = 'river_visual'
    ) THEN
      ALTER TYPE report_type ADD VALUE 'river_visual';
    END IF;
  ELSE
    -- Enum doesn't exist — column is likely TEXT, which already accepts any string.
    -- No action needed; the application code handles validation.
    RAISE NOTICE 'report_type enum does not exist, skipping ALTER TYPE (column is likely TEXT)';
  END IF;
END $$;

-- ============================================
-- ADD GAUGE DATA COLUMNS TO COMMUNITY REPORTS
-- Store the gauge readings at the time of photo submission
-- These are used for dynamic condition-band matching
-- ============================================
ALTER TABLE community_reports
ADD COLUMN IF NOT EXISTS gauge_height_ft NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS discharge_cfs NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS gauge_station_id UUID REFERENCES gauge_stations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS submitter_name TEXT;

COMMENT ON COLUMN community_reports.gauge_height_ft IS 'Gauge height in feet at time of photo (auto-populated, user-editable)';
COMMENT ON COLUMN community_reports.discharge_cfs IS 'Discharge in CFS at time of photo (auto-populated, user-editable)';
COMMENT ON COLUMN community_reports.access_point_id IS 'Access point where photo was taken (optional, for granular matching)';
COMMENT ON COLUMN community_reports.gauge_station_id IS 'Gauge station the readings came from';
COMMENT ON COLUMN community_reports.submitter_name IS 'Display name for anonymous/non-authenticated submissions';

-- ============================================
-- INDEXES FOR VISUAL QUERIES
-- Optimized for fetching visuals by river + status
-- ============================================
-- Note: Partial index on type='river_visual' created separately below
-- because new enum values aren't visible within the same transaction.
-- If using TEXT column, this works immediately.
CREATE INDEX IF NOT EXISTS idx_community_reports_visuals
    ON community_reports(river_id, status, type)
    WHERE type = 'river_visual'::text AND status = 'verified'::text;

CREATE INDEX IF NOT EXISTS idx_community_reports_access_point
    ON community_reports(access_point_id)
    WHERE access_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_reports_gauge_station
    ON community_reports(gauge_station_id)
    WHERE gauge_station_id IS NOT NULL;

-- ============================================
-- RLS: Allow anonymous inserts for river_visual reports
-- (existing policy requires auth.uid() IS NOT NULL)
-- We add a service-role bypass for the public API
-- ============================================

-- Update select policy to include river_visual verified reports (already covered by status = 'verified')
-- No change needed for select - existing policy handles it

-- Allow unauthenticated inserts via service role (the API route handles validation)
-- The existing insert policy requires auth, but our API uses the admin/service client
-- so no RLS change is needed for the submission flow.
