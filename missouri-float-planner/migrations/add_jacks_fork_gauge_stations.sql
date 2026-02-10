-- Migration: Add Jacks Fork gauge stations if they don't exist
-- Run this BEFORE add_jacks_fork_gauge_thresholds.sql
--
-- USGS Gauge Sites for Jacks Fork River (official names):
-- 07065495 - Jacks Fork at Alley Spring, MO (at Alley Spring/mill)
-- 07066000 - Jacks Fork at Eminence, MO (lower, near confluence)
-- Note: 07065200 = Jacks Fork near Mountain View, MO (upper) is in seed.

-- Add Alley Spring gauge (07065495)
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
  'Jacks Fork at Alley Spring, MO',
  ST_SetSRID(ST_MakePoint(-91.4447, 37.1537), 4326),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM gauge_stations WHERE usgs_site_id = '07065495'
);

-- Add Eminence gauge (07066000)
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
  'Jacks Fork at Eminence, MO',
  ST_SetSRID(ST_MakePoint(-91.3578, 37.1506), 4326),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM gauge_stations WHERE usgs_site_id = '07066000'
);

-- Verify gauge stations
SELECT
  usgs_site_id,
  name,
  active,
  ST_AsText(location) as coordinates
FROM gauge_stations
WHERE usgs_site_id IN ('07065495', '07066000')
ORDER BY usgs_site_id;
