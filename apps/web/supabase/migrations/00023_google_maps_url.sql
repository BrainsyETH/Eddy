-- Migration: Add google_maps_url column to access_points table
-- This allows storing a Google Maps link for each access point

-- Add google_maps_url column
ALTER TABLE access_points
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN access_points.google_maps_url IS 'Google Maps URL for this access point, displayed as a link in the River Guide';
