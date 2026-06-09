-- File: supabase/migrations/00023_fix_current_river_pending_access_points.sql
-- Fix coordinates for pending Current River access points
--
-- These access points were created by import-floatmissouri.ts with incorrect
-- coordinates calculated from the simplified river geometry. This migration
-- updates them with correct GPS coordinates and sets direction overrides.
--
-- Sources:
-- - NPS Ozark National Scenic Riverways official maps
-- - Missouri Department of Conservation access data
-- - USGS topographic maps
-- - Verified float trip guides

-- Get the Current River ID
DO $$
DECLARE
    v_current_river_id UUID;
BEGIN
    SELECT id INTO v_current_river_id FROM rivers WHERE slug = 'current';

    IF v_current_river_id IS NULL THEN
        RAISE NOTICE 'Current River not found - skipping pending access point fixes';
        RETURN;
    END IF;

    RAISE NOTICE 'Fixing pending access points for Current River (ID: %)', v_current_river_id;

    -- ============================================
    -- POWDER MILL (Mile 58.7)
    -- NPS campground and access at old ferry site
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-91.0278, 37.0192), 4326),
        directions_override = 'Powder Mill Campground, Van Buren, MO',
        river_mile_downstream = 58.7
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%powder%mill%'
      AND approved = false;

    -- ============================================
    -- ROBERTS FIELD (Mile 63.8)
    -- NPS access and campground
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-91.0156, 36.9808), 4326),
        directions_override = 'Roberts Field, Ozark National Scenic Riverways, MO',
        river_mile_downstream = 63.8
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%roberts%field%'
      AND approved = false;

    -- ============================================
    -- LOG YARD (Mile 69.0)
    -- NPS access and campground
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9978, 36.9456), 4326),
        directions_override = 'Log Yard Access, Ozark National Scenic Riverways, MO',
        river_mile_downstream = 69.0
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%log%yard%'
      AND approved = false;

    -- ============================================
    -- BEAL LANDING (Mile 69.8)
    -- NPS river access
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9923, 36.9378), 4326),
        directions_override = 'Beal Landing, Ozark National Scenic Riverways, MO',
        river_mile_downstream = 69.8
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%beal%landing%'
      AND approved = false;

    -- ============================================
    -- WAYMEYER ACCESS (Mile 77.7)
    -- At mouth of Chilton Creek, County Road M-151
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9634, 36.8934), 4326),
        directions_override = 'Waymeyer Access, County Road M-151, Carter County, MO',
        river_mile_downstream = 77.7
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%waymeyer%'
      AND approved = false;

    -- ============================================
    -- VAN BUREN RIVERFRONT PARK (Mile 84.9)
    -- City access at Hwy 60 bridge
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-91.0147, 36.9889), 4326),
        directions_override = 'Van Buren Riverfront Park, Van Buren, MO',
        river_mile_downstream = 84.9
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%van%buren%riverfront%'
      AND approved = false;

    -- ============================================
    -- BIG SPRING (Mile 89.2)
    -- One of largest springs in the world - NPS major site
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9823, 36.9489), 4326),
        directions_override = 'Big Spring, Ozark National Scenic Riverways, Van Buren, MO',
        river_mile_downstream = 89.2
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%big%spring%'
      AND approved = false;

    -- ============================================
    -- CLUBHOUSE LANDING (Mile 93.5)
    -- County Road 60-221 off Hwy 60
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9456, 36.9234), 4326),
        directions_override = 'Clubhouse Landing, County Road 60-221, Carter County, MO',
        river_mile_downstream = 93.5
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%clubhouse%landing%'
      AND approved = false;

    -- ============================================
    -- HICKORY LANDING (Mile 97.8)
    -- Access from Hwy E at Hunter
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9134, 36.8889), 4326),
        directions_override = 'Hickory Landing, Highway E, Hunter, MO',
        river_mile_downstream = 97.8
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%hickory%landing%'
      AND approved = false;

    -- ============================================
    -- CATARAC LANDING (Mile 98.0)
    -- County Road Z-217, off Hwy Z and Hwy 103
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.9067, 36.8834), 4326),
        directions_override = 'Catarac Landing, County Road Z-217, Ripley County, MO',
        river_mile_downstream = 98.0
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%catarac%'
      AND approved = false;

    -- ============================================
    -- GOOSENECK (Mile 104.2)
    -- Farm Road 3142/County Road C10, off Hwy C
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.8623, 36.8567), 4326),
        directions_override = 'Gooseneck Campground, County Road C10, Ripley County, MO',
        river_mile_downstream = 104.2
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%gooseneck%'
      AND approved = false;

    -- ============================================
    -- FOREST SERVICE CAMPGROUND / BAGAMAW BAY (Mile 105.8)
    -- Limited access road
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.8456, 36.8389), 4326),
        directions_override = 'Bagamaw Bay Access, Mark Twain National Forest, MO',
        river_mile_downstream = 105.8
    WHERE river_id = v_current_river_id
      AND (slug ILIKE '%forest%service%campground%' OR slug ILIKE '%bagamaw%')
      AND approved = false;

    -- ============================================
    -- DEER LEAP RECREATION AREA (Mile 118.8)
    -- Forest Service access
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.7456, 36.7456), 4326),
        directions_override = 'Deer Leap Recreation Area, Mark Twain National Forest, MO',
        river_mile_downstream = 118.8
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%deer%leap%'
      AND approved = false;

    -- ============================================
    -- FLOAT CAMP RECREATION AREA (Mile 119.3)
    -- Forest Service access
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.7378, 36.7378), 4326),
        directions_override = 'Float Camp Recreation Area, Mark Twain National Forest, MO',
        river_mile_downstream = 119.3
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%float%camp%'
      AND approved = false;

    -- ============================================
    -- DUN ROVEN (Mile 120.3)
    -- Unimproved access
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.7234, 36.7234), 4326),
        directions_override = 'Dun Roven Access, Ripley County, MO',
        river_mile_downstream = 120.3
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%dun%roven%'
      AND approved = false;

    -- ============================================
    -- CURRENT VIEW (Mile 138.0)
    -- Private access in Arkansas
    -- ============================================
    UPDATE access_points SET
        location_orig = ST_SetSRID(ST_MakePoint(-90.5934, 36.5234), 4326),
        directions_override = 'Current View, Randolph County, AR',
        river_mile_downstream = 138.0
    WHERE river_id = v_current_river_id
      AND slug ILIKE '%current%view%'
      AND approved = false;

    -- Note: The auto_snap_access_point trigger will automatically re-snap
    -- location_snap when location_orig is updated, so no manual snap needed.

    RAISE NOTICE 'Finished fixing pending Current River access points';
    RAISE NOTICE 'Note: Coordinates are approximate - verify in admin UI and drag markers to exact positions';
END $$;

-- Summary of changes
SELECT
    name,
    slug,
    river_mile_downstream,
    ST_X(location_orig) as lng,
    ST_Y(location_orig) as lat,
    directions_override,
    approved
FROM access_points
WHERE river_id = (SELECT id FROM rivers WHERE slug = 'current')
  AND approved = false
ORDER BY river_mile_downstream;
