-- 00146_river_sections_validation_bounds.sql
-- Phase 0 scaling infrastructure (see docs/MULTI_STATE_SCALING_PLAN.md):
--   F10: river_sections moves the hardcoded RIVER_SECTIONS array
--        (src/data/river-sections.ts) into data — adding a river or section
--        no longer requires a code deploy.
--   QA:  validate_river_data() runs the data-quality checks that gate a new
--        river's launch (threshold ordering, gauge freshness, required
--        multi-region fields, mileage sanity).
--   F8:  get_active_rivers_bounds() computes map viewport bounds from river
--        geometry instead of the hardcoded MISSOURI_BOUNDS constant.

-- ─────────────────────────────────────────────────────────────────────────────
-- river_sections
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS river_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id UUID NOT NULL REFERENCES rivers(id) ON DELETE CASCADE,
    section_slug TEXT NOT NULL,
    name TEXT NOT NULL,
    -- Context injected into Eddy's update-generation prompt for this section
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (river_id, section_slug)
);

ALTER TABLE river_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "River sections are viewable by everyone"
    ON river_sections FOR SELECT
    USING (true);

-- Seed from the previously hardcoded RIVER_SECTIONS array. Rivers without
-- meaningfully different upper/lower conditions have no rows (whole-river
-- updates come from the rivers table itself).
INSERT INTO river_sections (river_id, section_slug, name, description, sort_order)
SELECT r.id, v.section_slug, v.name, v.description, v.sort_order
FROM (VALUES
    ('current', 'upper-current', 'Upper Current (Montauk to Akers)',
     'Headwaters section fed by Montauk Spring. Narrower, shallower, needs a touch more water. Popular for day trips from Montauk to Cedar Grove or Baptist Camp.', 1),
    ('current', 'lower-current', 'Lower Current (Akers to Two Rivers)',
     'Wider, deeper, more forgiving. Big Bluff, Pulltite, Round Spring. Better for multi-day trips and handles low water more gracefully.', 2),
    ('meramec', 'upper-meramec', 'Upper Meramec (above Meramec State Park)',
     'More scenic, narrower, some rapids. St. James to Meramec State Park. Popular for experienced paddlers seeking a challenge.', 1),
    ('meramec', 'lower-meramec', 'Lower Meramec (below Meramec State Park)',
     'Wider, calmer, better for beginners and tubers. Meramec State Park to Sullivan area. More accessible put-ins.', 2)
) AS v(river_slug, section_slug, name, description, sort_order)
JOIN rivers r ON r.slug = v.river_slug
ON CONFLICT (river_id, section_slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- validate_river_data(): automated data-quality checks
-- Returns one row per finding; an empty result means all checks pass.
-- Severities: 'error' blocks launch, 'warning' needs review.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_river_data()
RETURNS TABLE (
    river_slug TEXT,
    check_name TEXT,
    severity TEXT,
    detail TEXT
)
LANGUAGE sql
STABLE
AS $$
-- Required multi-region fields on active rivers
SELECT r.slug, 'missing_timezone', 'error', 'rivers.timezone is null or empty'
FROM rivers r
WHERE r.active = true AND (r.timezone IS NULL OR r.timezone = '')

UNION ALL
SELECT r.slug, 'missing_state', 'error', 'rivers.state is null or empty'
FROM rivers r
WHERE r.active = true AND (r.state IS NULL OR r.state = '')

UNION ALL
SELECT r.slug, 'missing_river_type', 'error', 'rivers.river_type is null'
FROM rivers r
WHERE r.active = true AND r.river_type IS NULL

UNION ALL
SELECT r.slug, 'missing_geometry', 'error', 'rivers.geom is null'
FROM rivers r
WHERE r.active = true AND r.geom IS NULL

UNION ALL
SELECT r.slug, 'missing_characteristics', 'warning',
       'no river_characteristics row (Eddy prompts fall back to type defaults)'
FROM rivers r
LEFT JOIN river_characteristics rc ON rc.river_id = r.id
WHERE r.active = true AND rc.river_id IS NULL

UNION ALL
SELECT r.slug, 'missing_weather_point', 'warning',
       'no weather_lat/weather_lon (weather context unavailable for Eddy updates)'
FROM rivers r
WHERE r.active = true AND (r.weather_lat IS NULL OR r.weather_lon IS NULL)

UNION ALL
SELECT r.slug, 'missing_alert_terms', 'warning',
       'no alert_search_terms (NWS alerts cannot be matched to this river)'
FROM rivers r
WHERE r.active = true AND (r.alert_search_terms IS NULL OR array_length(r.alert_search_terms, 1) IS NULL)

-- Gauge coverage: every active river needs at least one active gauge link
UNION ALL
SELECT r.slug, 'ungauged_river', 'error',
       'no active river_gauges link — river cannot show a condition badge'
FROM rivers r
WHERE r.active = true
  AND NOT EXISTS (
      SELECT 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
      WHERE rg.river_id = r.id AND gs.active = true
  )

UNION ALL
SELECT r.slug, 'no_primary_gauge', 'error',
       'river has gauges but none marked is_primary'
FROM rivers r
WHERE r.active = true
  AND EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = r.id AND rg.is_primary = true)

