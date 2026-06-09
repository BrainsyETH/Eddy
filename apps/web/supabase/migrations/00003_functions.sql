-- File: supabase/migrations/00003_functions.sql
-- Missouri Float Planner Database Functions

-- ============================================
-- SNAP POINT TO RIVER
-- ============================================
CREATE OR REPLACE FUNCTION snap_to_river(
    p_point GEOMETRY(Point, 4326),
    p_river_id UUID
) RETURNS TABLE (
    snapped_point GEOMETRY(Point, 4326),
    river_mile NUMERIC(6,2),
    distance_from_original_meters NUMERIC(8,2)
) AS $$
DECLARE
    v_river_geom GEOMETRY;
    v_river_length_miles NUMERIC;
    v_fraction NUMERIC;
BEGIN
    SELECT geom, length_miles
    INTO v_river_geom, v_river_length_miles
    FROM rivers WHERE id = p_river_id;

    IF v_river_geom IS NULL THEN
        RAISE EXCEPTION 'River not found: %', p_river_id;
    END IF;

    v_fraction := ST_LineLocatePoint(v_river_geom, p_point);

    RETURN QUERY SELECT
        ST_LineInterpolatePoint(v_river_geom, v_fraction)::GEOMETRY(Point, 4326),
        (v_fraction * v_river_length_miles)::NUMERIC(6,2),
        ST_Distance(
            p_point::geography,
            ST_LineInterpolatePoint(v_river_geom, v_fraction)::geography
        )::NUMERIC(8,2);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- GET FLOAT SEGMENT GEOMETRY
-- ============================================
CREATE OR REPLACE FUNCTION get_float_segment(
    p_start_access_id UUID,
    p_end_access_id UUID
) RETURNS TABLE (
    segment_geom GEOMETRY(LineString, 4326),
    distance_miles NUMERIC(5,2),
    start_name TEXT,
    end_name TEXT,
    start_river_mile NUMERIC(6,2),
    end_river_mile NUMERIC(6,2)
) AS $$
DECLARE
    v_river_id UUID;
    v_river_geom GEOMETRY;
    v_start_mile NUMERIC;
    v_end_mile NUMERIC;
    v_start_name TEXT;
    v_end_name TEXT;
    v_river_length NUMERIC;
    v_start_fraction NUMERIC;
    v_end_fraction NUMERIC;
    v_end_river_id UUID;
BEGIN
    -- Get start access point details
    SELECT ap.river_id, ap.river_mile_downstream, ap.name, r.geom, r.length_miles
    INTO v_river_id, v_start_mile, v_start_name, v_river_geom, v_river_length
    FROM access_points ap
    JOIN rivers r ON r.id = ap.river_id
    WHERE ap.id = p_start_access_id;

    IF v_river_id IS NULL THEN
        RAISE EXCEPTION 'Start access point not found: %', p_start_access_id;
    END IF;

    -- Get end access point details
    SELECT river_id, river_mile_downstream, name
    INTO v_end_river_id, v_end_mile, v_end_name
    FROM access_points WHERE id = p_end_access_id;

    IF v_end_river_id IS NULL THEN
        RAISE EXCEPTION 'End access point not found: %', p_end_access_id;
    END IF;

    IF v_river_id != v_end_river_id THEN
        RAISE EXCEPTION 'Access points must be on the same river';
    END IF;

    -- Convert miles to fractions
    v_start_fraction := v_start_mile / v_river_length;
    v_end_fraction := v_end_mile / v_river_length;

    -- Return segment (always order fractions correctly for ST_LineSubstring)
    IF v_start_fraction > v_end_fraction THEN
        -- Put-in is upstream (higher river mile)
        RETURN QUERY SELECT
            ST_LineSubstring(v_river_geom, v_end_fraction, v_start_fraction)::GEOMETRY(LineString, 4326),
            ABS(v_start_mile - v_end_mile)::NUMERIC(5,2),
            v_start_name,
            v_end_name,
            v_start_mile,
            v_end_mile;
    ELSE
        -- Put-in is downstream (lower river mile) - unusual but handle it
        RETURN QUERY SELECT
            ST_LineSubstring(v_river_geom, v_start_fraction, v_end_fraction)::GEOMETRY(LineString, 4326),
            ABS(v_end_mile - v_start_mile)::NUMERIC(5,2),
            v_start_name,
            v_end_name,
            v_start_mile,
            v_end_mile;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- GET RIVER CONDITION
