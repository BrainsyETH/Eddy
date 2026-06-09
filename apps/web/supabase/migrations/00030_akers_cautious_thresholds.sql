-- supabase/migrations/00030_current_river_cautious_thresholds.sql
-- Calibrate Current River gauge thresholds based on local knowledge
--
-- Sources:
-- - Local outfitter experience
-- - NPS river closure levels
-- - missouriscenicrivers.com

-- ============================================
-- CURRENT RIVER - AKERS GAUGE (07064533)
-- ============================================
-- Upper Current River - narrower, shallower than lower sections
-- Average: ~1.5 ft
-- Optimal: 2.0-3.0 ft (local knowledge)
-- River closes at 4.0 ft (NPS flood level)
-- Below 1.5 ft: drag in riffles
UPDATE river_gauges rg
SET
    level_too_low = 1.0,        -- Significant dragging, not recommended
    level_low = 1.5,            -- Drag in riffles, average level
    level_optimal_min = 2.0,    -- Good floating begins
    level_optimal_max = 3.0,    -- Upper optimal (1 ft buffer before close)
    level_high = 3.5,           -- Conditions deteriorate, swift current
    level_dangerous = 4.0       -- NPS closes river at this level
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07064533';

-- ============================================
-- CURRENT RIVER - VAN BUREN GAUGE (07067000)
-- ============================================
-- Lower Current River - wider, deeper section
-- Optimal: 3.0-4.0 ft (local knowledge)
-- River closes at 5.0 ft
UPDATE river_gauges rg
SET
    level_too_low = 2.0,        -- Very shallow, significant dragging
    level_low = 2.5,            -- Low but floatable, some dragging
    level_optimal_min = 3.0,    -- Good conditions begin
    level_optimal_max = 4.0,    -- Upper optimal range
    level_high = 4.5,           -- Swift current, experienced paddlers
    level_dangerous = 5.0       -- River closes at this level
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07067000';
