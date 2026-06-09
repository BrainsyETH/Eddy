-- File: supabase/migrations/00008_river_mile_markers.sql
-- River Mile Markers Reference Table
-- Authoritative source of truth for river mile markers (mile 0.0 = headwaters, increasing downstream)

CREATE TABLE river_mile_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id UUID REFERENCES rivers(id) ON DELETE CASCADE,
    mile NUMERIC(6,2) NOT NULL,
    name TEXT,
    description TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique mile markers per river
    UNIQUE(river_id, mile)
);

CREATE INDEX idx_river_mile_markers_river ON river_mile_markers(river_id, mile);
CREATE INDEX idx_river_mile_markers_mile ON river_mile_markers(mile);

COMMENT ON TABLE river_mile_markers IS 'Authoritative reference for river mile markers. Mile 0.0 = headwaters, increasing downstream. Used to validate and correct access point mile assignments.';
COMMENT ON COLUMN river_mile_markers.mile IS 'River mile from headwaters (0.0 = start of river, increasing downstream)';
COMMENT ON COLUMN river_mile_markers.name IS 'Landmark/access point name at this mile marker';
COMMENT ON COLUMN river_mile_markers.description IS 'Description or notes about this mile marker location';
