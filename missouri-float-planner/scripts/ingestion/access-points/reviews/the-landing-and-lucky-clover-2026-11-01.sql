-- The Landing (Current) and Lucky Clover Resort (Meramec), 2026-11-01. Applied
-- to production (ilefwfpvphadsbptiaur) with the owner's authorization, after
-- the owner moved both pins and approved "Beal Landing on left" in the admin.
--
-- beal-landing-on-left: the owner identified it as The Landing, a private
-- resort in downtown Van Buren. Facts from thelandingcurrentriver.com:
-- 110 Front St; 54 riverfront lodge rooms; the Blue Heron Restaurant; tube,
-- kayak, canoe and raft rentals; an NPS concessioner in the Ozark National
-- Scenic Riverways. The slug stays (public identity). Mile from the owner's
-- pin: the Current's curated miles equal its line miles (Powder Mill 60.73 at
-- line 60.73), so 86.71; upstream = 173.97 - 86.71 = 87.26 (every Current row
-- sums to 173.97). The old 69.8 was 17 miles off.
--
-- lucky-clover-resort: the owner moved the pin about 800 m. The Meramec's
-- curated miles run 22.3 to 22.7 below its line miles (Indian Springs, Riverview,
-- Bird's Nest, Garrison's), so line 69.95 gives 47.4 (was 46.9). The Meramec
-- stores upstream equal to downstream on every row; kept that way.
--
-- Compare-and-set on id, slug and updated_at; each update must match one row.

DO $$
DECLARE n int;
BEGIN
  UPDATE access_points SET
         name = 'The Landing',
         is_float_endpoint = true,
         river_mile_downstream = 86.71, river_mile_upstream = 87.26,
         ownership = 'private', managing_agency = 'Private',
         official_site_url = 'https://www.thelandingcurrentriver.com',
         description = 'Private riverfront resort in downtown Van Buren and a National Park Service concessioner on the Ozark National Scenic Riverways. Lodge rooms, the Blue Heron Restaurant, and tube, kayak, canoe and raft rentals.',
         road_access = '110 Front St, Van Buren, just below the Hwy 60 bridge.',
         facilities = 'Lodge rooms, restaurant, and float rentals.',
         local_tips = '<p><strong>Private resort.</strong> Check with The Landing before launching or parking if you are not a guest.</p>'
   WHERE id = '97b48508-112d-455e-8260-afed74db22da' AND slug = 'beal-landing-on-left'
     AND updated_at = '2026-11-01 15:01:16.540542+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'beal-landing-on-left: matched %', n; END IF;

  UPDATE access_points SET river_mile_downstream = 47.4, river_mile_upstream = 47.4
   WHERE id = '5b6c991a-d004-4774-9617-c16245d60fd6' AND slug = 'lucky-clover-resort'
     AND river_mile_downstream = 46.90 AND updated_at = '2026-11-01 15:04:02.155248+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'lucky-clover-resort: matched %', n; END IF;
END $$;

-- Rollback (values before this change):
--   UPDATE access_points SET name = 'Beal Landing on left', is_float_endpoint = false,
--          river_mile_downstream = 69.80, river_mile_upstream = 64.40, ownership = NULL,
--          managing_agency = NULL, official_site_url = NULL,
--          description = 'Beal Landing on left. Access.', road_access = NULL, facilities = NULL,
--          local_tips = NULL
--    WHERE id = '97b48508-112d-455e-8260-afed74db22da';
--   UPDATE access_points SET river_mile_downstream = 46.90, river_mile_upstream = 46.90
--    WHERE id = '5b6c991a-d004-4774-9617-c16245d60fd6';
