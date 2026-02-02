-- Migration: Fix Eleven Point River gauge associations
--
-- Problem: Eleven Point River may have incorrect gauge associations
-- (Black River gauges, Louse Creek, Greer which doesn't exist as USGS gauge)
--
-- Correct Eleven Point USGS Gauge:
-- - 07071500 - Eleven Point River near Bardley, MO (16 mi downstream from Greer)
--
-- Local Knowledge Thresholds (based on MSR data - average 1.7 ft):
-- - Average/Normal: ~1.7 ft (MSR data)
-- - Too Low: < 1.0 ft - scraping likely
-- - Low: 1.0-1.5 ft - floatable but some dragging
-- - Okay: 1.5-2.0 ft - decent conditions
-- - Optimal: 2.0-3.5 ft - good floating
-- - High: 4.0+ ft - suggest another day, murky/muddy conditions
-- - Dangerous: 5.0+ ft - Forest Service closes, outfitters won't put in
-- - Flood stage: 10 ft (NWS)
--
-- Gauges that should NOT be on Eleven Point:
-- - Black River gauges (07061500, 07062500, 07062575, 07063000, etc.)
-- - Any "Greer" gauge (doesn't exist in USGS)
-- - Louse Creek (no USGS gauge exists)

DO $$
DECLARE
  eleven_point_id UUID;
  bardley_gauge_id UUID;
BEGIN
  -- Get Eleven Point River ID
  SELECT id INTO eleven_point_id FROM rivers
  WHERE slug = 'eleven-point-river' OR name ILIKE '%eleven point%'
  LIMIT 1;

  IF eleven_point_id IS NULL THEN
    RAISE NOTICE 'Eleven Point River not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Eleven Point River ID: %', eleven_point_id;

  -- Step 1: Remove ALL existing associations for Eleven Point River
  -- We'll rebuild with only the correct gauge
  DELETE FROM river_gauges
  WHERE river_id = eleven_point_id;

  RAISE NOTICE 'Removed all existing Eleven Point gauge associations';

  -- Step 2: Find the Bardley gauge
  SELECT id INTO bardley_gauge_id FROM gauge_stations
  WHERE usgs_site_id = '07071500';

  IF bardley_gauge_id IS NULL THEN
    -- Try to add the gauge if it doesn't exist
    INSERT INTO gauge_stations (
      id,
      usgs_site_id,
      name,
      latitude,
      longitude,
      location
    ) VALUES (
      gen_random_uuid(),
      '07071500',
      'Eleven Point River near Bardley, MO',
      36.64869,
      -91.20083,
      ST_SetSRID(ST_MakePoint(-91.20083, 36.64869), 4326)::geography
    )
    RETURNING id INTO bardley_gauge_id;

    RAISE NOTICE 'Created Bardley gauge station';
  END IF;

  -- Step 3: Add the correct Bardley gauge association with proper thresholds
  IF bardley_gauge_id IS NOT NULL THEN
    INSERT INTO river_gauges (
      gauge_station_id,
      river_id,
      is_primary,
      level_too_low,
      level_low,
      level_optimal_min,
      level_optimal_max,
      level_high,
      level_dangerous
    ) VALUES (
      bardley_gauge_id,
      eleven_point_id,
      true,   -- Primary gauge (only gauge for Eleven Point)
      1.0,    -- Too low - scraping likely (MSR: below average 1.7 ft)
      1.5,    -- Low - floatable but some dragging
      2.0,    -- Optimal min - good conditions
      3.5,    -- Optimal max - ideal floating
      4.0,    -- High - suggest another day, murky/muddy conditions likely
      5.0     -- Dangerous - Forest Service closes, outfitters won't put in
    )
    ON CONFLICT (gauge_station_id, river_id)
    DO UPDATE SET
      is_primary = EXCLUDED.is_primary,
      level_too_low = EXCLUDED.level_too_low,
      level_low = EXCLUDED.level_low,
      level_optimal_min = EXCLUDED.level_optimal_min,
      level_optimal_max = EXCLUDED.level_optimal_max,
      level_high = EXCLUDED.level_high,
      level_dangerous = EXCLUDED.level_dangerous;

    RAISE NOTICE 'Added Bardley gauge (07071500) as primary for Eleven Point River';
  ELSE
    RAISE NOTICE 'ERROR: Could not find or create Bardley gauge (07071500)';
  END IF;

  -- Step 4: Remove Eleven Point associations from any Black River gauges
  -- (in case they were incorrectly linked the other way)
  DELETE FROM river_gauges
  WHERE gauge_station_id IN (
    SELECT id FROM gauge_stations
    WHERE usgs_site_id IN ('07061500', '07062500', '07062575', '07063000', '07061600', '07061270', '07068510')
  )
  AND river_id = eleven_point_id;

  RAISE NOTICE 'Cleaned up any Black River gauge associations from Eleven Point';

END $$;

-- Verify the fix: Show Eleven Point associations
SELECT
  gs.name as gauge_name,
  gs.usgs_site_id,
  r.name as river_name,
  rg.is_primary,
  rg.level_too_low,
  rg.level_low,
  rg.level_optimal_min as level_optimal,
  rg.level_optimal_max,
  rg.level_high,
  rg.level_dangerous
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE r.name ILIKE '%eleven point%'
ORDER BY rg.is_primary DESC, gs.name;
