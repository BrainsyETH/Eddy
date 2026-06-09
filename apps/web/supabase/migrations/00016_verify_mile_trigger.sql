-- Verify and fix mile marker trigger issue
-- Run this to check what's happening with the trigger

-- 1. Check current triggers on access_points table
SELECT
    tgname AS trigger_name,
    pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'access_points'::regclass
AND NOT tgisinternal;

-- 2. Check the current function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'auto_snap_access_point';

-- 3. If the function still has the old code, run this to fix it:
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
    -- Keep existing mile marker values - they are manually maintained

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Verify the function was updated
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'auto_snap_access_point';
