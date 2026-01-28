-- Migration: Add Jacks Fork River gauge associations with proper thresholds
-- Based on local knowledge from experienced floaters
--
-- Jacks Fork USGS Gauges:
-- - Buck Hollow (07065495) - Upper Jacks Fork, mile 7
-- - Alley Spring (07066000) - Lower Jacks Fork, mile 31
-- - Eminence (07066510) - Lower Jacks Fork, mile 37
--
-- Note: The gauge at Two Rivers (where Current & Jacks Fork converge)
-- should remain associated with both rivers.

-- First, ensure the Jacks Fork River exists in the rivers table
-- (You may need to adjust this if the river already exists with a different slug)
INSERT INTO rivers (id, name, slug, length_miles, region, description)
SELECT
  gen_random_uuid(),
  'Jacks Fork River',
  'jacks-fork-river',
  40.0,
  'Ozarks',
  'A tributary of the Current River and one of the wildest, most scenic Ozark streams. Its deep valley is nearly a canyon with no bottomland fields for the first 25 floatable miles. More rain-dependent than the spring-fed Current.'
WHERE NOT EXISTS (
  SELECT 1 FROM rivers WHERE slug = 'jacks-fork-river' OR name ILIKE '%jacks fork%'
);

-- Get the Jacks Fork River ID
DO $$
DECLARE
  jacks_fork_id UUID;
  buck_hollow_gauge_id UUID;
  alley_spring_gauge_id UUID;
  eminence_gauge_id UUID;
BEGIN
  -- Get Jacks Fork River ID
  SELECT id INTO jacks_fork_id FROM rivers
  WHERE slug = 'jacks-fork-river' OR name ILIKE '%jacks fork%'
  LIMIT 1;

  IF jacks_fork_id IS NULL THEN
    RAISE NOTICE 'Jacks Fork River not found in rivers table. Please add it first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Jacks Fork River ID: %', jacks_fork_id;

  -- Find Buck Hollow gauge (USGS 07065495)
  SELECT id INTO buck_hollow_gauge_id FROM gauge_stations
  WHERE usgs_site_id = '07065495';

  -- Find Alley Spring gauge (USGS 07066000)
  SELECT id INTO alley_spring_gauge_id FROM gauge_stations
  WHERE usgs_site_id = '07066000';

  -- Find Eminence gauge (USGS 07066510)
  SELECT id INTO eminence_gauge_id FROM gauge_stations
  WHERE usgs_site_id = '07066510';

  -- Add Buck Hollow gauge association (if gauge exists)
  IF buck_hollow_gauge_id IS NOT NULL THEN
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
      buck_hollow_gauge_id,
      jacks_fork_id,
      true,  -- Primary gauge for upper Jacks Fork
      1.5,   -- Below this, very difficult even with empty canoe
      2.0,   -- Minimum for light boat, will drag with gear
      2.5,   -- Good conditions start
      3.5,   -- Upper end of optimal
      3.65,  -- Flood level begins
      4.0    -- Parks close the river
    )
    ON CONFLICT (gauge_station_id, river_id)
    DO UPDATE SET
      level_too_low = EXCLUDED.level_too_low,
      level_low = EXCLUDED.level_low,
      level_optimal_min = EXCLUDED.level_optimal_min,
      level_optimal_max = EXCLUDED.level_optimal_max,
      level_high = EXCLUDED.level_high,
      level_dangerous = EXCLUDED.level_dangerous;

    RAISE NOTICE 'Added/updated Buck Hollow gauge for Jacks Fork';
  ELSE
    RAISE NOTICE 'Buck Hollow gauge (07065495) not found in gauge_stations';
  END IF;

  -- Add Alley Spring gauge association (if gauge exists)
  IF alley_spring_gauge_id IS NOT NULL THEN
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
      alley_spring_gauge_id,
      jacks_fork_id,
      false,  -- Secondary gauge (lower river)
      1.0,    -- Very low
      1.5,    -- Average level, may drag if loaded
      2.0,    -- Good conditions
      3.5,    -- Upper optimal
      4.0,    -- River closes
      5.3     -- Flood level
    )
    ON CONFLICT (gauge_station_id, river_id)
    DO UPDATE SET
      level_too_low = EXCLUDED.level_too_low,
      level_low = EXCLUDED.level_low,
      level_optimal_min = EXCLUDED.level_optimal_min,
      level_optimal_max = EXCLUDED.level_optimal_max,
      level_high = EXCLUDED.level_high,
      level_dangerous = EXCLUDED.level_dangerous;

    RAISE NOTICE 'Added/updated Alley Spring gauge for Jacks Fork';
  ELSE
    RAISE NOTICE 'Alley Spring gauge (07066000) not found in gauge_stations';
  END IF;

  -- Add Eminence gauge association (if gauge exists)
  IF eminence_gauge_id IS NOT NULL THEN
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
      eminence_gauge_id,
      jacks_fork_id,
      false,  -- Secondary gauge (lower river near confluence)
      1.5,    -- Very low
      2.0,    -- Average level
      2.5,    -- Good conditions
      4.0,    -- Upper optimal
      4.5,    -- Getting high
      6.4     -- Flood level
    )
    ON CONFLICT (gauge_station_id, river_id)
    DO UPDATE SET
      level_too_low = EXCLUDED.level_too_low,
      level_low = EXCLUDED.level_low,
      level_optimal_min = EXCLUDED.level_optimal_min,
      level_optimal_max = EXCLUDED.level_optimal_max,
      level_high = EXCLUDED.level_high,
      level_dangerous = EXCLUDED.level_dangerous;

    RAISE NOTICE 'Added/updated Eminence gauge for Jacks Fork';
  ELSE
    RAISE NOTICE 'Eminence gauge (07066510) not found in gauge_stations';
  END IF;

END $$;

-- Verify the associations were created
SELECT
  gs.name as gauge_name,
  gs.usgs_site_id,
  r.name as river_name,
  rg.is_primary,
  rg.level_too_low,
  rg.level_low,
  rg.level_optimal_min,
  rg.level_optimal_max,
  rg.level_high,
  rg.level_dangerous
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE r.name ILIKE '%jacks fork%'
ORDER BY rg.is_primary DESC, gs.name;
