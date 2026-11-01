-- Jacks Fork and Black finder spots added at the owner's request, 2026-11-01.
-- Applied to production (ilefwfpvphadsbptiaur) with authorization.
--
-- Imported from ../jacks-fork.json and ../black.json (--write), then this
-- block, then --approve (validated snap and ordering).
--   bee-bluff-access (Jacks Fork)        mile 23.47 (geometry; Jacks Fork miles track the line)
--   black-river-bottoms-access (Black)   Corps of Engineers, Co Rd 464; mile 28.96
--   hendrickson-boat-launch (Black)      FS 3046 (asphalt, level 4, yearlong); owner pin
--                                        36.90278, -90.47430 (228 m from the NHD line); mile 70.68
-- The Black uses its own mile datum (curated = line + 7 to 11), so its two miles
-- are interpolated between Highway K Rec Area (25.0) / River Road Park (38.2)
-- and Hammer (62.1) / Hilliard (79.1), replacing the geometry miles (19.8, 63.36).
-- Bay Creek: the owner moved its pin to the NPS campground location; its curated
-- mile 25.20 (published guide) already fits the new pin, so no change.
DO $$
DECLARE n int;
BEGIN
  UPDATE access_points ap SET river_mile_downstream = 28.96, river_mile_upstream = NULL, road_surface = '{dirt}', amenities = '{parking}'
    FROM rivers r WHERE r.id = ap.river_id AND r.slug = 'black' AND ap.slug = 'black-river-bottoms-access' AND NOT ap.approved AND ap.river_mile_downstream = 19.80;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'bottoms: matched %', n; END IF;
  UPDATE access_points ap SET river_mile_downstream = 70.68, river_mile_upstream = NULL, road_surface = '{paved}', amenities = '{boat_ramp}'
    FROM rivers r WHERE r.id = ap.river_id AND r.slug = 'black' AND ap.slug = 'hendrickson-boat-launch' AND NOT ap.approved AND ap.river_mile_downstream = 63.36;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'hendrickson: matched %', n; END IF;
END $$;
-- Rollback: UPDATE access_points SET approved = false WHERE slug IN ('bee-bluff-access','black-river-bottoms-access','hendrickson-boat-launch');
