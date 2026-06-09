-- Migration: 00047_usfs_poi_integration.sql
-- Description: Add RIDB fields to points_of_interest so USFS campgrounds
-- sync as pending POIs (not access_points). Admins can review and optionally
-- promote to access points.

-- ─────────────────────────────────────────────────────────────
-- 1. Add RIDB columns to points_of_interest
-- ─────────────────────────────────────────────────────────────

-- RIDB Facility ID for deduplication during sync
ALTER TABLE public.points_of_interest
ADD COLUMN IF NOT EXISTS ridb_facility_id TEXT;

COMMENT ON COLUMN public.points_of_interest.ridb_facility_id IS
'Recreation.gov RIDB Facility ID. Used to deduplicate during USFS sync.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_poi_ridb_facility_id
ON public.points_of_interest (ridb_facility_id)
WHERE ridb_facility_id IS NOT NULL;

-- Cached RIDB metadata
ALTER TABLE public.points_of_interest
ADD COLUMN IF NOT EXISTS ridb_data JSONB;

COMMENT ON COLUMN public.points_of_interest.ridb_data IS
'Cached RIDB facility metadata: activities, addresses, media, stay limits, ADA access, etc.';

-- ─────────────────────────────────────────────────────────────
-- 2. Add campground-specific fields to POIs
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.points_of_interest
ADD COLUMN IF NOT EXISTS reservation_url TEXT;

ALTER TABLE public.points_of_interest
ADD COLUMN IF NOT EXISTS fee_description TEXT;

ALTER TABLE public.points_of_interest
ADD COLUMN IF NOT EXISTS managing_agency TEXT;

-- ─────────────────────────────────────────────────────────────
-- 3. Update USFS sync log for POI tracking
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.usfs_sync_log
ADD COLUMN IF NOT EXISTS pois_created INTEGER DEFAULT 0;

ALTER TABLE public.usfs_sync_log
ADD COLUMN IF NOT EXISTS pois_updated INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- 4. Helper: Find nearby POI for deduplication during sync
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION find_nearby_poi(
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
    poi.id,
    poi.name,
    ST_Distance(
      poi.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_meters
  FROM points_of_interest poi
  WHERE poi.river_id = p_river_id
    AND poi.location IS NOT NULL
    AND ST_DWithin(
      poi.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_max_distance_meters
    )
  ORDER BY
    CASE
      WHEN LOWER(poi.name) = LOWER(p_name) THEN 0
      WHEN LOWER(poi.name) LIKE '%' || LOWER(SPLIT_PART(p_name, ' ', 1)) || '%' THEN 1
      ELSE 2
    END,
    ST_Distance(
      poi.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
