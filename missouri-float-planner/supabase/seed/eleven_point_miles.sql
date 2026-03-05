-- Eleven Point River Access Points - Mile Markers
-- Source: USFS Mark Twain National Forest, Missouri Ozark Waterways guide
-- Mile 0.0 = Thomasville (headwaters)

DO $$
DECLARE
    v_river_id UUID;
BEGIN
    SELECT id INTO v_river_id FROM rivers WHERE slug = 'eleven-point';

    IF v_river_id IS NULL THEN
        RAISE NOTICE 'Eleven Point River not found - skipping';
        RETURN;
    END IF;

    -- Vehicle access points
    UPDATE access_points SET river_mile_downstream = 0.0
    WHERE river_id = v_river_id AND (name ILIKE '%Thomasville%');

    UPDATE access_points SET river_mile_downstream = 9.3
    WHERE river_id = v_river_id AND (name ILIKE '%Cane Bluff%');

    UPDATE access_points SET river_mile_downstream = 16.6
    WHERE river_id = v_river_id AND (name ILIKE '%Greer%' OR name ILIKE '%Hwy 19%' OR name ILIKE '%Highway 19%');

    UPDATE access_points SET river_mile_downstream = 21.5
    WHERE river_id = v_river_id AND (name ILIKE '%Turner%Mill%');

    UPDATE access_points SET river_mile_downstream = 24.2
    WHERE river_id = v_river_id AND (name ILIKE '%McDowell%');

    UPDATE access_points SET river_mile_downstream = 28.0
    WHERE river_id = v_river_id AND (name ILIKE '%Whitten%');

    UPDATE access_points SET river_mile_downstream = 35.6
    WHERE river_id = v_river_id AND (name ILIKE '%Riverton%' OR name ILIKE '%Hwy 160%' OR name ILIKE '%Highway 160%');

    UPDATE access_points SET river_mile_downstream = 44.3
    WHERE river_id = v_river_id AND (name ILIKE '%Narrows%' OR name ILIKE '%Hwy 142%' OR name ILIKE '%Highway 142%');

    UPDATE access_points SET river_mile_downstream = 48.0
    WHERE river_id = v_river_id AND (name ILIKE '%Myrtle%' OR name ILIKE '%Stubblefield%');

    -- Float camps
    UPDATE access_points SET river_mile_downstream = 6.5
    WHERE river_id = v_river_id AND (name ILIKE '%Denny Hollow%');

    UPDATE access_points SET river_mile_downstream = 26.5
    WHERE river_id = v_river_id AND (name ILIKE '%Horseshoe Bend%');

    UPDATE access_points SET river_mile_downstream = 27.0
    WHERE river_id = v_river_id AND (name ILIKE '%Barn Hollow%');

    UPDATE access_points SET river_mile_downstream = 28.5
    WHERE river_id = v_river_id AND (name ILIKE '%Whites Creek%');

    UPDATE access_points SET river_mile_downstream = 31.0
    WHERE river_id = v_river_id AND (name ILIKE '%Greenbriar%');

    UPDATE access_points SET river_mile_downstream = 33.4
    WHERE river_id = v_river_id AND (name ILIKE '%Boze Mill%');

    UPDATE access_points SET river_mile_downstream = 43.3
    WHERE river_id = v_river_id AND (name ILIKE '%Morgan Spring%');

    RAISE NOTICE 'Eleven Point River mile markers updated';
END $$;

-- Verify the updates
SELECT name, type, river_mile_downstream
FROM access_points
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'eleven-point')
ORDER BY river_mile_downstream NULLS LAST;
