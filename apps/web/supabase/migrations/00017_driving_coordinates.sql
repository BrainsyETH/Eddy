-- Add separate driving coordinates for accurate shuttle time calculation
-- These point to parking lots/actual driving destinations, not river access points

ALTER TABLE access_points
ADD COLUMN IF NOT EXISTS driving_lat NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS driving_lng NUMERIC(10,6);

COMMENT ON COLUMN access_points.driving_lat IS 'Latitude for driving directions (parking lot). If NULL, uses location_orig.';
COMMENT ON COLUMN access_points.driving_lng IS 'Longitude for driving directions (parking lot). If NULL, uses location_orig.';

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_access_points_driving_coords
ON access_points(driving_lat, driving_lng)
WHERE driving_lat IS NOT NULL AND driving_lng IS NOT NULL;
