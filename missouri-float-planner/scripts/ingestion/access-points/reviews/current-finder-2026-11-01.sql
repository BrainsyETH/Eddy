-- Current River finder spots approved by the owner on imagery, 2026-11-01.
-- Applied to production (ilefwfpvphadsbptiaur) with authorization.
--
-- Imported from ../current.json (import-dossier-access-points.ts current
-- --write; the Current's curated miles equal its line miles, so geometry miles
-- are right), then this block, then --approve (validated snap and ordering).
-- The owner asked for these to be treated as off-road / 4x4 accesses with
-- limited parking and limited access, which the text says.
--   county-road-kk-359  mile 19.71   about 2.5 mi below Akers Ferry
--   county-road-126     mile 80.37   about 1 mi below Waymeyer (NPS lists a Pin Oak access near here)
--   county-road-m-135   mile 81.94   about 2.5 mi below Waymeyer (NPS lists Raftyard 5 mi north of Van Buren on Route M)
--   dunrovin            mile 121.94  FS 4819, river right, about 1.3 mi below Float Camp
-- Held: Co Rd F-217 (owner pin 36.89492, -90.90929 is 442 m from Hickory Landing).
-- No agency photos exist for these spots (nearest NPS photo is 3+ km away).
DO $$
DECLARE n int;
BEGIN
  UPDATE access_points ap SET road_surface = '{dirt,4wd_required}', amenities = '{parking}'
    FROM rivers r
   WHERE r.id = ap.river_id AND r.slug = 'current' AND NOT ap.approved
     AND ap.slug IN ('county-road-kk-359','county-road-m-135','county-road-126','dunrovin')
     AND coalesce(ap.road_surface, '{}') = '{}' AND ap.created_at > '2026-11-01 16:00:00+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 4 THEN RAISE EXCEPTION 'expected 4, matched %', n; END IF;
END $$;
-- Rollback: UPDATE access_points SET approved = false WHERE slug IN (the four above);
