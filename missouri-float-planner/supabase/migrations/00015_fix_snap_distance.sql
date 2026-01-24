-- File: supabase/migrations/00015_fix_snap_distance.sql
-- Fix: Prevent mile marker from becoming 0 when point is too far from river

-- Update auto_snap_access_point to validate snap distance
-- If point is more than 1 mile from river, keep existing values
CREATE OR REPLACE FUNCTION auto_snap_access_point()
RETURNS TRIGGER AS $$
DECLARE
    snap_result RECORD;
    v_river_length NUMERIC;
    v_max_snap_distance_meters CONSTANT NUMERIC := 1609.34; -- 1 mile in meters
BEGIN
    -- Snap to river (returns mile from headwaters)
    SELECT * INTO snap_result
    FROM snap_to_river(NEW.location_orig, NEW.river_id);

    -- If snap distance is too large (> 1 mile), the point is likely outside the river's extent
    -- Keep existing values to prevent invalid mile marker
    IF snap_result.distance_from_original_meters > v_max_snap_distance_meters THEN
        -- Log warning but don't update snap values
        RAISE NOTICE 'Access point % is %.0f meters from river - keeping existing mile marker',
            COALESCE(NEW.name, NEW.id::text),
            snap_result.distance_from_original_meters;

        -- Keep existing values if they exist, otherwise use the calculated ones
        IF OLD IS NOT NULL AND OLD.river_mile_downstream IS NOT NULL THEN
            NEW.location_snap := OLD.location_snap;
            NEW.river_mile_downstream := OLD.river_mile_downstream;
            NEW.river_mile_upstream := OLD.river_mile_upstream;
            RETURN NEW;
        END IF;
    END IF;

    NEW.location_snap := snap_result.snapped_point;

    -- Store mile from headwaters in river_mile_downstream
    NEW.river_mile_downstream := snap_result.river_mile;

    -- Calculate upstream mile (requires river length)
    SELECT length_miles INTO v_river_length
    FROM rivers WHERE id = NEW.river_id;

    IF v_river_length IS NOT NULL THEN
        NEW.river_mile_upstream := v_river_length - snap_result.river_mile;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_snap_access_point IS 'Auto-snaps access points to river geometry. Validates snap distance to prevent invalid mile markers when point is too far from river.';
