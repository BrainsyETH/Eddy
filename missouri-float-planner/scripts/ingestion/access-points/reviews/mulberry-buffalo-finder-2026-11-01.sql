-- Mulberry and Buffalo finder spots added at the owner's request, 2026-11-01.
-- Applied to production (ilefwfpvphadsbptiaur) with authorization.
--
-- Imported with import-dossier-access-points.ts --write from ../mulberry.json
-- (first synced to production: two "Private" -> "private" ownership values and
-- Campbell Cemetery's managing agency, so the refresh changed nothing on the
-- seven existing rows) and the new ../buffalo.json, then this block, then
-- --approve (validated snap and ordering). All at the owner's pins.
--   county-road-88               Mulberry  26.61  reached from the bank opposite Hwy 215
--   county-road-5440             Mulberry  12.85
--   ozark-overland-trail-access  Mulberry  11.46  road 12425A on the Ozark Overland Adventure Trail, 4x4
--   county-road-79               Buffalo   26.23
--   county-road-252              Buffalo   63.79  4x4 likely required
-- The Buffalo's curated miles run about 14 below its line here, so its two
-- geometry miles (41.5, 79.62) are replaced by interpolation between Erbie
-- (22.3) / Ozark (27.8) and Woolum (56.3) / Baker Ford (67.2). The Mulberry
-- geometry miles already follow the river's ratio.
-- Co Rd 251: the owner confirmed it is Mt. Hersey itself, not a separate spot; not added.
DO $$
DECLARE n int;
BEGIN
  UPDATE access_points ap SET river_mile_downstream = 26.23, river_mile_upstream = NULL
    FROM rivers r WHERE r.id = ap.river_id AND r.slug = 'buffalo' AND ap.slug = 'county-road-79' AND NOT ap.approved AND ap.river_mile_downstream = 41.50;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'cr79: matched %', n; END IF;
  UPDATE access_points ap SET river_mile_downstream = 63.79, river_mile_upstream = NULL, road_surface = '{dirt,4wd_required}', amenities = '{parking}'
    FROM rivers r WHERE r.id = ap.river_id AND r.slug = 'buffalo' AND ap.slug = 'county-road-252' AND NOT ap.approved AND ap.river_mile_downstream = 79.62;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'cr252: matched %', n; END IF;
  UPDATE access_points ap SET road_surface = '{dirt,4wd_required}', amenities = '{parking}'
    FROM rivers r WHERE r.id = ap.river_id AND r.slug = 'mulberry' AND ap.slug = 'ozark-overland-trail-access' AND NOT ap.approved;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'overland: matched %', n; END IF;
END $$;
-- Rollback: UPDATE access_points SET approved = false WHERE slug IN (the five above);
