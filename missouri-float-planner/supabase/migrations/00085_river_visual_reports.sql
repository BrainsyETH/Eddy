-- File: supabase/migrations/00085_river_visual_reports.sql
-- Creates the community_reports table (if not exists) with river_visual support
-- and adds gauge data columns for condition-aware photo matching

-- ============================================
-- ENSURE community_reports TABLE EXISTS
-- Creates full table with all columns including river_visual fields
-- If the table already exists, ALTER TABLE adds the new columns
-- ============================================
CREATE TABLE IF NOT EXISTS community_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reporter information
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Location reference
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,
    hazard_id UUID REFERENCES river_hazards(id) ON DELETE SET NULL,

    -- Report details (TEXT type for max compatibility — validated in application)
    type TEXT NOT NULL CHECK (type IN ('hazard', 'water_level', 'debris', 'river_visual')),
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    river_mile NUMERIC(6,2),

    -- Content
    image_url TEXT,
    description TEXT NOT NULL,

    -- Moderation
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- River visual fields
    gauge_height_ft NUMERIC(6,2),
    discharge_cfs NUMERIC(10,2),
    access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL,
    gauge_station_id UUID REFERENCES gauge_stations(id) ON DELETE SET NULL,
    submitter_name TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADD NEW COLUMNS (if table already existed without them)
-- Each ADD COLUMN IF NOT EXISTS is safe to run on both new and existing tables
-- ============================================
ALTER TABLE community_reports
ADD COLUMN IF NOT EXISTS gauge_height_ft NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS discharge_cfs NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS gauge_station_id UUID REFERENCES gauge_stations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS submitter_name TEXT;

-- Allow 'river_visual' in the type column if using CHECK constraint
-- Drop and recreate the check constraint to include the new value
DO $$
BEGIN
  -- Try to drop existing check constraint (name may vary)
  BEGIN
    ALTER TABLE community_reports DROP CONSTRAINT IF EXISTS community_reports_type_check;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- Constraint doesn't exist, that's fine
  END;

  -- Try to add the updated check constraint
  BEGIN
    ALTER TABLE community_reports
    ADD CONSTRAINT community_reports_type_check
    CHECK (type IN ('hazard', 'water_level', 'debris', 'river_visual'));
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Constraint already exists with this name
  END;
END $$;

-- Also handle enum type if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'report_type'::regtype
        AND enumlabel = 'river_visual'
    ) THEN
      ALTER TYPE report_type ADD VALUE 'river_visual';
    END IF;
  END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE community_reports IS 'User-submitted reports for hazards, water levels, debris, and river visuals';
COMMENT ON COLUMN community_reports.gauge_height_ft IS 'Gauge height in feet at time of photo (auto-populated, user-editable)';
COMMENT ON COLUMN community_reports.discharge_cfs IS 'Discharge in CFS at time of photo (auto-populated, user-editable)';
COMMENT ON COLUMN community_reports.access_point_id IS 'Access point where photo was taken (optional, for granular matching)';
COMMENT ON COLUMN community_reports.gauge_station_id IS 'Gauge station the readings came from';
COMMENT ON COLUMN community_reports.submitter_name IS 'Display name for anonymous/non-authenticated submissions';

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_community_reports_river
    ON community_reports(river_id, status);
CREATE INDEX IF NOT EXISTS idx_community_reports_location
    ON community_reports USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_community_reports_user
    ON community_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_status
    ON community_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_community_reports_visuals
    ON community_reports(river_id, status, type)
    WHERE type = 'river_visual' AND status = 'verified';
CREATE INDEX IF NOT EXISTS idx_community_reports_access_point
    ON community_reports(access_point_id)
    WHERE access_point_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_reports_gauge_station
    ON community_reports(gauge_station_id)
    WHERE gauge_station_id IS NOT NULL;

-- ============================================
-- RLS POLICIES (idempotent — uses IF NOT EXISTS pattern via DO block)
-- ============================================
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Select: anyone can read verified reports, users can read own, admins can read all
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_reports' AND policyname = 'community_reports_select') THEN
    CREATE POLICY community_reports_select ON community_reports
      FOR SELECT USING (
        status = 'verified'
        OR auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
      );
  END IF;

  -- Insert: authenticated users can create reports
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_reports' AND policyname = 'community_reports_insert') THEN
    CREATE POLICY community_reports_insert ON community_reports
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- Update: own reports or admin
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_reports' AND policyname = 'community_reports_update') THEN
    CREATE POLICY community_reports_update ON community_reports
      FOR UPDATE USING (
        auth.uid() = user_id
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
      );
  END IF;

  -- Delete: admin only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'community_reports' AND policyname = 'community_reports_delete') THEN
    CREATE POLICY community_reports_delete ON community_reports
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ============================================
-- TRIGGER: auto-update updated_at
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'community_reports_updated_at'
  ) THEN
    CREATE TRIGGER community_reports_updated_at
      BEFORE UPDATE ON community_reports
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
