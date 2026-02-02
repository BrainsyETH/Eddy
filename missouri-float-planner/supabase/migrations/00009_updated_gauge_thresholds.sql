-- supabase/migrations/00009_updated_gauge_thresholds.sql
-- Updated gauge thresholds based on USGS data and local float outfitter recommendations
--
-- Sources:
-- - https://missouriscenicrivers.com/current-river-levels
-- - https://rivers.moherp.org/
-- - https://water.noaa.gov/
-- - Local float outfitter recommendations
-- - USGS historical statistics

-- ============================================
-- CURRENT RIVER - VAN BUREN GAUGE (07067000)
-- ============================================
-- Average: ~3.4 ft
-- Optimal floating: 3.0-4.5 ft
-- Above 4.5 ft: Motor vessels only, swift current
-- Flood level (local): 5.0 ft
-- NWS Flood stage: 20 ft
UPDATE river_gauges rg
SET
    level_too_low = 2.0,        -- Significant dragging, portaging needed
    level_low = 2.5,            -- Low but floatable, some dragging
    level_optimal_min = 3.0,    -- Good conditions begin
    level_optimal_max = 4.5,    -- Above this gets fast
    level_high = 5.0,           -- Local flood level, swift current
    level_dangerous = 8.0       -- Dangerous high water
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07067000';

-- ============================================
-- CURRENT RIVER - DONIPHAN GAUGE (07068000)
-- ============================================
-- Lower Current River - wider, deeper, needs more water
-- Different characteristics than upper river
UPDATE river_gauges rg
SET
    level_too_low = 3.0,        -- Lower section needs more water
    level_low = 4.0,            -- Marginal floating
    level_optimal_min = 4.5,    -- Good conditions
    level_optimal_max = 8.0,    -- Wider section handles more water
    level_high = 10.0,          -- Getting fast
    level_dangerous = 15.0      -- Flood conditions
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07068000';

-- ============================================
-- JACKS FORK - ALLEY SPRING GAUGE (07065200)
-- ============================================
-- Smaller river, spring-fed below Alley Spring
-- Average: ~2.0 ft
-- Floatable year-round below Alley Spring due to spring flow
-- River closes at 4.0 ft
-- Flood level: 6.4 ft, Flood stage: 12 ft
UPDATE river_gauges rg
SET
    level_too_low = 1.2,        -- Heavy dragging, not recommended
    level_low = 1.5,            -- Low, dragging in spots
    level_optimal_min = 2.0,    -- Good conditions, minimal dragging
    level_optimal_max = 3.5,    -- Above this gets pushy
    level_high = 4.0,           -- River typically closes here
    level_dangerous = 6.0       -- Near flood level
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'jacks-fork'
  AND gs.usgs_site_id = '07065200';

-- ============================================
-- ELEVEN POINT RIVER - BARDLEY GAUGE (07071500)
-- ============================================
-- Fed by Greer Spring (2nd largest in MO)
-- Class I-II, intermediate experience
-- Flood stage: 10+ ft
UPDATE river_gauges rg
SET
    level_too_low = 2.0,        -- Too low for comfortable floating
    level_low = 2.5,            -- Low but floatable
    level_optimal_min = 3.0,    -- Good conditions
    level_optimal_max = 5.5,    -- Spring-fed, handles flow well
    level_high = 7.0,           -- High water, experienced only
    level_dangerous = 10.0      -- Approaching flood stage
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'eleven-point'
  AND gs.usgs_site_id = '07071500';

-- ============================================
-- MERAMEC RIVER - EUREKA GAUGE (07019000)
-- ============================================
-- Lower Meramec, wider section near St. Louis
-- Higher volume river
UPDATE river_gauges rg
SET
    level_too_low = 2.0,        -- Very shallow, lots of dragging
    level_low = 3.0,            -- Low but passable
    level_optimal_min = 4.0,    -- Good floating
    level_optimal_max = 7.0,    -- Larger river handles volume
    level_high = 9.0,           -- Fast current
    level_dangerous = 14.0      -- Flood conditions
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'meramec'
  AND gs.usgs_site_id = '07019000';

-- ============================================
-- MERAMEC RIVER - SULLIVAN GAUGE (07018500)
-- ============================================
-- Upper Meramec, narrower than Eureka section
UPDATE river_gauges rg
SET
    level_too_low = 1.5,        -- Shallow, significant dragging
    level_low = 2.0,            -- Low water
    level_optimal_min = 2.5,    -- Good conditions
    level_optimal_max = 5.0,    -- Upper limit of comfortable
    level_high = 7.0,           -- Swift current
    level_dangerous = 10.0      -- High water danger
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'meramec'
  AND gs.usgs_site_id = '07018500';

-- ============================================
-- NIANGUA RIVER - HARTVILLE GAUGE (06923500)
-- ============================================
-- Ozark stream, moderate size
UPDATE river_gauges rg
SET
    level_too_low = 1.5,        -- Too shallow
    level_low = 2.0,            -- Marginal
    level_optimal_min = 2.5,    -- Good floating
    level_optimal_max = 5.0,    -- Comfortable range
    level_high = 7.0,           -- Getting swift
    level_dangerous = 10.0      -- Flood danger
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'niangua'
  AND gs.usgs_site_id = '06923500';

-- ============================================
-- BIG PINEY RIVER - BIG PINEY GAUGE (06930000)
-- ============================================
-- Scenic Ozark river, Class I-II
UPDATE river_gauges rg
SET
    level_too_low = 1.8,        -- Dragging issues
    level_low = 2.3,            -- Low but floatable
    level_optimal_min = 3.0,    -- Good conditions
    level_optimal_max = 5.5,    -- Handles moderate flow
    level_high = 7.0,           -- High water
    level_dangerous = 10.0      -- Flood danger
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'big-piney'
  AND gs.usgs_site_id = '06930000';

-- ============================================
-- HUZZAH CREEK - STEELVILLE GAUGE (07017200)
-- ============================================
-- Smaller creek, very dependent on rainfall
-- Needs recent rain to be floatable
UPDATE river_gauges rg
SET
    level_too_low = 1.5,        -- Too low, scraping constantly
    level_low = 2.0,            -- Low, some dragging
    level_optimal_min = 2.5,    -- Good floating
    level_optimal_max = 4.5,    -- Small creek fills fast
    level_high = 6.0,           -- Swift for this creek
    level_dangerous = 8.0       -- Flood conditions
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'huzzah'
  AND gs.usgs_site_id = '07017200';

-- ============================================
-- COURTOIS CREEK - BERRYMAN GAUGE (07017610)
-- ============================================
-- Small tributary, rain-dependent
-- Similar to Huzzah
UPDATE river_gauges rg
SET
    level_too_low = 1.5,        -- Too shallow
    level_low = 2.0,            -- Marginal
    level_optimal_min = 2.5,    -- Good conditions
    level_optimal_max = 4.5,    -- Upper comfortable limit
    level_high = 6.0,           -- High for this creek
    level_dangerous = 8.0       -- Dangerous
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'courtois'
  AND gs.usgs_site_id = '07017610';

-- ============================================
-- VERIFY UPDATES
-- ============================================
-- Run this to see the updated thresholds:
-- SELECT
--     r.name as river,
--     gs.name as gauge,
--     gs.usgs_site_id,
--     rg.level_too_low,
--     rg.level_low,
--     rg.level_optimal_min,
--     rg.level_optimal_max,
--     rg.level_high,
--     rg.level_dangerous,
--     rg.is_primary
-- FROM river_gauges rg
-- JOIN rivers r ON r.id = rg.river_id
-- JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
-- ORDER BY r.name, rg.is_primary DESC;
