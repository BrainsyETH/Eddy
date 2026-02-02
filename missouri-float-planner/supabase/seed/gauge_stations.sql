-- supabase/seed/gauge_stations.sql
-- Seed data for USGS gauge stations linked to Missouri float rivers
--
-- Data researched from: https://waterdata.usgs.gov/mo/nwis/rt
-- Parameter codes: 00065 (gauge height ft), 00060 (discharge cfs)

-- ============================================
-- GAUGE STATIONS
-- ============================================

-- Meramec River Gauges
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07019000',
    'Meramec River near Eureka, MO',
    ST_SetSRID(ST_MakePoint(-90.5697, 38.4975), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07018500',
    'Meramec River near Sullivan, MO',
    ST_SetSRID(ST_MakePoint(-91.1508, 38.2172), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Current River Gauges

-- Current River at Akers (Upper section)
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07064533',
    'Current River above Akers, MO',
    ST_SetSRID(ST_MakePoint(-91.5528, 37.3757), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07067000',
    'Current River at Van Buren, MO',
    ST_SetSRID(ST_MakePoint(-91.0150, 36.9936), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07068000',
    'Current River at Doniphan, MO',
    ST_SetSRID(ST_MakePoint(-90.8239, 36.6206), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Eleven Point River Gauge
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07071500',
    'Eleven Point River near Bardley, MO',
    ST_SetSRID(ST_MakePoint(-91.2153, 36.5875), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Jacks Fork River Gauge
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07065200',
    'Jacks Fork at Alley Spring, MO',
    ST_SetSRID(ST_MakePoint(-91.4461, 37.1444), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Niangua River Gauge
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06923500',
    'Niangua River near Hartville, MO',
    ST_SetSRID(ST_MakePoint(-92.5017, 37.3178), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Big Piney River Gauge
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '06930000',
    'Big Piney River near Big Piney, MO',
    ST_SetSRID(ST_MakePoint(-92.0347, 37.6789), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Huzzah Creek Gauge
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07017200',
    'Huzzah Creek near Steelville, MO',
    ST_SetSRID(ST_MakePoint(-91.3219, 37.9519), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;

-- Courtois Creek Gauge
INSERT INTO gauge_stations (usgs_site_id, name, location, active)
VALUES (
    '07017610',
    'Courtois Creek at Berryman, MO',
    ST_SetSRID(ST_MakePoint(-91.0986, 37.9047), 4326),
    true
) ON CONFLICT (usgs_site_id) DO UPDATE SET
    name = EXCLUDED.name,
    active = EXCLUDED.active;


-- ============================================
-- RIVER <-> GAUGE RELATIONSHIPS
-- ============================================
-- Link gauge stations to their rivers with thresholds
-- Thresholds are approximate and should be refined with local knowledge

-- Meramec River - Eureka Gauge (Primary)
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
    5.0,
    'ft',
    1.5,
    2.5,
    3.5,
    6.0,
    8.0,
    12.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'meramec' AND gs.usgs_site_id = '07019000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Meramec River - Sullivan Gauge (Secondary)
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
    false,
    2.0,
    'ft',
    1.2,
    2.0,
    2.8,
    5.0,
    7.0,
    10.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'meramec' AND gs.usgs_site_id = '07018500'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary;

-- Current River - Akers Gauge (Upper section)
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
    false,
    0.5,
    10.0,
    'ft',
    1.5,
    2.0,
    2.5,
    4.0,
    5.0,
    7.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'current' AND gs.usgs_site_id = '07064533'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Current River - Van Buren Gauge (Primary)
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
    2.8,
    3.5,
    6.0,
    8.0,
    12.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'current' AND gs.usgs_site_id = '07067000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Current River - Doniphan Gauge (Secondary)
-- NOTE: Gauge datum causes negative readings at normal flow!
-- Average ~1.0 ft per MSR, but frequently reads negative. NWS flood stage: 13 ft
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
    false,
    10.0,
    'ft',
    -1.0,   -- River rarely drops below; ~1,000 cfs, genuinely scrapy
    -0.25,  -- Floatable but slow, some dragging on riffles
    0.5,    -- Good flow begins, ~1,800+ cfs
    3.0,    -- Solid flow, ~3,000+ cfs, clear water likely
    3.0,    -- Fast and muddy, experienced only (cautious threshold)
    10.0    -- NWS flood stage is 13.0 ft; 10 ft safety buffer
FROM rivers r, gauge_stations gs
WHERE r.slug = 'current' AND gs.usgs_site_id = '07068000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Eleven Point River - Bardley Gauge (Primary)
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
    5.0,
    'ft',
    1.0,    -- Too low - scraping likely (MSR avg: 1.7 ft)
    1.5,    -- Low - floatable but some dragging
    2.0,    -- Optimal min - good conditions
    3.5,    -- Optimal max - ideal floating
    4.0,    -- High - suggest another day, murky/muddy
    5.0     -- Dangerous - Forest Service closes river
FROM rivers r, gauge_stations gs
WHERE r.slug = 'eleven-point' AND gs.usgs_site_id = '07071500'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Jacks Fork River - Alley Spring Gauge (Primary)
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
    1.5,
    2.2,
    3.0,
    5.0,
    7.0,
    10.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'jacks-fork' AND gs.usgs_site_id = '07065200'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Niangua River - Hartville Gauge (Primary)
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
    8.0,
    'ft',
    1.2,
    2.0,
    2.8,
    5.0,
    7.0,
    10.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'niangua' AND gs.usgs_site_id = '06923500'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Big Piney River - Big Piney Gauge (Primary)
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
    3.0,
    'ft',
    1.5,
    2.3,
    3.0,
    5.5,
    7.5,
    11.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'big-piney' AND gs.usgs_site_id = '06930000'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Huzzah Creek - Steelville Gauge (Primary)
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
    2.0,
    'ft',
    1.0,
    1.5,
    2.0,
    4.0,
    6.0,
    9.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'huzzah' AND gs.usgs_site_id = '07017200'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;

-- Courtois Creek - Berryman Gauge (Primary)
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
    1.0,
    'ft',
    1.0,
    1.5,
    2.0,
    4.0,
    6.0,
    9.0
FROM rivers r, gauge_stations gs
WHERE r.slug = 'courtois' AND gs.usgs_site_id = '07017610'
ON CONFLICT (river_id, gauge_station_id) DO UPDATE SET
    is_primary = EXCLUDED.is_primary,
    level_too_low = EXCLUDED.level_too_low,
    level_low = EXCLUDED.level_low,
    level_optimal_min = EXCLUDED.level_optimal_min,
    level_optimal_max = EXCLUDED.level_optimal_max,
    level_high = EXCLUDED.level_high,
    level_dangerous = EXCLUDED.level_dangerous;
