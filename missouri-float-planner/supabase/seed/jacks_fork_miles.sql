-- Jacks Fork River Access Points - Mile Markers
-- Source: Missouri Ozark Waterways guide
-- Mile 0.0 = South Prong (headwaters)

DO $$
DECLARE
    v_river_id UUID;
BEGIN
    SELECT id INTO v_river_id FROM rivers WHERE slug = 'jacks-fork';

    IF v_river_id IS NULL THEN
        RAISE NOTICE 'Jacks Fork River not found - skipping';
        RETURN;
    END IF;

    UPDATE access_points SET river_mile_downstream = 0.0
    WHERE river_id = v_river_id AND (name ILIKE '%South Prong%');

    UPDATE access_points SET river_mile_downstream = 6.8
    WHERE river_id = v_river_id AND (name ILIKE '%Buck Hollow%' OR name ILIKE '%Hwy 17%' OR name ILIKE '%Highway 17%');

    UPDATE access_points SET river_mile_downstream = 9.2
    WHERE river_id = v_river_id AND (name ILIKE '%Salvation Army%');

    UPDATE access_points SET river_mile_downstream = 9.6
    WHERE river_id = v_river_id AND (name ILIKE '%Blue Spring%');

    UPDATE access_points SET river_mile_downstream = 25.2
    WHERE river_id = v_river_id AND (name ILIKE '%Bay Creek%');

    UPDATE access_points SET river_mile_downstream = 31.0
    WHERE river_id = v_river_id AND (name ILIKE '%Alley%Spring%');

    UPDATE access_points SET river_mile_downstream = 37.3
    WHERE river_id = v_river_id AND (name ILIKE '%Eminence%');

    UPDATE access_points SET river_mile_downstream = 41.9
    WHERE river_id = v_river_id AND (name ILIKE '%Shawnee%Creek%');

    UPDATE access_points SET river_mile_downstream = 44.6
    WHERE river_id = v_river_id AND (name ILIKE '%confluence%' OR name ILIKE '%Current River%junction%');

    RAISE NOTICE 'Jacks Fork River mile markers updated';
END $$;

-- Verify the updates
SELECT name, river_mile_downstream
FROM access_points
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'jacks-fork')
ORDER BY river_mile_downstream NULLS LAST;
