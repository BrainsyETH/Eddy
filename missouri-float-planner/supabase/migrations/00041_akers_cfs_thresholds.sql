-- supabase/migrations/00041_akers_cfs_thresholds.sql
-- Switch Akers gauge (07064533) from gauge height (ft) to discharge (cfs) thresholds
--
-- Rationale:
-- - At Akers, the floatable range of gauge heights is narrow (~0.7-1.3 ft),
--   making it hard to distinguish marginal vs good conditions by stage alone.
-- - CFS more directly represents water volume, which correlates better with
--   navigability in the wide, shallow riffle reaches near Akers.
-- - Local paddlers and float guides typically reference ~300 cfs as "comfortably
--   floatable" rather than stage values.
-- - CFS thresholds are more intuitive and stable for public reporting at Akers.
--
-- Threshold calibration (conservative/moderate approach):
--   150 cfs  = Too Low (below minimal scrape conditions)
--   200 cfs  = Low (marginal, scraping likely)
--   300 cfs  = Optimal min (comfortably floatable per local guides)
--   400 cfs  = Optimal max (good flow, no hazards)
--   550 cfs  = High (swift current, experienced only)
--   1000 cfs = Dangerous (NPS closure territory)
--
-- Fallback: If CFS is unavailable, system falls back to gauge height (ft)
-- automatically via the existing comparison_value logic in get_river_condition().

UPDATE river_gauges rg
SET
    threshold_unit = 'cfs',
    level_too_low = 150,        -- Below minimal scrape conditions
    level_low = 200,            -- Marginal, scraping likely in riffles
    level_optimal_min = 300,    -- Comfortably floatable per local float guides
    level_optimal_max = 400,    -- Good flow, easy downstream travel
    level_high = 550,           -- Swift current, experienced paddlers only
    level_dangerous = 1000      -- NPS closure territory
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07064533';

-- Verify the update
SELECT
    gs.name as gauge_name,
    gs.usgs_site_id,
    r.name as river_name,
    rg.threshold_unit,
    rg.level_too_low,
    rg.level_low,
    rg.level_optimal_min,
    rg.level_optimal_max,
    rg.level_high,
    rg.level_dangerous
FROM river_gauges rg
JOIN gauge_stations gs ON rg.gauge_station_id = gs.id
JOIN rivers r ON rg.river_id = r.id
WHERE gs.usgs_site_id = '07064533';
