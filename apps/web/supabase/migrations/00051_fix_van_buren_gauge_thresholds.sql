-- Fix Current River at Van Buren (07067000) gauge thresholds
--
-- Symptom: River Levels gauge detail showed "N/A" for condition thresholds when
-- river_gauges level_* columns were null or out of sync.
--
-- Local knowledge (NPS, outfitters): Lower Current at Van Buren — optimal 3.0–4.0 ft,
-- river closes at 5.0 ft. Ensures all threshold columns are set and match app copy.

UPDATE river_gauges rg
SET
    threshold_unit       = 'ft',
    level_too_low        = 2.0,
    level_low            = 2.5,
    level_optimal_min    = 3.0,
    level_optimal_max    = 4.0,
    level_high           = 4.5,
    level_dangerous      = 5.0,
    is_primary           = true,
    distance_from_section_miles = COALESCE(rg.distance_from_section_miles, 0.0)
FROM rivers r, gauge_stations gs
WHERE rg.river_id = r.id
  AND rg.gauge_station_id = gs.id
  AND r.slug = 'current'
  AND gs.usgs_site_id = '07067000';

-- Ensure row exists if it was missing (e.g. from a partial seed)
INSERT INTO river_gauges (
    river_id,
    gauge_station_id,
    is_primary,
    distance_from_section_miles,
    threshold_unit,
    level_too_low,
    level_low,
    level_optimal_min,
    level_optimal_max,
    level_high,
    level_dangerous
)
SELECT
    r.id,
    gs.id,
    true,
    0.0,
    'ft',
    2.0,
    2.5,
    3.0,
    4.0,
    4.5,
    5.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'current' AND gs.usgs_site_id = '07067000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    threshold_unit       = EXCLUDED.threshold_unit,
    level_too_low        = EXCLUDED.level_too_low,
    level_low            = EXCLUDED.level_low,
    level_optimal_min    = EXCLUDED.level_optimal_min,
    level_optimal_max    = EXCLUDED.level_optimal_max,
    level_high           = EXCLUDED.level_high,
    level_dangerous      = EXCLUDED.level_dangerous,
    is_primary           = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles;
