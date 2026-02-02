-- supabase/migrations/00020_recalibrate_thresholds.sql
-- Recalibrate gauge thresholds based on detailed Missouri Scenic Rivers feedback
-- and local outfitter/paddler experience
--
-- Sources:
-- - https://missouriscenicrivers.com/
-- - Local outfitter recommendations
-- - First-hand paddler feedback
-- - NPS ranger guidance

-- ============================================
-- CURRENT RIVER - AKERS GAUGE (07064533)
-- ============================================
-- Upper Current River - narrower, shallower than lower sections
-- Average: ~1.5 ft
-- Below 2.0 ft: may drag in spots
-- River closes at 4.0 ft flood level
-- Personal cut-offs: 1.0 ft (empty), 1.2 ft (loaded)
UPDATE river_gauges rg
SET
    level_too_low = 1.0,        -- Admin's cut-off for empty canoe, significant dragging
    level_low = 1.5,            -- Average level, some dragging expected below
    level_optimal_min = 2.0,    -- Good floating begins, minimal dragging
    level_optimal_max = 3.5,    -- Upper comfortable range before swift current
    level_high = 4.0,           -- Flood level - NPS closes river here
    level_dangerous = 4.5       -- Above close level, dangerous conditions
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07064533';

-- ============================================
-- CURRENT RIVER - VAN BUREN GAUGE (07067000)
-- ============================================
-- Lower Current River - wider, deeper section
-- Average: ~3.4 ft
-- General floating recommended: < 4.5 ft
-- Motor vessels only: 4.5-5.0 ft
-- Tubes best below 4.0 ft
-- Flood level: 5.0 ft
UPDATE river_gauges rg
SET
    level_too_low = 2.5,        -- Very shallow, not recommended
    level_low = 3.0,            -- Marginal floating
    level_optimal_min = 3.2,    -- Just below average, good floating
    level_optimal_max = 4.0,    -- Tubes best below this, general floating still OK to 4.5
    level_high = 4.5,           -- Motor vessels only beyond this point
    level_dangerous = 5.0       -- Flood level - do not float
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07067000';

-- ============================================
-- CURRENT RIVER - DONIPHAN GAUGE (07068000)
-- ============================================
-- Lower Current River near confluence
-- Average: ~1.0 ft
-- Much lower readings than Van Buren due to wider channel
-- Flood stage: 13 ft
UPDATE river_gauges rg
SET
    level_too_low = 0.5,        -- Very low water
    level_low = 0.8,            -- Marginal
    level_optimal_min = 1.0,    -- Average level, good floating
    level_optimal_max = 2.5,    -- Upper comfortable range
    level_high = 4.0,           -- High water
    level_dangerous = 6.0       -- Approaching flood conditions (stage at 13)
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07068000';

-- ============================================
-- JACKS FORK - BUCK HOLLOW (07064533) if exists
-- ============================================
-- Upper Jacks Fork near Mountain View
-- Average: ~1.0 ft
-- Below 2.2 ft: will drag empty canoe
-- Good between 2.5-3.5 ft (Ted Haviland)
-- 2021 update: 2.0+ reasonable for light boat, 2.5+ with gear
-- Flood stage: 4.0 ft (Parks closes)
-- Note: This gauge may not be in the system yet, skip if not found

-- ============================================
-- JACKS FORK - ALLEY SPRING GAUGE (07065200)
-- ============================================
-- Lower Jacks Fork below Alley Spring
-- Average: ~1.5 ft
-- Below 1.5 ft: may drag, especially if loaded
-- Close at 4.0 ft
-- Flood level: 5.3 ft
UPDATE river_gauges rg
SET
    level_too_low = 1.0,        -- Significant dragging
    level_low = 1.3,            -- Some dragging expected
    level_optimal_min = 1.5,    -- Average, minimal dragging
    level_optimal_max = 3.5,    -- Upper comfortable range
    level_high = 4.0,           -- River closes here
    level_dangerous = 5.3       -- Flood level
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'jacks-fork'
  AND gs.usgs_site_id = '07065200';

-- ============================================
-- ELEVEN POINT RIVER - BARDLEY GAUGE (07071500)
-- ============================================
-- Fed by Greer Spring (2nd largest in MO)
-- Average: ~3.0 ft
-- Optimal: 3.0-3.5 ft
-- 4+ ft: undesirable (murky/muddy from rain)
-- 4-5 ft: experienced floaters only
-- 5 ft: Forest Service closes river (highest outfitters will put in)
-- Action level: 8 ft
-- Flood stage: 10 ft
UPDATE river_gauges rg
SET
    level_too_low = 2.5,        -- Too shallow
    level_low = 2.8,            -- Marginal
    level_optimal_min = 3.0,    -- Average, good conditions
    level_optimal_max = 3.5,    -- Upper optimal range per feedback
    level_high = 4.5,           -- Undesirable, experienced only (4-5 ft range)
    level_dangerous = 5.0       -- Forest Service closes, do not float
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'eleven-point'
  AND gs.usgs_site_id = '07071500';

-- ============================================
-- VERIFY UPDATES
-- ============================================
-- Run this to see the updated thresholds:
-- SELECT
--     r.name as river,
--     gs.name as gauge,
--     gs.usgs_site_id,
--     rg.level_too_low || ' ft' as too_low,
--     rg.level_low || ' ft' as low,
--     rg.level_optimal_min || '-' || rg.level_optimal_max || ' ft' as optimal,
--     rg.level_high || ' ft' as high,
--     rg.level_dangerous || ' ft' as dangerous,
--     rg.is_primary
-- FROM river_gauges rg
-- JOIN rivers r ON r.id = rg.river_id
-- JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
-- WHERE r.slug IN ('current', 'jacks-fork', 'eleven-point')
-- ORDER BY r.name, gs.name;
