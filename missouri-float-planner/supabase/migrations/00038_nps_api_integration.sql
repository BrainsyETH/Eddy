-- Migration: NPS API Integration
-- Adds tables for cached NPS campground data, points of interest,
-- and links NPS campgrounds to existing access points.

-- ─────────────────────────────────────────────────────────────
-- 1. NPS Campgrounds Cache Table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nps_campgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nps_id TEXT UNIQUE NOT NULL,           -- NPS API campground ID
  name TEXT NOT NULL,
  park_code TEXT NOT NULL DEFAULT 'ozar',
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location GEOGRAPHY(Point, 4326),       -- PostGIS point for spatial queries

  -- Reservation info
  reservation_info TEXT,
  reservation_url TEXT,
  nps_url TEXT,                           -- Link to NPS.gov page

  -- Fees (JSONB array of {cost, description, title})
  fees JSONB DEFAULT '[]'::jsonb,

  -- Campsite counts
  total_sites INTEGER DEFAULT 0,
  sites_reservable INTEGER DEFAULT 0,
  sites_first_come INTEGER DEFAULT 0,
  sites_group INTEGER DEFAULT 0,
  sites_tent_only INTEGER DEFAULT 0,
  sites_electrical INTEGER DEFAULT 0,
  sites_rv_only INTEGER DEFAULT 0,
  sites_walk_boat_to INTEGER DEFAULT 0,
  sites_horse INTEGER DEFAULT 0,

  -- Amenities (structured JSONB from NPS API)
  amenities JSONB DEFAULT '{}'::jsonb,

  -- Accessibility
  accessibility JSONB DEFAULT '{}'::jsonb,

  -- Operating hours (JSONB array from NPS API)
  operating_hours JSONB DEFAULT '[]'::jsonb,

  -- Directions
  directions_overview TEXT,
  directions_url TEXT,

  -- Contact info
  contacts JSONB DEFAULT '{}'::jsonb,

  -- Addresses
  addresses JSONB DEFAULT '[]'::jsonb,

  -- Images (JSONB array of {url, title, altText, caption, credit})
  images JSONB DEFAULT '[]'::jsonb,

  -- Weather
  weather_overview TEXT,

  -- Classification (e.g., "Developed Campground", "Limited Development Campground")
  classification TEXT,

  -- Regulations
  regulations_overview TEXT,
  regulations_url TEXT,

  -- Sync metadata
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  raw_data JSONB,                         -- Full NPS API response for this campground

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index on location
CREATE INDEX IF NOT EXISTS idx_nps_campgrounds_location
  ON nps_campgrounds USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_nps_campgrounds_park_code
  ON nps_campgrounds (park_code);

-- ─────────────────────────────────────────────────────────────
-- 2. Points of Interest Table (generic, scalable)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS points_of_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  river_id UUID REFERENCES rivers(id),    -- Assigned river (via proximity matching)
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  body_text TEXT,                          -- Rich description (HTML from NPS)

  -- Type categorization
  type TEXT NOT NULL DEFAULT 'other',      -- spring, cave, historical_site, scenic_viewpoint, waterfall, geological, other
  source TEXT NOT NULL DEFAULT 'nps',      -- nps, manual

  -- NPS-specific fields
  nps_id TEXT UNIQUE,                      -- NPS API place ID (nullable for manual entries)
  nps_url TEXT,                            -- Link to NPS.gov page

  -- Location
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location GEOGRAPHY(Point, 4326),        -- PostGIS point for spatial queries
  river_mile DOUBLE PRECISION,            -- Computed river mile (via snapping)

  -- Display
  images JSONB DEFAULT '[]'::jsonb,       -- [{url, title, altText, caption, credit}]
  amenities TEXT[] DEFAULT '{}',          -- From NPS amenities list
  tags TEXT[] DEFAULT '{}',               -- NPS tags

  -- Visibility
  active BOOLEAN DEFAULT TRUE,            -- Toggle visibility (for filtering non-river POIs)
  is_on_water BOOLEAN DEFAULT FALSE,      -- Strict "on the water" filter

  -- Sync metadata
  last_synced_at TIMESTAMPTZ,
  raw_data JSONB,                         -- Full NPS API response

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index
CREATE INDEX IF NOT EXISTS idx_poi_location
  ON points_of_interest USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_poi_river_id
  ON points_of_interest (river_id);

