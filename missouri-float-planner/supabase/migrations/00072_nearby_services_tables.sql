-- File: supabase/migrations/00072_nearby_services_tables.sql
-- Creates nearby_services and service_rivers tables to replace shuttle_services.
-- These tables provide a comprehensive directory of outfitters, campgrounds, and
-- lodging that serve the rivers on eddy.guide.

-- ============================================
-- ENUM TYPES
-- ============================================
CREATE TYPE service_type AS ENUM ('outfitter', 'campground', 'cabin_lodge');

CREATE TYPE service_status AS ENUM (
    'active',
    'seasonal',
    'temporarily_closed',
    'permanently_closed',
    'unverified'
);

CREATE TYPE service_offering AS ENUM (
    'canoe_rental',
    'kayak_rental',
    'raft_rental',
    'tube_rental',
    'jon_boat_rental',
    'shuttle',
    'camping_primitive',
    'camping_rv',
    'cabins',
    'lodge_rooms',
    'general_store',
    'food_service',
    'showers',
    'fishing_supplies',
    'horseback_riding',
    'swimming_pool',
    'wifi'
);

-- ============================================
-- NEARBY SERVICES TABLE
-- Canonical directory of businesses that serve river floaters
-- ============================================
CREATE TABLE IF NOT EXISTS nearby_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    type service_type NOT NULL,

    -- Contact
    phone TEXT,
    phone_toll_free TEXT,
    email TEXT,
    website TEXT,

    -- Address
    address_line1 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'MO',
    zip TEXT,

    -- Location (null if unverified)
    latitude NUMERIC(9,6),
    longitude NUMERIC(10,6),

    -- Details
    description TEXT,
    services_offered service_offering[] DEFAULT '{}',
    seasonal_notes TEXT,

    -- Authorization
    nps_authorized BOOLEAN NOT NULL DEFAULT FALSE,
    usfs_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    -- Ownership tracking
    owner_name TEXT,
    ownership_changed_at DATE,

    -- Status & verification
    status service_status NOT NULL DEFAULT 'unverified',
    verified_source TEXT,
    notes TEXT,  -- Internal notes, not displayed to users

    -- Display
    display_order INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nearby_services_type ON nearby_services(type);
CREATE INDEX idx_nearby_services_status ON nearby_services(status) WHERE status = 'active';
CREATE INDEX idx_nearby_services_city ON nearby_services(city);
CREATE INDEX idx_nearby_services_display ON nearby_services(display_order);

COMMENT ON TABLE nearby_services IS 'Directory of outfitters, campgrounds, and lodging serving rivers on eddy.guide';
COMMENT ON COLUMN nearby_services.notes IS 'Internal notes — not displayed to users. Ownership changes, review summaries, etc.';
COMMENT ON COLUMN nearby_services.nps_authorized IS 'NPS authorized concessioner within Ozark National Scenic Riverways';
COMMENT ON COLUMN nearby_services.usfs_authorized IS 'USFS authorized outfitter within Mark Twain National Forest';
COMMENT ON COLUMN nearby_services.display_order IS 'Sort order on river pages. Lower numbers appear first.';

-- ============================================
-- SERVICE <-> RIVERS JOIN TABLE
-- Many-to-many: a service can serve multiple rivers
-- ============================================
CREATE TABLE IF NOT EXISTS service_rivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES nearby_services(id) ON DELETE CASCADE,
    river_id UUID NOT NULL REFERENCES rivers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    section_description TEXT,  -- e.g., "Akers to Pulltite", "Upper Current"

    UNIQUE(service_id, river_id)
);

CREATE INDEX idx_service_rivers_service ON service_rivers(service_id);
CREATE INDEX idx_service_rivers_river ON service_rivers(river_id);

COMMENT ON TABLE service_rivers IS 'Links nearby services to the rivers they serve. Many services operate on multiple rivers.';

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER nearby_services_updated_at
    BEFORE UPDATE ON nearby_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE nearby_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_rivers ENABLE ROW LEVEL SECURITY;

-- Anyone can read active/seasonal/unverified services
CREATE POLICY nearby_services_select ON nearby_services
    FOR SELECT USING (
        status IN ('active', 'seasonal', 'unverified')
        OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY nearby_services_insert ON nearby_services
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY nearby_services_update ON nearby_services
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY nearby_services_delete ON nearby_services
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Service rivers: anyone can read, admins can manage
CREATE POLICY service_rivers_select ON service_rivers
    FOR SELECT USING (TRUE);

CREATE POLICY service_rivers_insert ON service_rivers
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY service_rivers_update ON service_rivers
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY service_rivers_delete ON service_rivers
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- DROP OLD SHUTTLE SERVICES TABLES
-- These are replaced by the more comprehensive nearby_services
-- ============================================

-- Drop tables (IF EXISTS handles missing tables gracefully).
-- Dropping a table automatically drops its policies, triggers, and indexes.
-- Drop coverage first due to FK dependency.
DROP TABLE IF EXISTS shuttle_service_coverage;
DROP TABLE IF EXISTS shuttle_services;
