-- Reviewed tailwater data corrections, 2026-10-15. Target: ilefwfpvphadsbptiaur.
-- DML only. Preview this exact transaction first. Replace final ROLLBACK with
-- COMMIT only for the authorized apply. No activation or thresholds are changed.
-- Evidence and outstanding acceptance gates: TAILWATER_REVIEW_2026-10-15.md.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $review$
BEGIN
  PERFORM id FROM rivers WHERE slug IN ('norfork-tailwater','white','taneycomo') ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM rivers WHERE slug IN ('norfork-tailwater','white','taneycomo') AND active=false AND river_type='dam_tailwater') <> 3 THEN
    RAISE EXCEPTION 'Expected three inactive tailwaters; review changed state before applying';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rivers WHERE id='7c0071f1-dd3d-4579-97c5-9537b9d39733' AND slug='norfork-tailwater' AND controlling_dam_id='swl-norfork-dam' AND description IN ('Not quite five miles of the North Fork River between Norfork Dam and the White River — small, cold and catch-and-release from end to end. A siphon holds a steady 185 cfs whenever the two generators are idle, which is what makes it wadeable; when a unit comes on the river goes up about sixteenfold, to roughly 3,300 cfs, and wading is over. Named for the tailwater rather than the river because Eddy already carries the North Fork River above Norfork Lake, in Missouri, and they are not the same water.','The cold-water North Fork River below Norfork Dam joins the White River at Norfork, Arkansas. The proposed boat corridor runs from Dam-Quarry Boat Ramp to Norfork Access on the White River just below the confluence. Releases can change conditions along this reach; observed dam readings and generation schedules do not establish a safe wading or departure window. Check the current Arkansas Game and Fish Commission trout regulations for the section you fish.')) THEN
    RAISE EXCEPTION 'Unexpected river identity/copy: norfork-tailwater';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rivers WHERE id='d6aa9ba7-0788-441d-9081-88e1866f1771' AND slug='taneycomo' AND controlling_dam_id='swl-table-rock-dam' AND description IN ('Twenty-three miles of the White River between Table Rock Dam and Powersite Dam at Forsyth — a lake by name and by law, a cold tailwater in practice. The top few miles below the dam fish and wade like a river at 53 °F in August; the bottom half is flatwater backed up behind Powersite. Four generators drive the whole thing, and the tailwater below the dam swings eight feet between idle and full generation — the largest, fastest move Eddy measures anywhere.','Lake Taneycomo occupies the White River between Table Rock Dam and Powersite Dam. Cold-water releases from Table Rock support its trout fishery and can change the current and water level, especially in the upper reach. The proposed first boat corridor is Shepherd of the Hills Hatchery Boat Ramp to Cooper Creek Access. Dam observations and generation schedules do not establish a safe wading window; check posted restrictions and current Missouri Department of Conservation regulations.')) THEN
    RAISE EXCEPTION 'Unexpected river identity/copy: taneycomo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rivers WHERE id='bdb3e12a-5a9a-4163-9e41-e5f41ebc8fa6' AND slug='white' AND controlling_dam_id='swl-bull-shoals-dam' AND description IN ('The White River below Bull Shoals Dam — Arkansas’s flagship trout tailwater, cold year-round and running at whatever the Corps releases. Ninety miles of shoals and long pools from the dam past Cotter, Buffalo City and Norfork down to the Highway 58 bridge at Guion, where the Game and Fish Commission’s trout water ends. Eight generators can take the river from a wadeable 800 cfs to over 20,000 cfs in an hour, under a clear sky and with no rain anywhere in the basin.','The White River below Bull Shoals Dam is a regulated trout fishery extending downstream through Cotter and Norfork to the Highway 58 bridge at Guion. Bull Shoals releases affect the upper reach; tributaries and Norfork Dam releases also influence water farther downstream. A reading at Bull Shoals does not describe every access point. Check current observations, posted restrictions and Arkansas Game and Fish Commission regulations for your section.')) THEN
    RAISE EXCEPTION 'Unexpected river identity/copy: white';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM access_points a JOIN rivers r ON r.id=a.river_id WHERE a.id='1daa6131-dd01-4dec-bb66-f64a82936ac1' AND a.name='Bill Ackerman River Ridge Access' AND r.slug='norfork-tailwater' AND a.approved=true) THEN
    RAISE EXCEPTION 'Unexpected access identity: 1daa6131-dd01-4dec-bb66-f64a82936ac1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM access_points a JOIN rivers r ON r.id=a.river_id WHERE a.id='8d46b4d6-a718-4555-99ea-ff2db9f013a8' AND a.name='Shepherd of the Hills Hatchery Bank Access' AND r.slug='taneycomo' AND a.approved=true) THEN
    RAISE EXCEPTION 'Unexpected access identity: 8d46b4d6-a718-4555-99ea-ff2db9f013a8';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM access_points a JOIN rivers r ON r.id=a.river_id WHERE a.id='5caefde8-f9fa-4da5-9c4f-385583621cf7' AND a.name='Bronie Yurkonis Walk-In Access (The Narrows)' AND r.slug='white' AND a.approved=true) THEN
    RAISE EXCEPTION 'Unexpected access identity: 5caefde8-f9fa-4da5-9c4f-385583621cf7';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM access_points a JOIN rivers r ON r.id=a.river_id WHERE a.id='8172624e-45b8-4546-98ff-301c89b9b320' AND a.name='Roundhouse Shoals Walk-In Access' AND r.slug='white' AND a.approved=true) THEN
    RAISE EXCEPTION 'Unexpected access identity: 8172624e-45b8-4546-98ff-301c89b9b320';
  END IF;
