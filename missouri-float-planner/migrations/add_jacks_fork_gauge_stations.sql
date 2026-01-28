-- Migration: Add Jacks Fork gauge stations if they don't exist
-- Run this BEFORE add_jacks_fork_gauge_thresholds.sql
--
-- USGS Gauge Sites for Jacks Fork River:
-- 07065495 - Jacks Fork at Buck Hollow near Mountain View, MO (Upper, mile 7)
-- 07066000 - Jacks Fork at Alley Spring, MO (Middle, mile 31)
-- 07066510 - Jacks Fork at Eminence, MO (Lower, mile 37)

-- Add Buck Hollow gauge
INSERT INTO gauge_stations (
  id,
  usgs_site_id,
  name,
  location,
  active
)
SELECT
  gen_random_uuid(),
  '07065495',
  'Jacks Fork at Buck Hollow near Mountain View',
  ST_SetSRID(ST_MakePoint(-91.4447, 36.9881), 4326),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM gauge_stations WHERE usgs_site_id = '07065495'
);

-- Add Alley Spring gauge
INSERT INTO gauge_stations (
  id,
  usgs_site_id,
  name,
  location,
  active
)
SELECT
  gen_random_uuid(),
  '07066000',
  'Jacks Fork at Alley Spring',
  ST_SetSRID(ST_MakePoint(-91.4464, 37.1400), 4326),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM gauge_stations WHERE usgs_site_id = '07066000'
);

-- Add Eminence gauge
INSERT INTO gauge_stations (
  id,
  usgs_site_id,
  name,
  location,
  active
)
SELECT
  gen_random_uuid(),
  '07066510',
  'Jacks Fork at Eminence',
  ST_SetSRID(ST_MakePoint(-91.3578, 37.1506), 4326),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM gauge_stations WHERE usgs_site_id = '07066510'
);

-- Verify gauge stations
SELECT
  usgs_site_id,
  name,
  active,
  ST_AsText(location) as coordinates
FROM gauge_stations
WHERE usgs_site_id IN ('07065495', '07066000', '07066510')
ORDER BY usgs_site_id;
