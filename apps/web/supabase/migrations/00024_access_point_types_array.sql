-- Migration: Change access_points type from single value to array
-- This allows access points to have multiple types (e.g., both campground and boat_ramp)

-- Add new types column as TEXT array
ALTER TABLE access_points
ADD COLUMN IF NOT EXISTS types TEXT[] DEFAULT '{}';

-- Migrate existing type data to types array
UPDATE access_points
SET types = ARRAY[type]
WHERE type IS NOT NULL AND (types IS NULL OR types = '{}');

-- Add comment for documentation
COMMENT ON COLUMN access_points.types IS 'Array of access point types (boat_ramp, gravel_bar, campground, bridge, access, park)';

-- Note: Keeping the old 'type' column for now for backwards compatibility
-- It can be removed in a future migration once all code is updated
