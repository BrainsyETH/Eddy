-- Pins moved to MDC's own boat ramps, 2026-11-01. Applied to production
-- (ilefwfpvphadsbptiaur) with the owner's authorization.
--
-- Found by a table-wide scan for each access point's agency feature of the
-- same name sitting 250 m or more from Eddy's pin (agency_gis_features, MDC
-- Discover_Nature Area_Feature_Layers/17 "Boat Ramps"). Each ramp was checked
-- against the USGS NHD channel of its own river: 10 to 38 m from it, with no
-- other stream closer.
--
-- mineral-springs (Big Piney): a rounded placeholder (37.344, -91.988), 2.7 km
-- from MDC's ramp (OBJECTID 42, Area_ID 7207). The Big Piney's curated miles
-- track the pins, so the mile moves too. Line 32.46 interpolated between Dogs
-- Bluff (27.5, line 26.70) and Sandy Shoals Ford (37.9, line 36.79) gives
-- 33.4; upstream = 107.9 - 33.4 = 74.5. A trip report gives Mineral Springs to
-- Ross as about 40 mi: 41.4 now, 44.4 before.
--
-- Five pins 290 to 480 m from their ramp. Each moves 0.16 to 0.31 mi along
-- the river line, under the line's own resolution (one vertex per ~400 m), so
-- their curated miles stay:
--   ross-bridge (Big Piney)                       465 m, OBJECTID 217
--   blair-bridge-access (North Fork)               482 m, OBJECTID 33
--   blue-springs-creek-conservation-area (Meramec) 404 m, OBJECTID 170
--   syenite-access (St. Francis)                   355 m, OBJECTID 95
--   mount-shira-access (Elk)                       288 m, OBJECTID 8
--
-- Not moved: millstream-gardens-conservation-area. Its MDC ramp (OBJECTID 56)
-- belongs to millstream-gardens-fishermans-access (11 m away, already linked);
-- the conservation-area record is the Tiemann Shut-Ins put-in half a mile
-- downriver, and its pin is right.
--
-- Each ramp is linked as the record's evidence row. Compare-and-set on id,
-- slug, the old pin and updated_at; each update must match one row. The
-- auto-snap trigger recomputes location_snap.

DO $$
DECLARE
  n int;
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('0b33a1f8-65b9-4625-991e-b9c49e52160b'::uuid, 'mineral-springs', -91.988::float8, 37.344::float8, -91.969823::float8, 37.363077::float8, '2026-11-01 12:23:40.582083+00'::timestamptz, '42'),
    ('759276c1-7315-424b-8cc1-389b04c41325'::uuid, 'ross-bridge', -92.0499, 37.6656, -92.049334, 37.669769, '2026-11-01 12:23:52.423376+00'::timestamptz, '217'),
    ('e39b19ae-8724-4342-95a7-3e1c2a71e2ed'::uuid, 'blair-bridge-access', -92.22961, 36.65844, -92.229615, 36.654094, '2026-09-14 19:11:18.821152+00'::timestamptz, '33'),
    ('d658aa48-f902-46cb-95fb-48e3cd3f77e4'::uuid, 'blue-springs-creek-conservation-area', -91.15971627674537, 38.120494447902416, -91.15813, 38.117079, '2026-11-01 12:24:01.362828+00'::timestamptz, '170'),
    ('ebee3b3f-bf5a-4a57-9dac-9157c08cb55a'::uuid, 'syenite-access', -90.40947, 37.68131, -90.413489, 37.681228, '2026-08-23 19:07:13.522494+00'::timestamptz, '95'),
    ('27360515-50c8-4eba-9d29-0aed2444fad0'::uuid, 'mount-shira-access', -94.46142, 36.57653, -94.463096, 36.57875, '2026-10-04 15:27:46.250463+00'::timestamptz, '8')
  ) AS t(id, slug, old_x, old_y, new_x, new_y, stamp, oid)
  LOOP
    UPDATE access_points SET location_orig = ST_SetSRID(ST_MakePoint(r.new_x, r.new_y), 4326)
     WHERE id = r.id AND slug = r.slug
       AND ST_DWithin(location_orig, ST_SetSRID(ST_MakePoint(r.old_x, r.old_y), 4326), 0.0000001)
       AND updated_at = r.stamp;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '%: matched %', r.slug, n; END IF;

    UPDATE agency_gis_features SET access_point_id = r.id
     WHERE provider = 'mdc' AND source_type = 'Boat Ramps' AND source_object_id = r.oid AND access_point_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '% ramp link: matched %', r.slug, n; END IF;
  END LOOP;

  UPDATE access_points SET river_mile_downstream = 33.4, river_mile_upstream = 74.5
   WHERE id = '0b33a1f8-65b9-4625-991e-b9c49e52160b' AND river_mile_downstream = 30.40 AND river_mile_upstream = 77.50;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'mineral-springs mile: matched %', n; END IF;
END $$;

-- Rollback (pins before this change):
--   mineral-springs                       POINT(-91.988 37.344), miles 30.40 / 77.50
--   ross-bridge                           POINT(-92.0499 37.6656)
--   blair-bridge-access                   POINT(-92.22961 36.65844)
--   blue-springs-creek-conservation-area  POINT(-91.15971627674537 38.120494447902416)
--   syenite-access                        POINT(-90.40947 37.68131)
--   mount-shira-access                    POINT(-94.46142 36.57653)
--   e.g. UPDATE access_points SET location_orig = ST_SetSRID(ST_MakePoint(-91.988, 37.344), 4326),
--          river_mile_downstream = 30.40, river_mile_upstream = 77.50 WHERE slug = 'mineral-springs';
--   and UPDATE agency_gis_features SET access_point_id = NULL
--        WHERE provider = 'mdc' AND source_type = 'Boat Ramps' AND source_object_id IN ('42','217','33','170','95','8');
