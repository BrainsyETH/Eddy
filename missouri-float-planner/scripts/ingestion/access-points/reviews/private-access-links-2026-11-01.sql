-- Seven private accesses linked same_place to their own directory rows,
-- 2026-11-01. Applied to production (ilefwfpvphadsbptiaur) at the owner's request.
--
-- Found by the audit after Circle B (circle-b-2026-11-01.sql): each business
-- already had an approved private access point, but no access_point_services
-- row tied it to its directory listing. So the app drew two pins for one place
-- (a directory-row campground/outfitter pin with no access facts, and an access
-- pin without the business's phone or website). same_place folds the directory
-- marker into the access point's pin and routes its content to the sheet
-- (accessLayers.ts, linked-services.ts).
--
-- Each pair: same business by name, both on the same river, pins within 250 m,
-- neither side linked to anything before. The owner confirmed these seven; the
-- audit's same-name pairs 370 to 790 m apart are left for pin review.
--   niangua   Niangua River Oasis                 <- niangua-river-oasis                 0 m
--   niangua   Maggard Canoe & Corkery Campground  <- maggard-canoe-corkery-campground   50 m
--   niangua   Mountain Creek Family Resort        <- mountain-creek-family-resort      248 m
--   elk       Kozy Kamp River Access              <- kozy-kamp-elk-river-floats        114 m
--   elk       Wayside Campground River Access     <- elk-river-floats                  179 m
--   current   The Landing                         <- the-landing-current-river         127 m
--   mulberry  Turner Bend                         <- turner-bend-outfitter             193 m
DO $$
DECLARE n int;
BEGIN
  INSERT INTO access_point_services (access_point_id, nearby_service_id, relationship, source, verified_at)
  SELECT ap.id, ns.id, 'same_place', 'owner', now()
    FROM (VALUES
      ('0c8b863e-8b76-478d-89a4-20b94a9c6972'::uuid, '440541c5-b7e2-4af4-a279-95484670be54'::uuid),
      ('70265db7-fb97-4a07-9d62-50528563813a', 'e5918630-d9a5-4616-9666-63ccd4d4008a'),
      ('0aea3a34-3653-4bd9-a546-8a38fdb4bfc5', 'fd5d280e-1b67-4dbb-a6a9-242803756df2'),
      ('b35fc21f-cb90-4b24-b9f2-e43dd54fa380', 'bb33b9b4-1ad4-4c1c-9bf4-e47d4ca09fa5'),
      ('b634dee8-718d-4c37-8845-9430945b656c', '441830f8-f8a9-4f55-ae29-6e2d745cc2c7'),
      ('97b48508-112d-455e-8260-afed74db22da', '336731ea-116d-4f5a-98c9-ce41b88fe64f'),
      ('1ffc9004-d900-44a4-ac57-290d22c3b46b', 'e029c6e5-439a-4c8f-9ede-bf466922a9d2')
    ) AS v(ap_id, svc_id)
    JOIN access_points ap ON ap.id = v.ap_id AND ap.approved
    JOIN nearby_services ns ON ns.id = v.svc_id AND ns.status = 'active'
    JOIN service_rivers sr ON sr.service_id = ns.id AND sr.river_id = ap.river_id
   WHERE NOT EXISTS (SELECT 1 FROM access_point_services a
                      WHERE a.access_point_id = ap.id OR a.nearby_service_id = ns.id)
     AND ST_Distance(ap.location_orig::geography,
                     ST_SetSRID(ST_MakePoint(ns.longitude, ns.latitude), 4326)::geography) <= 250;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION 'expected 7 links, inserted %', n; END IF;
END $$;
-- Rollback:
--   DELETE FROM access_point_services WHERE relationship = 'same_place' AND source = 'owner'
--      AND access_point_id IN ('0c8b863e-8b76-478d-89a4-20b94a9c6972','70265db7-fb97-4a07-9d62-50528563813a',
--          '0aea3a34-3653-4bd9-a546-8a38fdb4bfc5','b35fc21f-cb90-4b24-b9f2-e43dd54fa380',
--          'b634dee8-718d-4c37-8845-9430945b656c','97b48508-112d-455e-8260-afed74db22da',
--          '1ffc9004-d900-44a4-ac57-290d22c3b46b');
