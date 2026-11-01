-- Eight more private accesses linked same_place to their directory rows, after
-- an imagery review, 2026-11-01. Applied to production (ilefwfpvphadsbptiaur)
-- at the owner's request. Follows private-access-links-2026-11-01.sql.
--
-- These eight were held back from that batch because the two pins were 370 to
-- 790 m apart. Each was checked on Esri World Imagery and against the access
-- point's own record, which in every case carries the business's street address
-- and website:
--   riverfront-campground-canoe (Niangua)  370 m  office pin; access on the same property's bank
--   hidden-valley-outfitters (Niangua)     700 m  both pins inside one riverside campground
--   trestle-park-river-access (Elk)        488 m  gravel bar at the trestle; record has Trestle Park's address and site
--   boiling-spring-campground (Gasconade)  497 m  store on Cliff Rd; campground road runs to the access
--   rubys-landing (Gasconade)              741 m  street-address pin; access at the end of the campground road
--   lucky-clover-resort (Meramec)          787 m  office by the lake; owner-placed access on the frontage
--   devils-back (Bourbeuse)                744 m  owner confirmed the access pin is right in /admin
--   wilderness-ridge-resort (Big Piney)           owner moved the pin in /admin (it sat 80 m from
--                                                 Peck's access); now 246 m from the listing
--
-- Wilderness Ridge's mile. The move put it upstream of Ross Access and Peck's
-- on the line (line miles 72.62 vs 72.82 and 72.87; the Big Piney flows north),
-- but /admin left the old 75.20, below both. The Big Piney's curated miles run
-- about 1.98 above its line miles here (Ross 74.80 at line 72.82), so 74.60;
-- every Big Piney row sums to 107.90, so upstream 33.30.
DO $$
DECLARE n int;
BEGIN
  UPDATE access_points SET river_mile_downstream = 74.60, river_mile_upstream = 33.30
   WHERE id = '8655f9a1-65b2-4ef3-8b49-21a8f78fda2c' AND slug = 'wilderness-ridge-resort'
     AND river_mile_downstream = 75.20 AND updated_at = '2026-11-01 18:18:52.518158+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'wilderness-ridge mile: matched %', n; END IF;

  INSERT INTO access_point_services (access_point_id, nearby_service_id, relationship, source, verified_at)
  SELECT ap.id, ns.id, 'same_place', 'owner', now()
    FROM (VALUES
      ('d5a34ce9-9ded-4824-80c0-aececde01898'::uuid, '829e8bef-55f4-4f27-81c6-c3ce0ad65e83'::uuid),
      ('bebee068-5132-44fe-a4b8-2f72882bb4e4', '0c6bc572-445a-4c18-b262-ad90f8cb10d6'),
      ('1eba8b35-fb25-4eff-9ea3-9a499adc465d', 'aede04e7-03e7-42ed-81b7-3e91c2d41c28'),
      ('3d97c538-ab99-4e3f-bca2-4bde8ada0f8d', '7f2bbae5-5c20-4352-846f-ab8866af4f23'),
      ('1d7e2efe-3d02-40cd-8399-dbd315c6922a', 'fa11c49e-62ab-42f4-926e-c7c1902d1760'),
      ('5b6c991a-d004-4774-9617-c16245d60fd6', 'ca859b19-83e2-4e5f-9884-969241b7dae4'),
      ('85594317-ba39-4e8a-bab0-ae364a56b281', 'f20c3809-39b4-4b06-a4b9-10cde60b46af'),
      ('8655f9a1-65b2-4ef3-8b49-21a8f78fda2c', 'b2e1b175-d142-4ce0-b1c0-01298752dcb8')
    ) AS v(ap_id, svc_id)
    JOIN access_points ap ON ap.id = v.ap_id AND ap.approved
    JOIN nearby_services ns ON ns.id = v.svc_id AND ns.status = 'active'
    JOIN service_rivers sr ON sr.service_id = ns.id AND sr.river_id = ap.river_id
   WHERE NOT EXISTS (SELECT 1 FROM access_point_services a
                      WHERE a.access_point_id = ap.id OR a.nearby_service_id = ns.id)
     AND ST_Distance(ap.location_orig::geography,
                     ST_SetSRID(ST_MakePoint(ns.longitude, ns.latitude), 4326)::geography) <= 800;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'expected 8 links, inserted %', n; END IF;
END $$;
-- Rollback:
--   UPDATE access_points SET river_mile_downstream = 75.20, river_mile_upstream = 32.70
--    WHERE id = '8655f9a1-65b2-4ef3-8b49-21a8f78fda2c';
--   DELETE FROM access_point_services WHERE relationship = 'same_place' AND source = 'owner'
--      AND access_point_id IN ('d5a34ce9-9ded-4824-80c0-aececde01898','bebee068-5132-44fe-a4b8-2f72882bb4e4',
--          '1eba8b35-fb25-4eff-9ea3-9a499adc465d','3d97c538-ab99-4e3f-bca2-4bde8ada0f8d',
--          '1d7e2efe-3d02-40cd-8399-dbd315c6922a','5b6c991a-d004-4774-9617-c16245d60fd6',
--          '85594317-ba39-4e8a-bab0-ae364a56b281','8655f9a1-65b2-4ef3-8b49-21a8f78fda2c');