CREATE INDEX IF NOT EXISTS idx_poi_type
  ON points_of_interest (type);

CREATE INDEX IF NOT EXISTS idx_poi_active_on_water
  ON points_of_interest (active, is_on_water);

-- ─────────────────────────────────────────────────────────────
-- 3. Link NPS campgrounds to access_points
-- ─────────────────────────────────────────────────────────────
ALTER TABLE access_points
  ADD COLUMN IF NOT EXISTS nps_campground_id UUID REFERENCES nps_campgrounds(id);

CREATE INDEX IF NOT EXISTS idx_access_points_nps_campground
  ON access_points (nps_campground_id)
  WHERE nps_campground_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. NPS sync log (track sync runs)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nps_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,                -- 'campgrounds', 'places', 'full'
  park_code TEXT NOT NULL DEFAULT 'ozar',
  campgrounds_synced INTEGER DEFAULT 0,
  places_synced INTEGER DEFAULT 0,
  campgrounds_matched INTEGER DEFAULT 0,
  pois_created INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 5. RLS Policies
-- ─────────────────────────────────────────────────────────────
ALTER TABLE nps_campgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_sync_log ENABLE ROW LEVEL SECURITY;

-- Public read access for NPS campgrounds
CREATE POLICY "nps_campgrounds_public_read" ON nps_campgrounds
  FOR SELECT USING (true);

-- Public read access for active POIs
CREATE POLICY "poi_public_read" ON points_of_interest
  FOR SELECT USING (active = true);

-- Sync log: read for authenticated users only
CREATE POLICY "nps_sync_log_read" ON nps_sync_log
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────
-- 6. Helper function: Find nearest river for a point
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION find_nearest_river(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_max_distance_meters DOUBLE PRECISION DEFAULT 500
)
RETURNS TABLE(
  river_id UUID,
  river_name TEXT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.name,
    ST_Distance(
      r.geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) AS distance_meters
  FROM rivers r
  WHERE r.active = true
    AND ST_DWithin(
      r.geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_max_distance_meters
    )
  ORDER BY distance_meters
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────
-- 7. Helper function: Match NPS campgrounds to access points
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_nps_campground_to_access_point(
  p_nps_campground_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_name TEXT,
  p_max_distance_meters DOUBLE PRECISION DEFAULT 2000
)
RETURNS UUID AS $$
DECLARE
  v_access_point_id UUID;
BEGIN
  -- Find the closest access point within distance threshold
  -- Prefer name similarity + proximity
  SELECT ap.id INTO v_access_point_id
  FROM access_points ap
  WHERE ap.approved = true
    AND ST_DWithin(
      COALESCE(ap.location_snap, ap.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_max_distance_meters
    )
  ORDER BY
    -- Boost score for name matches (case-insensitive partial match)
    CASE
      WHEN LOWER(ap.name) = LOWER(p_name) THEN 0
      WHEN LOWER(ap.name) LIKE '%' || LOWER(SPLIT_PART(p_name, ' ', 1)) || '%' THEN 1
      ELSE 2
    END,
    ST_Distance(
      COALESCE(ap.location_snap, ap.location_orig)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )
  LIMIT 1;

  -- Link the campground to the access point
  IF v_access_point_id IS NOT NULL THEN
    UPDATE access_points
    SET nps_campground_id = p_nps_campground_id
    WHERE id = v_access_point_id;
  END IF;

  RETURN v_access_point_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- 8. Function: Get POIs for a river
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_river_pois(
  p_river_id UUID
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  slug TEXT,
  description TEXT,
  type TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  river_mile DOUBLE PRECISION,
  images JSONB,
  nps_url TEXT,
  amenities TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    poi.id,
    poi.name,
    poi.slug,
    poi.description,
    poi.type,
    poi.latitude,
    poi.longitude,
    poi.river_mile,
    poi.images,
    poi.nps_url,
    poi.amenities
  FROM points_of_interest poi
  WHERE poi.river_id = p_river_id
    AND poi.active = true
    AND poi.is_on_water = true
  ORDER BY poi.river_mile NULLS LAST, poi.name;
END;
$$ LANGUAGE plpgsql STABLE;
