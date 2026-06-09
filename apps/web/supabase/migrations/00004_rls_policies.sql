-- File: supabase/migrations/00004_rls_policies.sql
-- Row Level Security Policies for Missouri Float Planner

-- Enable RLS on all tables
ALTER TABLE rivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gauge_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE river_gauges ENABLE ROW LEVEL SECURITY;
ALTER TABLE gauge_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE river_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_time_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE float_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PUBLIC READ POLICIES
-- ============================================

-- Rivers: Anyone can read
CREATE POLICY "Rivers are viewable by everyone"
    ON rivers FOR SELECT
    USING (true);

-- Gauge stations: Anyone can read
CREATE POLICY "Gauge stations are viewable by everyone"
    ON gauge_stations FOR SELECT
    USING (true);

-- River gauges: Anyone can read
CREATE POLICY "River gauges are viewable by everyone"
    ON river_gauges FOR SELECT
    USING (true);

-- Gauge readings: Anyone can read
CREATE POLICY "Gauge readings are viewable by everyone"
    ON gauge_readings FOR SELECT
    USING (true);

-- Access points: Anyone can read approved points
CREATE POLICY "Approved access points are viewable by everyone"
    ON access_points FOR SELECT
    USING (approved = true);

-- River hazards: Anyone can read active hazards
CREATE POLICY "Active hazards are viewable by everyone"
    ON river_hazards FOR SELECT
    USING (active = true);

-- Vessel types: Anyone can read
CREATE POLICY "Vessel types are viewable by everyone"
    ON vessel_types FOR SELECT
    USING (true);

-- Float plans: Anyone can read (they're shareable)
CREATE POLICY "Float plans are viewable by everyone"
    ON float_plans FOR SELECT
    USING (true);

-- Drive time cache: Anyone can read
CREATE POLICY "Drive time cache is viewable by everyone"
    ON drive_time_cache FOR SELECT
    USING (true);

-- ============================================
-- PUBLIC WRITE POLICIES
-- ============================================

-- Float plans: Anyone can create
CREATE POLICY "Anyone can create float plans"
    ON float_plans FOR INSERT
    WITH CHECK (true);

-- Float plans: Anyone can update view count
CREATE POLICY "Anyone can update float plan view count"
    ON float_plans FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- ============================================
-- ADMIN HELPER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ADMIN POLICIES
-- ============================================

-- Rivers: Admin can do everything
CREATE POLICY "Admins can manage rivers"
    ON rivers FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Gauge stations: Admin can manage
CREATE POLICY "Admins can manage gauge stations"
    ON gauge_stations FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- River gauges: Admin can manage
CREATE POLICY "Admins can manage river gauges"
    ON river_gauges FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Gauge readings: Admin can insert/update (for cron job)
CREATE POLICY "Admins can manage gauge readings"
    ON gauge_readings FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Access points: Admin can see all, manage all
CREATE POLICY "Admins can view all access points"
    ON access_points FOR SELECT
    USING (is_admin());

CREATE POLICY "Admins can manage access points"
    ON access_points FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- River hazards: Admin can manage
CREATE POLICY "Admins can manage hazards"
    ON river_hazards FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Vessel types: Admin can manage
CREATE POLICY "Admins can manage vessel types"
    ON vessel_types FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Drive time cache: Admin can manage
CREATE POLICY "Admins can manage drive time cache"
    ON drive_time_cache FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- User roles: Admin can view
CREATE POLICY "Admins can view user roles"
    ON user_roles FOR SELECT
    USING (is_admin() OR user_id = auth.uid());

-- ============================================
-- SERVICE ROLE BYPASS
-- Note: Service role bypasses RLS by default
-- This is used for cron jobs and background tasks
-- ============================================
