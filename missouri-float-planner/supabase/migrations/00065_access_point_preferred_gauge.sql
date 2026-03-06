-- Migration: Add preferred_gauge_station_id to access_points
--
-- Allows manual override of automatic gauge selection for specific access points.
-- When set, the float plan and conditions APIs will use this gauge instead of
-- the nearest/upstream gauge determined by river mile.
--
-- Use case: Baptist Camp (mile 2.1) and Cedargrove (mile 9.0) are closer to
-- the Montauk gauge (mile 0.0) by river mile, but should use the Akers Ferry
-- gauge for more representative float conditions.

-- ============================================
-- ADD PREFERRED GAUGE COLUMN
-- ============================================
ALTER TABLE access_points
ADD COLUMN IF NOT EXISTS preferred_gauge_station_id UUID REFERENCES gauge_stations(id);

COMMENT ON COLUMN access_points.preferred_gauge_station_id IS 'Optional override: when set, this gauge is used for condition calculations instead of automatic mile-based selection.';

-- ============================================
-- SET PREFERRED GAUGE FOR CURRENT RIVER ACCESS POINTS
-- ============================================
-- These upper Current River access points should all use the Akers Ferry gauge
-- (USGS 07064533) rather than the automatic selection which picks Montauk for
-- access points upstream of mile 16.5.

DO $$
DECLARE
    v_river_id UUID;
    v_akers_gauge_id UUID;
BEGIN
    SELECT id INTO v_river_id FROM rivers WHERE slug = 'current';

    SELECT gs.id INTO v_akers_gauge_id
    FROM gauge_stations gs
    WHERE gs.usgs_site_id = '07064533';  -- Akers Ferry gauge

    IF v_river_id IS NULL THEN
        RAISE NOTICE 'Current River not found, skipping preferred gauge assignment';
        RETURN;
    END IF;

    IF v_akers_gauge_id IS NULL THEN
        RAISE NOTICE 'Akers gauge station not found, skipping preferred gauge assignment';
        RETURN;
    END IF;

    -- Baptist Camp Access
    UPDATE access_points
    SET preferred_gauge_station_id = v_akers_gauge_id
    WHERE river_id = v_river_id
      AND name ILIKE '%Baptist%Camp%';

    -- Cedargrove
    UPDATE access_points
    SET preferred_gauge_station_id = v_akers_gauge_id
    WHERE river_id = v_river_id
      AND (name ILIKE '%Cedar%Grove%' OR name ILIKE '%Cedargrove%');

    -- Flying W Access
    UPDATE access_points
    SET preferred_gauge_station_id = v_akers_gauge_id
    WHERE river_id = v_river_id
      AND name ILIKE '%Flying%W%';

    -- Akers Ferry
    UPDATE access_points
    SET preferred_gauge_station_id = v_akers_gauge_id
    WHERE river_id = v_river_id
      AND name ILIKE '%Akers%';

    RAISE NOTICE 'Preferred gauge (Akers Ferry) set for Baptist Camp, Cedargrove, Flying W Access, and Akers Ferry';
END $$;
