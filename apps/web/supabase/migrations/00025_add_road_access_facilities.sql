-- Migration: Add road_access and facilities columns to access_points
-- These columns provide detailed information about road conditions and available facilities

ALTER TABLE access_points
ADD COLUMN road_access TEXT,
ADD COLUMN facilities TEXT;

-- Add comments for documentation
COMMENT ON COLUMN access_points.road_access IS 'Description of road conditions and directions to access the point';
COMMENT ON COLUMN access_points.facilities IS 'Description of available facilities (restrooms, camping, water, etc.)';
