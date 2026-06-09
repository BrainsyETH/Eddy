-- File: supabase/migrations/00015_fix_snap_distance.sql
-- Fix: Mile markers should be manually entered, not auto-calculated
-- Only auto-snap the location_snap point, but NEVER touch river_mile values

-- Update auto_snap_access_point to ONLY snap location, NEVER update mile markers
CREATE OR REPLACE FUNCTION auto_snap_access_point()
RETURNS TRIGGER AS $$
DECLARE
    snap_result RECORD;
BEGIN
    -- Snap to river (just for the snapped location point)
    SELECT * INTO snap_result
    FROM snap_to_river(NEW.location_orig, NEW.river_id);

    -- Only update the snapped location point
    NEW.location_snap := snap_result.snapped_point;

    -- NEVER update river_mile_downstream or river_mile_upstream
    -- These are manually entered by admins and should be preserved

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_snap_access_point IS 'Auto-snaps access points to river geometry. Mile markers are NEVER auto-updated - they must be manually maintained.';