END $review$;
UPDATE rivers SET description='The cold-water North Fork River below Norfork Dam joins the White River at Norfork, Arkansas. The proposed boat corridor runs from Dam-Quarry Boat Ramp to Norfork Access on the White River just below the confluence. Releases can change conditions along this reach; observed dam readings and generation schedules do not establish a safe wading or departure window. Check the current Arkansas Game and Fish Commission trout regulations for the section you fish.', updated_at=now() WHERE slug='norfork-tailwater';
UPDATE rivers SET description='The White River below Bull Shoals Dam is a regulated trout fishery extending downstream through Cotter and Norfork to the Highway 58 bridge at Guion. Bull Shoals releases affect the upper reach; tributaries and Norfork Dam releases also influence water farther downstream. A reading at Bull Shoals does not describe every access point. Check current observations, posted restrictions and Arkansas Game and Fish Commission regulations for your section.', updated_at=now() WHERE slug='white';
UPDATE rivers SET description='Lake Taneycomo occupies the White River between Table Rock Dam and Powersite Dam. Cold-water releases from Table Rock support its trout fishery and can change the current and water level, especially in the upper reach. The proposed first boat corridor is Shepherd of the Hills Hatchery Boat Ramp to Cooper Creek Access. Dam observations and generation schedules do not establish a safe wading window; check posted restrictions and current Missouri Department of Conservation regulations.', updated_at=now() WHERE slug='taneycomo';
UPDATE access_points SET is_float_endpoint=false, updated_at=now() WHERE id='1daa6131-dd01-4dec-bb66-f64a82936ac1';
UPDATE access_points SET is_float_endpoint=false, updated_at=now() WHERE id='8d46b4d6-a718-4555-99ea-ff2db9f013a8';
UPDATE access_points SET is_float_endpoint=false, updated_at=now() WHERE id='5caefde8-f9fa-4da5-9c4f-385583621cf7';
UPDATE access_points SET is_float_endpoint=false, updated_at=now() WHERE id='8172624e-45b8-4546-98ff-301c89b9b320';
UPDATE access_points SET official_site_url='https://www.recreation.gov/camping/campgrounds/232565',updated_at=now() WHERE id='80db3a77-db31-4b8a-9010-248534a1f4cc';
UPDATE access_points SET official_site_url='https://www.agfc.com/wp-content/uploads/2023/05/tp_norforktailwater2010.pdf',updated_at=now() WHERE id='1daa6131-dd01-4dec-bb66-f64a82936ac1';
UPDATE access_points SET official_site_url='https://www.agfc.com/wp-content/uploads/2023/05/bull_shoals_lake_tailwater_continued.pdf',updated_at=now() WHERE id='00434692-242e-4d35-bfc7-d0d40c5e160e';
UPDATE access_points SET official_site_url='https://mdc.mo.gov/discover-nature/places/shepherd-hills-conservation-education-center',updated_at=now() WHERE id='8d46b4d6-a718-4555-99ea-ff2db9f013a8';
UPDATE access_points SET official_site_url='https://mdc.mo.gov/discover-nature/places/shepherd-hills-conservation-education-center',updated_at=now() WHERE id='6fa46369-646b-4cc0-bc66-719a0851cf34';
UPDATE access_points SET description='AGFC Norfork #1 boat ramp on the east bank of the White River, downstream of the North Fork confluence. The ramp on the opposite bank is a separate facility.',updated_at=now() WHERE id='00434692-242e-4d35-bfc7-d0d40c5e160e';
-- Join only the already-connected NHD-derived White segment. Preserve existing
-- manual river miles; append 0.135474 miles to the old 4.87-mile mouth marker.
DO $geometry$
DECLARE n rivers%ROWTYPE; w geometry; p geometry; segment geometry; joined geometry;
BEGIN
  SELECT * INTO STRICT n FROM rivers WHERE slug='norfork-tailwater';
  SELECT geom INTO STRICT w FROM rivers WHERE slug='white';
  SELECT location_orig::geometry INTO STRICT p FROM access_points WHERE id='00434692-242e-4d35-bfc7-d0d40c5e160e' AND river_id=n.id;
  IF n.length_miles=4.87 AND ST_DWithin(ST_EndPoint(n.geom)::geography,ST_SetSRID(ST_Point(-92.289813,36.210834),4326)::geography,0.1) THEN
    IF ST_Distance(ST_EndPoint(n.geom)::geography,ST_ClosestPoint(w,ST_EndPoint(n.geom))::geography)>1 OR ST_LineLocatePoint(w,p)<=ST_LineLocatePoint(w,ST_EndPoint(n.geom)) THEN
      RAISE EXCEPTION 'Confluence is disconnected or takeout is upstream';
    END IF;
    segment:=ST_LineSubstring(w,ST_LineLocatePoint(w,ST_EndPoint(n.geom)),ST_LineLocatePoint(w,p));
    IF ST_Length(segment::geography) NOT BETWEEN 200 AND 235 THEN RAISE EXCEPTION 'Unexpected White continuation length'; END IF;
    joined:=ST_MakeLine(n.geom,segment);
    UPDATE rivers SET geom=joined,downstream_point=ST_EndPoint(joined),length_miles=5.01,updated_at=now() WHERE id=n.id;
    UPDATE access_points SET location_orig=location_orig,updated_at=now() WHERE river_id=n.id;
    UPDATE access_points SET river_mile_downstream=5.01,updated_at=now() WHERE id='00434692-242e-4d35-bfc7-d0d40c5e160e';
  ELSIF NOT (n.length_miles=5.01 AND ST_DWithin(ST_EndPoint(n.geom)::geography,ST_ClosestPoint(w,p)::geography,1)) THEN
    RAISE EXCEPTION 'Unexpected Norfork geometry; no automatic replacement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM access_points WHERE id='00434692-242e-4d35-bfc7-d0d40c5e160e' AND river_mile_downstream=5.01 AND snap_distance_m BETWEEN 60 AND 72) THEN RAISE EXCEPTION 'Takeout correction failed'; END IF;
