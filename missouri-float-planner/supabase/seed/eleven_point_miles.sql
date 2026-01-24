-- Eleven Point River Access Points - Mile Markers
-- Source: Missouri Ozark Waterways guide
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

    UPDATE access_points SET river_mile_downstream = 0.0
    WHERE river_id = v_river_id AND (name ILIKE '%Thomasville%');

    UPDATE access_points SET river_mile_downstream = 9.3
    WHERE river_id = v_river_id AND (name ILIKE '%Cane Bluff%');

    UPDATE access_points SET river_mile_downstream = 16.6
    WHERE river_id = v_river_id AND (name ILIKE '%Greer%' OR name ILIKE '%Hwy 19%' OR name ILIKE '%Highway 19%');

    UPDATE access_points SET river_mile_downstream = 21.5
    WHERE river_id = v_river_id AND (name ILIKE '%Turner%Mill%' OR name ILIKE '%Surprise%');

    UPDATE access_points SET river_mile_downstream = 35.7
    WHERE river_id = v_river_id AND (name ILIKE '%Riverton%' OR name ILIKE '%Hwy 160%' OR name ILIKE '%Highway 160%');

    UPDATE access_points SET river_mile_downstream = 44.3
    WHERE river_id = v_river_id AND (name ILIKE '%Hwy 142%' OR name ILIKE '%Highway 142%');

    UPDATE access_points SET river_mile_downstream = 48.0
    WHERE river_id = v_river_id AND (name ILIKE '%Myrtle%' OR name ILIKE '%Stubblefield%');

    RAISE NOTICE 'Eleven Point River mile markers updated';
END $$;

-- Verify the updates
SELECT name, river_mile_downstream
FROM access_points
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'eleven-point')
ORDER BY river_mile_downstream NULLS LAST;
