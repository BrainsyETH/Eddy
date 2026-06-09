-- supabase/migrations/00010_add_akers_gauge.sql
-- Add USGS gauge station for Current River at Akers for upper section segment-aware conditions
--
-- This gauge (07064533) covers the upper Current River section including:
-- - Cedar Grove
-- - Pulltite
-- - Round Spring
-- - Akers Ferry
--
-- Source: https://waterdata.usgs.gov/monitoring-location/USGS-07064533/
-- Coordinates: 37°22'32.5"N, 91°33'10.1"W
-- Drainage area: 295 square miles

-- ============================================
-- ADD AKERS GAUGE STATION
-- ============================================
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07064533',
    'Current River above Akers, MO',
    ST_SetSRID(ST_MakePoint(-91.5528, 37.3757), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    active = EXCLUDED.active;

-- ============================================
-- LINK AKERS GAUGE TO CURRENT RIVER
-- ============================================
-- Upper Current River thresholds - smaller drainage area (295 sq mi)
-- compared to Van Buren section, so lower thresholds
-- Based on USGS statistics and local float reports
INSERT INTO river_gauges (
    river_id,
    gauge_station_id,
    is_primary,
    distance_from_section_miles,
    accuracy_warning_threshold_miles,
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
    false,  -- Not primary (Van Buren is primary for the full river)
    0.5,    -- Close to Akers access point
    10.0,   -- Accuracy threshold
    'ft',
    1.5,    -- Too low - significant dragging, not recommended
    2.0,    -- Low - floatable but some dragging
    2.5,    -- Optimal min - good conditions begin
    4.0,    -- Optimal max - above this gets swift
    5.0,    -- High - experienced paddlers only
    7.0     -- Dangerous - do not float
FROM rivers r, gauge_stations gs
WHERE r.slug = 'current' AND gs.usgs_site_id = '07064533'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    distance_from_section_miles = EXCLUDED.distance_from_section_miles,
    accuracy_warning_threshold_miles = EXCLUDED.accuracy_warning_threshold_miles,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify the gauge was added correctly:
-- SELECT
--     r.name as river,
--     gs.name as gauge,
--     gs.usgs_site_id,
--     ST_AsText(gs.location) as location,
--     rg.is_primary,
--     rg.level_optimal_min || '-' || rg.level_optimal_max as optimal_range
-- FROM river_gauges rg
-- JOIN rivers r ON r.id = rg.river_id
-- JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
-- WHERE r.slug = 'current'
-- ORDER BY rg.is_primary DESC;
