-- Two county bridges and the Sandy Shoals Ford pin, 2026-11-01. Applied to
-- production (ilefwfpvphadsbptiaur) with the owner's authorization.
--
-- 1. County Road 405 Bridge (Eleven Point) and County Road 5117 Bridge (Big
--    Piney): the owner found river access at each, but no parking and private
--    land around. Added as ordinary accesses with that noted in their text
--    (../eleven-point.json, ../big-piney.json, imported with --write, then
--    approved with --approve). The import set the Eleven Point bridge's mile
--    from line geometry (12.44). The Eleven Point uses curated float-chart
--    miles, as with Long Hollow, so it is set here to 8.2, interpolated between
--    Denny Hollow (6.5, line 10.22) and Cane Bluff (9.3, line 12.69) at line
--    11.73. Upstream is cleared, as on the other approved Eleven Point rows.
--    The Big Piney bridge's geometry mile, 22.42, already matched
--    interpolation.
--
-- 2. Sandy Shoals Ford (Big Piney, approved) was pinned at a rounded
--    placeholder (37.378, -91.974): no road crosses the river within 4 km of
--    it. Census still draws Sand Shoals Rd through the old low-water ford
--    (37.411016, -91.949972), with private land on both banks per the owner's
--    parcel map. The road now crosses on a bridge about 200 m north, where
--    Census shows the crossing segment at 37.412816, -91.950842 and the owner's
--    imagery shows Sand Shoals Road on the bridge. The pin moves to that
--    bridge. Mile: line 36.79 interpolated between Mineral Springs (30.4, line
--    29.49) and Boiling Spring (44.6, line 43.32) gives 37.9 (upstream 70.0).
--    Sandy Shoals to Boiling Spring becomes 6.7 mi; published float reports
--    say 6 to 8 (it was 10.0). The text drops the ford and the unverified "8 to
--    10 vehicles" pull-off.
--
-- Compare-and-set on id, slug and updated_at; each update must match one row.

DO $$
DECLARE n int;
BEGIN
  UPDATE access_points SET river_mile_downstream = 8.2, river_mile_upstream = NULL
   WHERE id = 'd82ac7ea-14f4-49a2-a2ec-6ab5ed0fb879' AND slug = 'county-road-405-bridge' AND NOT approved
     AND river_mile_downstream = 12.44 AND updated_at = '2026-11-01 14:36:11.613889+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'county-road-405-bridge: matched %', n; END IF;

  UPDATE access_points SET
         location_orig = ST_SetSRID(ST_MakePoint(-91.950842, 37.412816), 4326),
         river_mile_downstream = 37.9, river_mile_upstream = 70.0,
         description = 'County road bridge where Sand Shoals Road crosses the Big Piney between Hwy E and Hwy AA. Popular put-in for the 7-mile float to Boiling Spring, a top Missouri day trip. The river runs like a swift creek here, with Class II riffles, pine-topped bluffs and lots of shade.',
         road_access = 'Take Sand Shoals Road from either Hwy E (east) or Hwy AA (west) to the bridge. Gravel road; passable by passenger vehicles in dry conditions.',
         parking_info = 'No developed parking. The land on both sides of the bridge is private, so park only where the road allows.',
         facilities = 'No facilities.',
         amenities = NULL,
         ownership = 'county (road right-of-way)', managing_agency = 'County'
   WHERE id = 'e5de40a4-9d06-49a3-b5dd-28d7dd718252' AND slug = 'sandy-shoals-ford'
     AND ST_Equals(location_orig, ST_SetSRID(ST_MakePoint(-91.974, 37.378), 4326))
     AND river_mile_downstream = 34.60 AND updated_at = '2026-11-01 12:24:03.723543+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'sandy-shoals-ford: matched %', n; END IF;
END $$;

-- Rollback (values before this change):
--   UPDATE access_points SET river_mile_downstream = 12.44, river_mile_upstream = 84.36
--    WHERE id = 'd82ac7ea-14f4-49a2-a2ec-6ab5ed0fb879';
--   UPDATE access_points SET location_orig = ST_SetSRID(ST_MakePoint(-91.974, 37.378), 4326),
--          river_mile_downstream = 34.60, river_mile_upstream = 73.30,
--          description = 'Low-water ford where Sand Shoals Road crosses between Hwy E and Hwy AA. Popular put-in for the 6 to 8 mile float to Boiling Spring, a top Missouri day trip. The river runs like a swift creek here, with Class II riffles, pine-topped bluffs and lots of shade.',
--          road_access = 'Take Sand Shoals Road from either Hwy E (east) or Hwy AA (west). The road crosses the Big Piney at a low-water ford. Gravel road; passable by passenger vehicles in dry conditions.',
--          parking_info = 'Roadside pull-off near the ford. Limited, about 8 to 10 vehicles.',
--          facilities = 'No facilities. The low-water ford may be impassable in high water.',
--          amenities = '{parking}', ownership = 'county', managing_agency = NULL
--    WHERE id = 'e5de40a4-9d06-49a3-b5dd-28d7dd718252';
--   The two bridges: set approved = false (or delete) on county-road-405-bridge and county-road-5117-bridge.
