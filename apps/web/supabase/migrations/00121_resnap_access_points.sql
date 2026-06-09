-- File: supabase/migrations/00121_resnap_access_points.sql
-- Force-resnap every access_points row against the current rivers.geom,
-- and add a snap_distance_m column + a 1500 m distance threshold to the
-- auto_snap_access_point trigger so future geometry changes can't drag
-- access points across the state.
--
-- Why this exists:
-- After 00120 rewrote rivers.geom for eleven-point (49 mi truncated AR
-- portion → 94 mi full chain), every Eleven Point access point was
-- still snapped to its position on the OLD truncated line because the
-- existing trigger only fires `BEFORE INSERT OR UPDATE OF location_orig,
-- river_id` (00003) — geom changes don't fire it. The js helper
-- scripts/snap-access-points.ts updates location_orig to its current
-- value to force the trigger, but the Supabase JS client doesn't always
-- round-trip a PostGIS geometry through `update({ location_orig: ... })`
-- cleanly, so the trigger sometimes never fires.
--
-- Doing the resnap inside SQL eliminates the round-trip problem. The
-- threshold matches the one already used by POIs (00117) and
-- campgrounds — an access point 5 km from any river was getting
-- silently dragged onto a line; it now stays at its raw lat/lon and the
-- dataset RPC's COALESCE(location_snap, location_orig) falls through
-- correctly.

ALTER TABLE access_points
  ADD COLUMN IF NOT EXISTS snap_distance_m NUMERIC(8, 2);

-- Trigger function: snap when within 1500 m, leave NULL otherwise.
-- Mile markers stay manually maintained (preserves the 00015/00016
-- behavior — this trigger only ever touches location_snap +
-- snap_distance_m).
CREATE OR REPLACE FUNCTION auto_snap_access_point()
RETURNS TRIGGER AS $$
DECLARE
  snap_result RECORD;
BEGIN
  IF NEW.location_orig IS NULL OR NEW.river_id IS NULL THEN
    NEW.location_snap := NULL;
    NEW.snap_distance_m := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO snap_result
  FROM snap_to_river(NEW.location_orig, NEW.river_id);

  NEW.snap_distance_m := snap_result.distance_from_original_meters;

  IF snap_result.distance_from_original_meters <= 1500 THEN
    NEW.location_snap := snap_result.snapped_point;
  ELSE
    NEW.location_snap := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_snap_access_point IS
  'Snaps an access point to its river_id''s geom when within 1500 m. Stores distance in snap_distance_m. Mile markers (river_mile_downstream / river_mile_upstream) are preserved.';

-- Force a re-snap of every active row by writing location_orig to
-- itself, which fires the BEFORE UPDATE OF location_orig trigger.
-- Inside SQL this is reliable; via the JS client it depends on PostGIS
-- geometry round-tripping correctly.
UPDATE access_points
SET location_orig = location_orig
WHERE location_orig IS NOT NULL AND river_id IS NOT NULL;