-- ============================================
CREATE OR REPLACE FUNCTION get_river_condition(p_river_id UUID)
RETURNS TABLE (
    condition_label TEXT,
    condition_code TEXT,
    gauge_height_ft NUMERIC,
    discharge_cfs NUMERIC,
    reading_timestamp TIMESTAMPTZ,
    reading_age_hours NUMERIC,
    accuracy_warning BOOLEAN,
    accuracy_warning_reason TEXT,
    gauge_name TEXT,
    gauge_usgs_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH primary_gauge AS (
        SELECT
            rg.gauge_station_id,
            rg.distance_from_section_miles,
            rg.accuracy_warning_threshold_miles,
            rg.threshold_unit,
            rg.level_too_low,
            rg.level_low,
            rg.level_optimal_min,
            rg.level_optimal_max,
            rg.level_high,
            rg.level_dangerous,
            gs.name as gauge_name,
            gs.usgs_site_id
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE rg.river_id = p_river_id
          AND rg.is_primary = TRUE
          AND gs.active = TRUE
        LIMIT 1
    ),
    latest_reading AS (
        SELECT
            gr.gauge_height_ft,
            gr.discharge_cfs,
            gr.reading_timestamp,
            EXTRACT(EPOCH FROM (NOW() - gr.reading_timestamp)) / 3600 as age_hours
        FROM gauge_readings gr
        JOIN primary_gauge pg ON pg.gauge_station_id = gr.gauge_station_id
        ORDER BY gr.reading_timestamp DESC
        LIMIT 1
    )
    SELECT
        CASE
            WHEN lr.gauge_height_ft IS NULL THEN 'Unknown'
            WHEN lr.gauge_height_ft >= pg.level_dangerous THEN 'Dangerous - Do Not Float'
            WHEN lr.gauge_height_ft >= pg.level_high THEN 'High Water - Experienced Only'
            WHEN lr.gauge_height_ft >= pg.level_optimal_min
                 AND lr.gauge_height_ft <= pg.level_optimal_max THEN 'Optimal Conditions'
            WHEN lr.gauge_height_ft >= pg.level_low THEN 'Low - Floatable'
            WHEN lr.gauge_height_ft >= pg.level_too_low THEN 'Very Low - Scraping Likely'
            ELSE 'Too Low - Not Recommended'
        END,
        CASE
            WHEN lr.gauge_height_ft IS NULL THEN 'unknown'
            WHEN lr.gauge_height_ft >= pg.level_dangerous THEN 'dangerous'
            WHEN lr.gauge_height_ft >= pg.level_high THEN 'high'
            WHEN lr.gauge_height_ft >= pg.level_optimal_min
                 AND lr.gauge_height_ft <= pg.level_optimal_max THEN 'optimal'
            WHEN lr.gauge_height_ft >= pg.level_low THEN 'low'
            WHEN lr.gauge_height_ft >= pg.level_too_low THEN 'very_low'
            ELSE 'too_low'
        END,
        lr.gauge_height_ft,
        lr.discharge_cfs,
        lr.reading_timestamp,
        lr.age_hours::NUMERIC(5,1),
        (pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
         OR lr.age_hours > 6),
        CASE
            WHEN pg.distance_from_section_miles > pg.accuracy_warning_threshold_miles
                THEN 'Gauge is ' || pg.distance_from_section_miles::TEXT || ' miles from float section'
            WHEN lr.age_hours > 6
                THEN 'Reading is ' || ROUND(lr.age_hours)::TEXT || ' hours old'
            ELSE NULL
        END,
        pg.gauge_name,
        pg.usgs_site_id
    FROM primary_gauge pg
    LEFT JOIN latest_reading lr ON TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CALCULATE FLOAT TIME
-- ============================================
CREATE OR REPLACE FUNCTION calculate_float_time(
    p_distance_miles NUMERIC,
    p_vessel_type_id UUID,
    p_condition_code TEXT
) RETURNS TABLE (
    float_minutes INT,
    speed_mph NUMERIC,
    vessel_name TEXT
) AS $$
DECLARE
    v_speed NUMERIC;
    v_vessel_name TEXT;
BEGIN
    SELECT
        name,
        CASE p_condition_code
            WHEN 'dangerous' THEN NULL  -- Don't calculate for dangerous
            WHEN 'high' THEN speed_high_water
            WHEN 'optimal' THEN speed_normal
            WHEN 'low' THEN speed_low_water
            WHEN 'very_low' THEN speed_low_water * 0.75
            WHEN 'too_low' THEN speed_low_water * 0.5
            ELSE speed_normal  -- Default to normal
        END
    INTO v_vessel_name, v_speed
    FROM vessel_types
    WHERE id = p_vessel_type_id;

    IF v_speed IS NULL OR v_speed = 0 THEN
        RETURN QUERY SELECT NULL::INT, NULL::NUMERIC, v_vessel_name;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        ROUND((p_distance_miles / v_speed) * 60)::INT,
        v_speed,
        v_vessel_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- GENERATE SHORT CODE
-- ============================================
CREATE OR REPLACE FUNCTION generate_short_code(length INT DEFAULT 8)
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';  -- No confusing chars
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================
-- TRIGGER: Update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rivers_updated_at
    BEFORE UPDATE ON rivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER access_points_updated_at
    BEFORE UPDATE ON access_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER river_hazards_updated_at
    BEFORE UPDATE ON river_hazards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER river_gauges_updated_at
    BEFORE UPDATE ON river_gauges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TRIGGER: Auto-snap access points
-- ============================================
CREATE OR REPLACE FUNCTION auto_snap_access_point()
RETURNS TRIGGER AS $$
DECLARE
    snap_result RECORD;
BEGIN
    -- Snap to river
    SELECT * INTO snap_result
    FROM snap_to_river(NEW.location_orig, NEW.river_id);

    NEW.location_snap := snap_result.snapped_point;
    NEW.river_mile_downstream := snap_result.river_mile;

    -- Calculate upstream mile (requires river length)
    SELECT length_miles - snap_result.river_mile
    INTO NEW.river_mile_upstream
    FROM rivers WHERE id = NEW.river_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_points_auto_snap
    BEFORE INSERT OR UPDATE OF location_orig, river_id ON access_points
    FOR EACH ROW EXECUTE FUNCTION auto_snap_access_point();

-- ============================================
-- GET RIVER GEOMETRY AS GEOJSON
-- ============================================
CREATE OR REPLACE FUNCTION get_river_geometry_json(p_slug TEXT)
RETURNS JSONB AS $$
DECLARE
    v_geom GEOMETRY;
BEGIN
    SELECT geom INTO v_geom
    FROM rivers
    WHERE slug = p_slug;

    IF v_geom IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ST_AsGeoJSON(v_geom)::jsonb;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CALCULATE LINE LENGTH FROM GEOJSON
-- ============================================
CREATE OR REPLACE FUNCTION calculate_line_length(p_geojson JSONB)
RETURNS NUMERIC(6,2) AS $$
DECLARE
    v_geom GEOMETRY;
    v_length_meters NUMERIC;
    v_coords JSONB;
BEGIN
    -- Extract coordinates from GeoJSON
    v_coords := p_geojson->'coordinates';
    
    IF v_coords IS NULL THEN
        RETURN 0;
    END IF;

    -- Convert GeoJSON LineString to PostGIS geometry
    v_geom := ST_SetSRID(
        ST_GeomFromGeoJSON(p_geojson::text),
        4326
    );

    -- Calculate length in meters using geography (more accurate for lat/lng)
    v_length_meters := ST_Length(v_geom::geography);
    
    -- Convert to miles
    RETURN (v_length_meters / 1609.34)::NUMERIC(6,2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
