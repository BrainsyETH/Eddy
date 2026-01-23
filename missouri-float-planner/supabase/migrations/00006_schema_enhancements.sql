-- File: supabase/migrations/00006_schema_enhancements.sql
-- Missouri Float Planner Schema Enhancements
-- Adds segment_cache, community_reports, shuttle_services tables,
-- smoothed_geometries column, and high_frequency_flag

-- ============================================
-- RIVERS TABLE ENHANCEMENT
-- Add smoothed_geometries for pre-processed bezier curves
-- ============================================
ALTER TABLE rivers
ADD COLUMN IF NOT EXISTS smoothed_geometries JSONB;

COMMENT ON COLUMN rivers.smoothed_geometries IS 'Pre-processed bezier-smoothed river geometry for map rendering performance';

-- ============================================
-- GAUGE STATIONS TABLE ENHANCEMENT
-- Add high_frequency_flag for adaptive polling
-- ============================================
ALTER TABLE gauge_stations
ADD COLUMN IF NOT EXISTS high_frequency_flag BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN gauge_stations.high_frequency_flag IS 'When TRUE, poll this gauge every 15 minutes instead of 60 (rapid water level change detected)';

-- ============================================
-- SEGMENT CACHE TABLE
-- Pre-calculated ST_LineSubstring results for performance
-- ============================================
CREATE TABLE IF NOT EXISTS segment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to access points
    start_access_id UUID REFERENCES access_points(id) ON DELETE CASCADE,
    end_access_id UUID REFERENCES access_points(id) ON DELETE CASCADE,
    
    -- Cached segment geometry and distance
    segment_geom GEOMETRY(LineString, 4326),
    distance_miles NUMERIC(5,2),
    
    -- Cache metadata
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicates
    UNIQUE(start_access_id, end_access_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_cache_access_points 
    ON segment_cache(start_access_id, end_access_id);

COMMENT ON TABLE segment_cache IS 'Pre-calculated river segment geometries to reduce PostGIS overhead during high-traffic periods';

-- ============================================
-- COMMUNITY REPORTS TABLE
-- User-submitted hazard/condition reports
-- ============================================
CREATE TYPE report_type AS ENUM ('hazard', 'water_level', 'debris');
CREATE TYPE report_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE IF NOT EXISTS community_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reporter information
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Location reference
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,
    hazard_id UUID REFERENCES river_hazards(id) ON DELETE SET NULL,
    
    -- Report details
    type report_type NOT NULL,
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    river_mile NUMERIC(6,2),
    
    -- Content
    image_url TEXT,
    description TEXT NOT NULL,
    
    -- Moderation
    status report_status DEFAULT 'pending',
    verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_reports_river 
    ON community_reports(river_id, status);
CREATE INDEX IF NOT EXISTS idx_community_reports_location 
    ON community_reports USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_community_reports_user 
    ON community_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_status 
    ON community_reports(status) WHERE status = 'pending';

COMMENT ON TABLE community_reports IS 'User-submitted reports for hazards, water levels, and debris';

-- ============================================
-- SHUTTLE SERVICES TABLE
-- Link private rental businesses to access points
-- ============================================
CREATE TABLE IF NOT EXISTS shuttle_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Business information
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    
    -- Contact information
    phone TEXT,
    email TEXT,
    website TEXT,
    
    -- Location/coverage
    primary_access_point_id UUID REFERENCES access_points(id) ON DELETE SET NULL,
    service_radius_miles NUMERIC(5,2),
    
    -- Services offered
    offers_shuttle BOOLEAN DEFAULT TRUE,
    offers_rental BOOLEAN DEFAULT FALSE,
    offers_camping BOOLEAN DEFAULT FALSE,
    rental_types TEXT[], -- e.g., ['canoe', 'kayak', 'raft', 'tube']
    
    -- Pricing (optional, for display)
    shuttle_price_range TEXT,
    rental_price_range TEXT,
    
    -- Operating hours
    hours_of_operation JSONB,
    seasonal_notes TEXT,
    
    -- Status
    active BOOLEAN DEFAULT TRUE,
    verified BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shuttle_services_access_point 
    ON shuttle_services(primary_access_point_id);
CREATE INDEX IF NOT EXISTS idx_shuttle_services_active 
    ON shuttle_services(active) WHERE active = TRUE;

COMMENT ON TABLE shuttle_services IS 'Shuttle and rental businesses linked to river access points';

-- ============================================
-- SHUTTLE SERVICES <-> ACCESS POINTS JUNCTION
-- Many-to-many relationship for services covering multiple access points
-- ============================================
CREATE TABLE IF NOT EXISTS shuttle_service_coverage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shuttle_service_id UUID REFERENCES shuttle_services(id) ON DELETE CASCADE,
    access_point_id UUID REFERENCES access_points(id) ON DELETE CASCADE,
    
    -- Coverage type
    is_pickup BOOLEAN DEFAULT TRUE,
    is_dropoff BOOLEAN DEFAULT TRUE,
    
    UNIQUE(shuttle_service_id, access_point_id)
);

