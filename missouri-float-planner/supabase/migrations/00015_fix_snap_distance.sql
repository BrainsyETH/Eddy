-- File: supabase/migrations/00015_fix_snap_distance.sql
-- Fix: Mile markers should be manually entered, not auto-calculated
-- Only auto-snap the location_snap point, but preserve manual river_mile values

-- Update auto_snap_access_point to ONLY snap location, NOT update mile markers
-- Mile markers are now manually maintained by admins
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

    -- IMPORTANT: Do NOT update river_mile_downstream or river_mile_upstream
    -- These are manually entered by admins and should be preserved
    -- Only set mile markers on INSERT if they are NULL
    IF TG_OP = 'INSERT' AND NEW.river_mile_downstream IS NULL THEN
        NEW.river_mile_downstream := snap_result.river_mile;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_snap_access_point IS 'Auto-snaps access points to river geometry. Mile markers are manually maintained - only auto-set on INSERT if NULL.';
