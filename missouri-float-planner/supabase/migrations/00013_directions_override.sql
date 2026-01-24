-- Migration: Add directions_override field to access_points
-- This allows admins to specify a custom Google Maps destination
-- (POI name, address, or URL) instead of using raw coordinates

ALTER TABLE access_points
ADD COLUMN directions_override TEXT;

COMMENT ON COLUMN access_points.directions_override IS
'Optional override for Google Maps directions destination. Can be a place name, address, or Google Maps URL. When set, this is used instead of raw coordinates for directions links.';
