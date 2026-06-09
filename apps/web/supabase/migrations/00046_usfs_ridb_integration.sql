-- Migration: 00046_usfs_ridb_integration.sql
-- Description: Add RIDB (Recreation.gov) facility tracking to access_points
-- and create helper function for proximity-based access point matching.
-- Supports USFS campground sync from Recreation Information Database API.

-- ─────────────────────────────────────────────────────────────
-- 1. Add RIDB columns to access_points
-- ─────────────────────────────────────────────────────────────

-- RIDB Facility ID for deduplication and re-sync
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS ridb_facility_id TEXT;

COMMENT ON COLUMN public.access_points.ridb_facility_id IS
'Recreation.gov RIDB Facility ID. Used to link access points to RIDB data and prevent duplicates during sync.';

-- Unique index to prevent duplicate RIDB facilities
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_points_ridb_facility_id
ON public.access_points (ridb_facility_id)
WHERE ridb_facility_id IS NOT NULL;

-- RIDB raw data cache (facility metadata from Recreation.gov)
ALTER TABLE public.access_points
ADD COLUMN IF NOT EXISTS ridb_data JSONB;

COMMENT ON COLUMN public.access_points.ridb_data IS
'Cached RIDB facility metadata: activities, addresses, media, stay limits, ADA access, etc.';

-- ─────────────────────────────────────────────────────────────
-- 2. Helper function: Find nearby access point for matching
-- ─────────────────────────────────────────────────────────────

-- Used by USFS sync to find existing access points near a RIDB facility
-- before creating a new one (prevents duplicates).
CREATE OR REPLACE FUNCTION find_nearby_access_point(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_name TEXT,
  p_river_id UUID,
  p_max_distance_meters DOUBLE PRECISION DEFAULT 2000
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ap.id,
    ap.name,
    ST_Distance(
      COALESCE(ap.location_snap, ap.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_meters
  FROM access_points ap
  WHERE ap.river_id = p_river_id
    AND ST_DWithin(
      COALESCE(ap.location_snap, ap.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_max_distance_meters
    )
  ORDER BY
    -- Prefer name matches (case-insensitive partial)
    CASE
      WHEN LOWER(ap.name) = LOWER(p_name) THEN 0
      WHEN LOWER(ap.name) LIKE '%' || LOWER(SPLIT_PART(p_name, ' ', 1)) || '%' THEN 1
      ELSE 2
    END,
    -- Then by distance
    ST_Distance(
      COALESCE(ap.location_snap, ap.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────
-- 3. USFS sync log table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usfs_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL DEFAULT 'full',
  facilities_fetched INTEGER DEFAULT 0,
  facilities_filtered INTEGER DEFAULT 0,
  campgrounds_synced INTEGER DEFAULT 0,
  campgrounds_matched INTEGER DEFAULT 0,
  access_points_created INTEGER DEFAULT 0,
  access_points_updated INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usfs_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usfs_sync_log_public_read" ON usfs_sync_log
  FOR SELECT USING (true);