END $geometry$;
-- river_note is short guidance: condition cards append it to the reading text
-- (buildStaticEddyText) and the Eddy prompt reads it, so it must not repeat
-- the description. 'fluctuating_flow' matches the tailwater vocabulary in 00205.
INSERT INTO river_characteristics (river_id,is_spring_fed,primary_hazards,low_water_meaning,rising_water_hazards,river_note) SELECT id,false,ARRAY['cold_water','fluctuating_flow'],
'Low observed release at the dam does not establish wading safety or a downstream water level.',
'Changing releases can raise water levels and strengthen current. Follow posted dam restrictions and warning signals.',
'Norfork Dam releases can change conditions along this reach; dam readings and generation schedules do not establish a safe wading or departure window.' FROM rivers WHERE slug='norfork-tailwater' ON CONFLICT (river_id) DO NOTHING;
INSERT INTO river_characteristics (river_id,is_spring_fed,primary_hazards,low_water_meaning,rising_water_hazards,river_note) SELECT id,false,ARRAY['cold_water','fluctuating_flow'],
'Low observed release at the dam does not establish wading safety or a downstream water level.',
'Changing releases can raise water levels and strengthen current. Follow posted dam restrictions and warning signals.',
'Bull Shoals releases drive the upper reach; tributaries and Norfork Dam releases also affect water farther downstream, so a Bull Shoals reading does not describe every access point.' FROM rivers WHERE slug='white' ON CONFLICT (river_id) DO NOTHING;
INSERT INTO river_characteristics (river_id,is_spring_fed,primary_hazards,low_water_meaning,rising_water_hazards,river_note) SELECT id,false,ARRAY['cold_water','fluctuating_flow'],
'Low observed release at the dam does not establish wading safety or a downstream water level.',
'Changing releases can raise water levels and strengthen current. Follow posted dam restrictions and warning signals.',
'Table Rock releases change the current and water level, especially in the upper reach; dam readings and generation schedules do not establish a safe wading window.' FROM rivers WHERE slug='taneycomo' ON CONFLICT (river_id) DO NOTHING;
SELECT r.slug,r.active,r.length_miles,count(a.id) FILTER (WHERE a.is_float_endpoint) AS float_endpoints FROM rivers r LEFT JOIN access_points a ON a.river_id=r.id WHERE r.slug IN ('norfork-tailwater','white','taneycomo') GROUP BY r.id ORDER BY r.slug;
ROLLBACK;