CREATE INDEX IF NOT EXISTS idx_shuttle_coverage_service 
    ON shuttle_service_coverage(shuttle_service_id);
CREATE INDEX IF NOT EXISTS idx_shuttle_coverage_access 
    ON shuttle_service_coverage(access_point_id);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE TRIGGER community_reports_updated_at
    BEFORE UPDATE ON community_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER shuttle_services_updated_at
    BEFORE UPDATE ON shuttle_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AUTO-CALCULATE RIVER MILE FOR COMMUNITY REPORTS
-- ============================================
CREATE OR REPLACE FUNCTION auto_calculate_report_river_mile()
RETURNS TRIGGER AS $$
DECLARE
    snap_result RECORD;
BEGIN
    IF NEW.river_id IS NOT NULL AND NEW.coordinates IS NOT NULL THEN
        SELECT * INTO snap_result
        FROM snap_to_river(NEW.coordinates, NEW.river_id);
        
        NEW.river_mile := snap_result.river_mile;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER community_reports_auto_river_mile
    BEFORE INSERT OR UPDATE OF coordinates, river_id ON community_reports
    FOR EACH ROW EXECUTE FUNCTION auto_calculate_report_river_mile();

-- ============================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================

-- Enable RLS
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_service_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_cache ENABLE ROW LEVEL SECURITY;

-- Community Reports: Anyone can read verified reports, users can create, admins can manage
CREATE POLICY community_reports_select ON community_reports
    FOR SELECT USING (
        status = 'verified' 
        OR auth.uid() = user_id 
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY community_reports_insert ON community_reports
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY community_reports_update ON community_reports
    FOR UPDATE USING (
        auth.uid() = user_id 
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY community_reports_delete ON community_reports
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Shuttle Services: Anyone can read active services, admins can manage
CREATE POLICY shuttle_services_select ON shuttle_services
    FOR SELECT USING (active = TRUE OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY shuttle_services_insert ON shuttle_services
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY shuttle_services_update ON shuttle_services
    FOR UPDATE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY shuttle_services_delete ON shuttle_services
    FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Shuttle Service Coverage: Same as shuttle_services
CREATE POLICY shuttle_coverage_select ON shuttle_service_coverage
    FOR SELECT USING (TRUE);

CREATE POLICY shuttle_coverage_insert ON shuttle_service_coverage
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY shuttle_coverage_update ON shuttle_service_coverage
    FOR UPDATE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY shuttle_coverage_delete ON shuttle_service_coverage
    FOR DELETE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Segment Cache: Anyone can read, service role can write
CREATE POLICY segment_cache_select ON segment_cache
    FOR SELECT USING (TRUE);

CREATE POLICY segment_cache_insert ON segment_cache
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY segment_cache_update ON segment_cache
    FOR UPDATE USING (TRUE);

CREATE POLICY segment_cache_delete ON segment_cache
    FOR DELETE USING (TRUE);
