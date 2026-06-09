-- File: supabase/migrations/00002_tables.sql
-- Missouri Float Planner Database Schema

-- ============================================
-- RIVERS
-- ============================================
CREATE TABLE rivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,

    -- Geometry (WGS84 - SRID 4326)
    geom GEOMETRY(LineString, 4326) NOT NULL,
    length_miles NUMERIC(6,2),

    -- Flow direction reference
    -- Convention: measure 0 = downstream end (mouth/confluence)
    downstream_point GEOMETRY(Point, 4326),
    direction_verified BOOLEAN DEFAULT FALSE,

    -- Display
    description TEXT,
    difficulty_rating TEXT,  -- e.g., "Class I", "Class I-II"
    region TEXT,             -- e.g., "Ozarks", "Central Missouri"

    -- Source reference
    nhd_feature_id TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rivers_geom ON rivers USING GIST (geom);
CREATE INDEX idx_rivers_slug ON rivers(slug);

-- ============================================
-- GAUGE STATIONS
-- ============================================
CREATE TABLE gauge_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usgs_site_id TEXT UNIQUE NOT NULL,  -- e.g., "07019000"
    name TEXT NOT NULL,

    -- Location
    location GEOMETRY(Point, 4326) NOT NULL,

    -- Metadata
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gauge_stations_location ON gauge_stations USING GIST (location);

-- ============================================
-- RIVER <-> GAUGE RELATIONSHIP
-- ============================================
CREATE TABLE river_gauges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,
    gauge_station_id UUID REFERENCES gauge_stations(id) ON DELETE CASCADE,

    -- Distance from floatable section
    distance_from_section_miles NUMERIC(5,2),
    is_primary BOOLEAN DEFAULT FALSE,

    -- Accuracy threshold
    accuracy_warning_threshold_miles NUMERIC(5,2) DEFAULT 15.0,

    -- River-specific thresholds
    threshold_unit TEXT DEFAULT 'ft' CHECK (threshold_unit IN ('ft', 'cfs')),

    level_too_low NUMERIC(6,2),
    level_low NUMERIC(6,2),
    level_optimal_min NUMERIC(6,2),
    level_optimal_max NUMERIC(6,2),
    level_high NUMERIC(6,2),
    level_dangerous NUMERIC(6,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(river_id, gauge_station_id)
);

-- ============================================
-- GAUGE READINGS
-- ============================================
CREATE TABLE gauge_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gauge_station_id UUID REFERENCES gauge_stations(id) ON DELETE CASCADE,

    reading_timestamp TIMESTAMPTZ NOT NULL,
    gauge_height_ft NUMERIC(6,2),
    discharge_cfs NUMERIC(10,2),

    fetched_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(gauge_station_id, reading_timestamp)
);

CREATE INDEX idx_gauge_readings_latest
    ON gauge_readings(gauge_station_id, reading_timestamp DESC);

-- ============================================
-- ACCESS POINTS
-- ============================================
CREATE TABLE access_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    slug TEXT NOT NULL,

    -- Location
    location_orig GEOMETRY(Point, 4326) NOT NULL,
    location_snap GEOMETRY(Point, 4326),

    -- Linear reference (miles from downstream end)
    river_mile_downstream NUMERIC(6,2),
    river_mile_upstream NUMERIC(6,2),

    -- Classification
    type TEXT DEFAULT 'access' CHECK (type IN (
        'boat_ramp', 'gravel_bar', 'campground', 'bridge', 'access', 'park'
    )),
    is_public BOOLEAN DEFAULT TRUE,
    ownership TEXT,  -- 'MDC', 'NPS', 'private', 'county', 'city', 'state_park'

    -- Details
    description TEXT,
    amenities TEXT[],  -- ARRAY['parking', 'restrooms', 'camping', 'boat_ramp', 'picnic']
    parking_info TEXT,
    fee_required BOOLEAN DEFAULT FALSE,
    fee_notes TEXT,

    -- Admin workflow
    approved BOOLEAN DEFAULT FALSE,
    submitted_by UUID,
    approved_by UUID,
    approved_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(river_id, slug)
);

CREATE INDEX idx_access_points_geom ON access_points USING GIST (location_snap);
CREATE INDEX idx_access_points_river ON access_points(river_id, river_mile_downstream);
CREATE INDEX idx_access_points_approved ON access_points(approved) WHERE approved = TRUE;

-- ============================================
-- RIVER HAZARDS
-- ============================================
CREATE TABLE river_hazards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'low_water_dam', 'portage', 'strainer', 'rapid', 'private_property',
        'waterfall', 'shoal', 'bridge_piling', 'other'
    )),

    -- Location
    location GEOMETRY(Point, 4326),
    river_mile_downstream NUMERIC(6,2),

    -- Details
    description TEXT,
    severity TEXT CHECK (severity IN ('info', 'caution', 'warning', 'danger')),
    portage_required BOOLEAN DEFAULT FALSE,
    portage_side TEXT,  -- 'left', 'right', 'either'

    -- Conditional visibility
    active BOOLEAN DEFAULT TRUE,
    seasonal_notes TEXT,
    min_safe_level NUMERIC(6,2),  -- Only relevant above this level
    max_safe_level NUMERIC(6,2),  -- Only relevant below this level

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_river_hazards_river ON river_hazards(river_id, river_mile_downstream);

-- ============================================
-- DRIVE TIME CACHE
-- ============================================
CREATE TABLE drive_time_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    start_access_id UUID REFERENCES access_points(id) ON DELETE CASCADE,
    end_access_id UUID REFERENCES access_points(id) ON DELETE CASCADE,

    drive_minutes NUMERIC(5,1),
    drive_miles NUMERIC(6,2),
    route_summary TEXT,

    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

    UNIQUE(start_access_id, end_access_id)
);

-- ============================================
-- VESSEL TYPES
-- ============================================
CREATE TABLE vessel_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,

    -- Base speeds (mph) adjusted by flow conditions
    speed_low_water NUMERIC(3,1),
    speed_normal NUMERIC(3,1),
    speed_high_water NUMERIC(3,1),

    description TEXT,
    icon TEXT,  -- Icon identifier for UI
    sort_order INT DEFAULT 0
);

-- ============================================
-- SAVED FLOAT PLANS
-- ============================================
CREATE TABLE float_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_code TEXT UNIQUE NOT NULL,  -- For shareable URLs

    river_id UUID REFERENCES rivers(id),
    start_access_id UUID REFERENCES access_points(id),
    end_access_id UUID REFERENCES access_points(id),
    vessel_type_id UUID REFERENCES vessel_types(id),

    -- Snapshot at creation
    distance_miles NUMERIC(5,2),
    estimated_float_minutes INT,
    drive_back_minutes INT,
    condition_at_creation TEXT,
    gauge_reading_at_creation NUMERIC(6,2),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    view_count INT DEFAULT 0,
    last_viewed_at TIMESTAMPTZ
);

CREATE INDEX idx_float_plans_short_code ON float_plans(short_code);

-- ============================================
-- USER ROLES (for admin)
-- ============================================
CREATE TABLE user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
