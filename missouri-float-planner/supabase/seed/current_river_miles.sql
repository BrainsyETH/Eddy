-- Current River Access Points - Mile Markers
-- Source: Missouri Ozark Waterways guide
-- Mile 0.0 = Montauk (headwaters)

-- First, get the river ID
DO $$
DECLARE
    v_river_id UUID;
BEGIN
    SELECT id INTO v_river_id FROM rivers WHERE slug = 'current';

    IF v_river_id IS NULL THEN
        RAISE EXCEPTION 'Current River not found';
    END IF;

    -- Update mile markers for each access point
    -- Using ILIKE for case-insensitive matching

    UPDATE access_points SET river_mile_downstream = 0.0
    WHERE river_id = v_river_id AND (name ILIKE '%Montauk%');

    UPDATE access_points SET river_mile_downstream = 0.9
    WHERE river_id = v_river_id AND (name ILIKE '%Tan Vat%');

    UPDATE access_points SET river_mile_downstream = 2.1
    WHERE river_id = v_river_id AND (name ILIKE '%Baptist%Camp%');

    UPDATE access_points SET river_mile_downstream = 9.0
    WHERE river_id = v_river_id AND (name ILIKE '%Cedar Grove%');

    UPDATE access_points SET river_mile_downstream = 14.2
    WHERE river_id = v_river_id AND (name ILIKE '%Welch%Spring%');

    UPDATE access_points SET river_mile_downstream = 16.7
    WHERE river_id = v_river_id AND (name ILIKE '%Akers%');

    UPDATE access_points SET river_mile_downstream = 26.3
    WHERE river_id = v_river_id AND (name ILIKE '%Pulltite%');

    UPDATE access_points SET river_mile_downstream = 33.8
    WHERE river_id = v_river_id AND (name ILIKE '%Echo Bluff%' OR name ILIKE '%Sinking Creek%');

    UPDATE access_points SET river_mile_downstream = 35.2
    WHERE river_id = v_river_id AND (name ILIKE '%Round Spring%');

    UPDATE access_points SET river_mile_downstream = 52.5
    WHERE river_id = v_river_id AND (name ILIKE '%Two Rivers%' OR name ILIKE '%Jacks Fork%confluence%');

    UPDATE access_points SET river_mile_downstream = 59.8
    WHERE river_id = v_river_id AND (name ILIKE '%Hwy%106%' OR name ILIKE '%Highway 106%');

    UPDATE access_points SET river_mile_downstream = 70.0
    WHERE river_id = v_river_id AND (name ILIKE '%Log Yard%');

    UPDATE access_points SET river_mile_downstream = 71.8
    WHERE river_id = v_river_id AND (name ILIKE '%Beal%Landing%');

    UPDATE access_points SET river_mile_downstream = 85.3
    WHERE river_id = v_river_id AND (name ILIKE '%Watercress%');

    UPDATE access_points SET river_mile_downstream = 85.9
    WHERE river_id = v_river_id AND (name ILIKE '%Van Buren%');

    UPDATE access_points SET river_mile_downstream = 90.2
    WHERE river_id = v_river_id AND (name ILIKE '%Big Spring%');

    UPDATE access_points SET river_mile_downstream = 94.5
    WHERE river_id = v_river_id AND (name ILIKE '%Clubhouse%');

    UPDATE access_points SET river_mile_downstream = 98.8
    WHERE river_id = v_river_id AND (name ILIKE '%Hickory%Landing%');

    UPDATE access_points SET river_mile_downstream = 99.0
    WHERE river_id = v_river_id AND (name ILIKE '%Catarac%');

    UPDATE access_points SET river_mile_downstream = 105.2
    WHERE river_id = v_river_id AND (name ILIKE '%Gooseneck%');

    UPDATE access_points SET river_mile_downstream = 114.0
    WHERE river_id = v_river_id AND (name ILIKE '%Compton%');

    UPDATE access_points SET river_mile_downstream = 119.8
    WHERE river_id = v_river_id AND (name ILIKE '%Deer Leap%');

    UPDATE access_points SET river_mile_downstream = 124.8
    WHERE river_id = v_river_id AND (name ILIKE '%Doniphan%');

    RAISE NOTICE 'Current River mile markers updated';
END $$;

-- Verify the updates
SELECT name, river_mile_downstream
FROM access_points
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'current')
ORDER BY river_mile_downstream NULLS LAST;
