-- Store the Mapbox route geometry alongside cached drive times so /api/plan
-- can serve its shuttle route line from cache without a fresh Directions call.
ALTER TABLE drive_time_cache ADD COLUMN IF NOT EXISTS route_geometry JSONB;
