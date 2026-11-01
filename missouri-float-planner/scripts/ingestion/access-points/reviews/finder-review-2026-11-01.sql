-- Finder review outcomes, 2026-11-01. Applied to production (ilefwfpvphadsbptiaur)
-- with the owner's authorization, after the owner checked each spot on imagery.
-- The review itself is recorded in ../../finder-2026-11/reviewed.csv.
--
-- 1. Four new Big Piney accesses, imported first from ../big-piney.json with
--    import-dossier-access-points.ts --write (approved = false; miles from
--    geometry, which matched hand interpolation on the curated scale). This
--    block sets the fields the dossier RPC can't carry (road_surface,
--    amenities). They are then approved with
--    import-dossier-access-points.ts big-piney --approve, which validates
--    snap distance and mile ordering.
--      - High Log Eddy: pinned where the owner found the road's end (37°32'52.5"N
--        92°01'29.9"W). FS 255 is MVUM maintenance level 3, aggregate, yearlong.
--      - Henry River Access: FS 1538, MVUM level 3, aggregate, yearlong.
--      - Forest Road 1794 Access: FS 1794, MVUM level 2 (high clearance),
--        aggregate. The owner confirmed access with limited parking.
--      - County Road 5328 Access: Texas County road; the owner confirmed access
--        with parking. Surface unknown, so road_surface stays empty.
--
-- 2. Three existing records the owner checked and approved. Each was a bare
--    "Boat ramp" row marked not-a-launch. Each becomes a float endpoint with
--    agency facts from the linked agency_gis_features rows:
--      - Simmons Ford Access (Big Piney, MDC Boat Ramps OBJECTID 43; directions
--        from mdc.mo.gov). Mile 17.17 is consistent with its neighbours.
--      - Dalton Boat Ramp (Eleven Point, AGFC: concrete ramp, paved parking).
--      - Eleven Point Boat Ramp (Eleven Point, AGFC: concrete ramp, gravel
--        parking, bank fishing area; locally the Dunn Road access).
--    The two Arkansas miles were on an old line-fraction scale and overstated
--    the river: Myrtle to Dalton was 17.7 mi and Dalton to the Eleven Point ramp
--    20.5. The NHD channel measures 11.2 and 19.9, and Eddy's line 10.7 and
--    19.3; on Riverton to Myrtle, the line matches the curated miles (12.6 vs
--    12.4). So they are set by line distance below Myrtle (48.0): Dalton 58.7,
--    Eleven Point Boat Ramp 78.0. river_mile_upstream is cleared, as on the
--    other approved Eleven Point rows; no app code reads it.
--
-- Every update is compare-and-set on id, slug and updated_at; the block aborts
-- unless each matches exactly one row.

DO $$
DECLARE n int;
BEGIN
  -- 1. New Big Piney rows (still unapproved).
  UPDATE access_points SET road_surface = '{gravel_maintained}'
   WHERE id = '2550dfce-74e4-4915-9085-e7ad8a456e16' AND slug = 'high-log-eddy' AND NOT approved
     AND updated_at = '2026-11-01 14:20:50.082829+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'high-log-eddy: matched %', n; END IF;

  UPDATE access_points SET road_surface = '{gravel_maintained}'
   WHERE id = '127ac30d-a911-46b8-9ecc-24776d5c941d' AND slug = 'henry-river-access' AND NOT approved
     AND updated_at = '2026-11-01 14:20:50.082829+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'henry-river-access: matched %', n; END IF;

  UPDATE access_points SET road_surface = '{gravel_unmaintained}', amenities = '{parking}'
   WHERE id = '44ab9fb6-daf1-44c2-bf09-3b7276cd23de' AND slug = 'forest-road-1794' AND NOT approved
     AND updated_at = '2026-11-01 14:20:50.082829+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'forest-road-1794: matched %', n; END IF;

  UPDATE access_points SET amenities = '{parking}'
   WHERE id = '9ce61fc4-2ec1-4760-860d-c868e8a2cb32' AND slug = 'county-road-5328' AND NOT approved
     AND updated_at = '2026-11-01 14:20:50.082829+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'county-road-5328: matched %', n; END IF;

  -- 2. Existing records, approved.
  UPDATE access_points SET
         is_float_endpoint = true,
         description = 'MDC access with a boat ramp on the upper Big Piney, a short float above Baptist Camp.',
         road_access = 'From Houston, take US 63 south about 7.5 miles.',
         facilities = 'Boat ramp.',
         amenities = '{boat_ramp}',
         approved = true, approved_at = now()
   WHERE id = '387c6cab-4650-42d7-9b53-889a948c9720' AND slug = 'simmons-ford-access' AND NOT approved
     AND updated_at = '2026-10-29 03:55:30.76162+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'simmons-ford-access: matched %', n; END IF;

  UPDATE access_points SET
         is_float_endpoint = true,
         managing_agency = 'AGFC',
         description = 'Arkansas Game and Fish boat ramp at Dalton, the first public access below the Missouri line.',
         facilities = 'Concrete boat ramp.',
         parking_info = 'Paved lot.',
         amenities = '{boat_ramp,parking}',
         river_mile_downstream = 58.7, river_mile_upstream = NULL,
         approved = true, approved_at = now()
   WHERE id = 'b8c8fcfa-a2b5-42d1-8775-9fd2758c0029' AND slug = 'dalton-boat-ramp' AND NOT approved
     AND river_mile_downstream = 65.70 AND updated_at = '2026-11-01 11:38:10.238405+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'dalton-boat-ramp: matched %', n; END IF;

  UPDATE access_points SET
         is_float_endpoint = true,
         managing_agency = 'AGFC',
         description = 'Arkansas Game and Fish boat ramp near Pocahontas, also known as the Dunn Road access, with a bank fishing area.',
         road_access = 'Off Dunn Road near Imboden.',
         facilities = 'Concrete boat ramp.',
         parking_info = 'Gravel lot.',
         amenities = '{boat_ramp,parking}',
         river_mile_downstream = 78.0, river_mile_upstream = NULL,
         approved = true, approved_at = now()
   WHERE id = '9d982ef6-089c-431b-8af9-74f6898f7189' AND slug = 'eleven-point-boat-ramp' AND NOT approved
     AND river_mile_downstream = 86.16 AND updated_at = '2026-11-01 11:38:10.014762+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'eleven-point-boat-ramp: matched %', n; END IF;
END $$;

-- Rollback (values before this change):
--   new rows: import-dossier-access-points rows; delete or set approved = false,
--     road_surface = '{}', amenities = NULL on the four slugs above.
--   UPDATE access_points SET is_float_endpoint = false, description = NULL, road_access = NULL,
--          facilities = 'Boat ramp', amenities = NULL, approved = false, approved_at = NULL
--    WHERE id = '387c6cab-4650-42d7-9b53-889a948c9720';
--   UPDATE access_points SET is_float_endpoint = false, managing_agency = NULL, description = NULL,
--          facilities = 'Boat ramp', parking_info = NULL, amenities = NULL,
--          river_mile_downstream = 65.70, river_mile_upstream = 31.10, approved = false, approved_at = NULL
--    WHERE id = 'b8c8fcfa-a2b5-42d1-8775-9fd2758c0029';
--   UPDATE access_points SET is_float_endpoint = false, managing_agency = NULL, description = NULL,
--          road_access = NULL, facilities = 'Boat ramp', parking_info = NULL, amenities = NULL,
--          river_mile_downstream = 86.16, river_mile_upstream = 10.64, approved = false, approved_at = NULL
--    WHERE id = '9d982ef6-089c-431b-8af9-74f6898f7189';