-- Threshold ordering: the six levels must be strictly increasing where set
UNION ALL
SELECT r.slug, 'threshold_order', 'error',
       'thresholds not strictly increasing on gauge ' || gs.name ||
       ' (' || COALESCE(rg.threshold_unit, 'ft') || ')'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true
  AND (
      (rg.level_too_low IS NOT NULL AND rg.level_low IS NOT NULL AND rg.level_too_low >= rg.level_low)
   OR (rg.level_low IS NOT NULL AND rg.level_optimal_min IS NOT NULL AND rg.level_low >= rg.level_optimal_min)
   OR (rg.level_optimal_min IS NOT NULL AND rg.level_optimal_max IS NOT NULL AND rg.level_optimal_min >= rg.level_optimal_max)
   OR (rg.level_optimal_max IS NOT NULL AND rg.level_dangerous IS NOT NULL AND rg.level_optimal_max >= rg.level_dangerous)
   OR (rg.level_high IS NOT NULL AND rg.level_dangerous IS NOT NULL AND rg.level_high >= rg.level_dangerous)
  )

UNION ALL
SELECT r.slug, 'missing_thresholds', 'error',
       'gauge ' || gs.name || ' has no thresholds set'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
WHERE r.active = true
  AND rg.is_primary = true
  AND rg.level_too_low IS NULL AND rg.level_low IS NULL
  AND rg.level_optimal_min IS NULL AND rg.level_optimal_max IS NULL

-- Gauge liveness: primary gauges should have a reading within 24h
UNION ALL
SELECT r.slug, 'stale_gauge', 'warning',
       'gauge ' || gs.name || ' latest reading older than 24h (' ||
       COALESCE(to_char(latest.max_ts, 'YYYY-MM-DD HH24:MI'), 'never') || ')'
FROM river_gauges rg
JOIN rivers r ON r.id = rg.river_id
JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
LEFT JOIN LATERAL (
    SELECT MAX(gr.reading_timestamp) AS max_ts
    FROM gauge_readings gr
    WHERE gr.gauge_station_id = gs.id
) latest ON true
WHERE r.active = true AND gs.active = true AND rg.is_primary = true
  AND (latest.max_ts IS NULL OR latest.max_ts < now() - interval '24 hours')

-- Provider integrity: every active station needs a resolvable provider site id
UNION ALL
SELECT COALESCE(r.slug, gs.name), 'gauge_missing_site_id', 'error',
       'gauge_stations row has neither site_id_external nor usgs_site_id'
FROM gauge_stations gs
LEFT JOIN river_gauges rg ON rg.gauge_station_id = gs.id
LEFT JOIN rivers r ON r.id = rg.river_id
WHERE gs.active = true AND gs.site_id_external IS NULL AND gs.usgs_site_id IS NULL

-- Access point sanity: approved points should sit near their river's line
UNION ALL
SELECT r.slug, 'access_point_offline', 'warning',
       'access point "' || ap.name || '" is ' ||
       round(ST_Distance(ap.location_snap::geography, r.geom::geography)::numeric) ||
       'm from the river line'
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true
  AND ap.location_snap IS NOT NULL AND r.geom IS NOT NULL
  AND ST_Distance(ap.location_snap::geography, r.geom::geography) > 500

-- Mileage sanity: access-point river miles must not exceed river length + slack
UNION ALL
SELECT r.slug, 'mileage_out_of_range', 'warning',
       'access point "' || ap.name || '" river_mile ' || ap.river_mile_downstream ||
       ' exceeds river length ' || r.length_miles
FROM access_points ap
JOIN rivers r ON r.id = ap.river_id
WHERE ap.approved = true AND r.active = true
  AND ap.river_mile_downstream IS NOT NULL AND r.length_miles IS NOT NULL
  AND ap.river_mile_downstream > r.length_miles + 2
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_active_rivers_bounds(): map viewport from data, not constants
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_active_rivers_bounds(p_state TEXT DEFAULT NULL)
RETURNS TABLE (
    min_lng DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    max_lat DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
SELECT
    ST_XMin(extent.box), ST_YMin(extent.box),
    ST_XMax(extent.box), ST_YMax(extent.box)
FROM (
    SELECT ST_Extent(geom) AS box
    FROM rivers
    WHERE active = true
      AND geom IS NOT NULL
      AND (p_state IS NULL OR state = p_state)
) extent
WHERE extent.box IS NOT NULL;
$$;
