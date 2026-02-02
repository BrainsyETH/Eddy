-- supabase/migrations/00030_akers_cautious_thresholds.sql
-- Lower Akers gauge thresholds for more safety margin
--
-- The river closes at 4.0 ft, so having optimal_max at 3.5 ft
-- (only 0.5 ft below close level) is too aggressive.
-- These thresholds provide a safer buffer.

-- ============================================
-- CURRENT RIVER - AKERS GAUGE (07064533)
-- ============================================
-- Upper Current River - narrower, shallower than lower sections
-- Average: ~1.5 ft
-- River closes at 4.0 ft (NPS flood level)
--
-- Previous (migration 00020):
--   optimal_max = 3.5 ft (only 0.5 ft buffer before close!)
--   high = 4.0 ft
--   dangerous = 4.5 ft
--
-- Updated (more cautious):
--   optimal_max = 3.0 ft (1 ft buffer before close)
--   high = 3.5 ft (warning zone)
--   dangerous = 4.0 ft (actual close level)
UPDATE river_gauges rg
SET
    level_too_low = 1.0,        -- Same: significant dragging
    level_low = 1.5,            -- Same: average level, some dragging
    level_optimal_min = 2.0,    -- Same: good floating begins
    level_optimal_max = 3.0,    -- LOWERED from 3.5: 1 ft buffer before close
    level_high = 3.5,           -- LOWERED from 4.0: warning zone, swift current
    level_dangerous = 4.0       -- LOWERED from 4.5: NPS closes river at this level
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07064533';
