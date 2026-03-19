-- supabase/migrations/00079_deactivate_bennett_spring_gauge.sql
--
-- Safety net: ensure USGS 06923700 (Bennett Spring) is not linked to
-- the Niangua River and is marked inactive.
--
-- 06923700 is a water-quality-only station with NO real-time gauge height
-- data. The proximity-based gauge linker may have auto-associated it with
-- the Niangua. Migration 00077 should have cleaned this up, but this
-- migration ensures the station is fully deactivated so the cron job
-- doesn't attempt to fetch readings from it.
--
-- The correct Niangua gauges are:
--   06923250 - Niangua River at Windyville, MO (primary)
--   06923950 - Niangua River at Tunnel Dam near Macks Creek, MO (secondary)

-- Step 1: Remove any river_gauges link for Bennett Spring (06923700)
DELETE FROM river_gauges
WHERE gauge_station_id IN (
  SELECT id FROM gauge_stations WHERE usgs_site_id = '06923700'
);

-- Step 2: Deactivate the station so the cron never fetches it
UPDATE gauge_stations
SET active = false
WHERE usgs_site_id = '06923700';

-- Step 3: Verify Niangua has exactly the two correct gauges
DO $$
DECLARE
  niangua_gauge_count INTEGER;
  windyville_exists BOOLEAN;
  tunnel_dam_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO niangua_gauge_count
  FROM river_gauges rg
  JOIN rivers r ON r.id = rg.river_id
  WHERE r.slug = 'niangua';

  SELECT EXISTS(
    SELECT 1 FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.slug = 'niangua' AND gs.usgs_site_id = '06923250'
  ) INTO windyville_exists;

  SELECT EXISTS(
    SELECT 1 FROM river_gauges rg
    JOIN rivers r ON r.id = rg.river_id
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    WHERE r.slug = 'niangua' AND gs.usgs_site_id = '06923950'
  ) INTO tunnel_dam_exists;

  RAISE NOTICE 'Niangua gauge count: % (expected 2)', niangua_gauge_count;
  RAISE NOTICE 'Windyville (06923250) linked: %', windyville_exists;
  RAISE NOTICE 'Tunnel Dam (06923950) linked: %', tunnel_dam_exists;

  IF NOT windyville_exists OR NOT tunnel_dam_exists THEN
    RAISE WARNING 'Niangua is missing expected gauge associations! Run migration 00077 first.';
  END IF;
END $$;
