-- Eddy's North Fork stops 4.3 miles above its own last take-out. Extend it.
--
-- APPLIED to production (ilefwfpvphadsbptiaur) on 2026-11-17 as version
-- 20261117034210, the version the recording assigned, not the 20261117160000
-- this file was authored as. Renamed to match. The ledger is
-- supabase/production-migrations.txt. Read back after applying: one simple
-- LineString of 260 vertices and 62.74 mi, Tecumseh snapped at 90 m at mile
-- 64.05, the other seven access points unchanged, validate_river_data() clean.
--
-- ── What was wrong ──────────────────────────────────────────────────────
--
-- `tecumseh-norfork-lake-public-access` is the North Fork's final take-out: the
-- Corps of Engineers access at the US 160 bridge, where the river becomes
-- Norfork Lake. It was pinned at 36.62303, -92.24814, which is the USGS gauge
-- "North Fork River near Tecumseh" (07057500), not the ramp. Its own dossier
-- said so: "Coordinate is the USGS gauge; verify the exact ramp if a distinct
-- launch is needed." The gauge is 5.3 km from the access and UPSTREAM of the
-- Highway PP bridge, so the record also sat out of order at mile 58.58, above
-- PP (59.76) and Dawt Mill Dam, when the access is below both.
--
-- The owner located the access on imagery on 2026-11-17: 36.587855, -92.289537,
-- on the west bank just upstream of the US 160 bridge. PAD-US shows that ground
-- as USACE (Norfork Lake / Norfork Recreation Area).
--
-- ── Why this is a line change and not a pin move ────────────────────────
--
-- `rivers.geom` ended at the Highway PP bridge (-92.2624007, 36.6155084). The
-- real access is 3 913 m beyond that end. auto_snap_access_point() snaps only
-- within 1 500 m (00121), so moving the pin alone would leave an approved float
-- endpoint with no position on the river. That is the state 20260823200007 put
-- Montauk in on purpose, withheld from the pickers, until 20260825224950
-- extended the Current to reach it. This does both halves at once.
--
-- ── What is being appended ──────────────────────────────────────────────
--
-- The NHD high-resolution main stem from the line's last vertex to the point
-- on the channel nearest the access: nine connected flowlines, all named
-- "North Fork River" (artificial path through the lake's upper arm), retrieved
-- 2026-11-17 from hydro.nationalmap.gov nhd/MapServer/6 and simplified at the
-- import's own 0.0005 deg tolerance (scripts/import-nhd-rivers-from-tnm.ts):
--
--   length          4.35 mi over 17 new vertices (4.46 mi raw, 111 vertices)
--   crow flight     2.40 mi, sinuosity 1.86
--   upstream end    the existing line's last vertex (29 m from the NHD chain)
--   downstream end  90 m from the owner's pin (channel centreline to the bank)
--   result          one simple LineString, 243 -> 260 vertices, 58.38 -> 62.74 mi
--
-- ── Miles ───────────────────────────────────────────────────────────────
--
-- The North Fork's stored miles run 0.9 to 1.4 above its line miles and are
-- not recomputed here. Tecumseh's is set from its upstream neighbour: the
-- Highway PP bridge is mile 59.76 at line mile 58.45 on the extended line, and
-- the access is 4.29 line-miles below it, so 64.05. river_mile_upstream keeps
-- this river's convention (every row sums to 109.02): 44.97.
--
-- `length_miles` is updated because on this river it is measured, not quoted:
-- it read 58.38 against a line of exactly 58.38.
--
-- Nothing else moves. The other seven access points keep their pins, miles and
-- snaps: the append is beyond all of them, so each snaps to the same place.

UPDATE public.rivers r
   SET geom = ST_MakeLine(
         r.geom,
         ST_SetSRID(ST_GeomFromText('LINESTRING(-92.2637573 36.6157577,-92.2649776 36.6144311,-92.2656704 36.6121275,-92.2652550 36.6087715,-92.2665216 36.6072647,-92.2698687 36.6080425,-92.2747400 36.6132287,-92.2777065 36.6116963,-92.2795956 36.6057579,-92.2729870 36.5950803,-92.2738457 36.5941119,-92.2805678 36.5925661,-92.2882734 36.5958937,-92.2896298 36.5942791,-92.2894234 36.5924029,-92.2881392 36.5910249,-92.2885261 36.5878490)'), 4326)
       ),
       updated_at = NOW()
 WHERE r.slug = 'north-fork-white'
   AND r.geom IS NOT NULL
   AND GeometryType(r.geom) = 'LINESTRING'
   -- Idempotence and guard: only while the line still ends at the PP bridge.
   AND ST_Distance(
         ST_EndPoint(r.geom)::geography,
         ST_SetSRID(ST_MakePoint(-92.2624007, 36.6155084), 4326)::geography
       ) < 5;

UPDATE public.rivers
   SET length_miles = round((ST_Length(geom::geography) / 1609.34)::numeric, 2),
       updated_at = NOW()
 WHERE slug = 'north-fork-white' AND geom IS NOT NULL;

-- Move the pin from the gauge to the access. Writing location_orig fires
-- access_points_auto_snap, which now finds the extended line 90 m away. Only
-- while the pin is still at the gauge, so a re-run or a later correction made
-- by hand is left alone.
UPDATE public.access_points ap
   SET location_orig = ST_SetSRID(ST_MakePoint(-92.289537, 36.587855), 4326),
       river_mile_downstream = 64.05,
       river_mile_upstream = 44.97,
       ownership = 'USACE',
       managing_agency = 'COE',
       facilities = 'Corps of Engineers access at the US 160 bridge, where the North Fork becomes Norfork Lake. The last stretch of the float is slack lake water.',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'north-fork-white'
   AND ap.slug = 'tecumseh-norfork-lake-public-access'
   AND ST_DWithin(ap.location_orig, ST_SetSRID(ST_MakePoint(-92.24814, 36.62303), 4326), 0.00001);

DO $$
DECLARE
  populated  boolean;
  g          record;
  t          record;
  pp_mile    numeric;
  unsnapped  integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT id,
         GeometryType(geom) AS gtype,
         ST_IsSimple(geom)  AS simple,
         ST_NPoints(geom)   AS npts,
         length_miles,
         round((ST_Length(geom::geography) / 1609.34)::numeric, 2) AS line_mi,
         round((ST_Distance(ST_EndPoint(geom)::geography,
                ST_SetSRID(ST_MakePoint(-92.289537, 36.587855), 4326)::geography))::numeric, 0) AS end_to_access_m
    INTO g
    FROM public.rivers WHERE slug = 'north-fork-white';

  IF g IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION 'the north fork is missing from a populated database.';
    END IF;
    RAISE NOTICE 'ran against an empty database (a from-scratch build).';
    RETURN;
  END IF;

  IF g.gtype <> 'LINESTRING' THEN
    RAISE EXCEPTION 'the North Fork came out as %, not a LINESTRING.', g.gtype;
  END IF;

  IF NOT g.simple THEN
    RAISE EXCEPTION 'the extended North Fork self-intersects; the appended chain is not the main stem.';
  END IF;

  IF g.end_to_access_m > 200 THEN
    RAISE EXCEPTION
      'the line still ends % m from the Tecumseh access. Reaching it is the whole point of this migration.', g.end_to_access_m;
  END IF;

  IF abs(g.length_miles - g.line_mi) > 0.01 THEN
    RAISE EXCEPTION 'length_miles % does not match the measured line %.', g.length_miles, g.line_mi;
  END IF;

  SELECT ap.location_snap IS NOT NULL AS snapped,
         ap.snap_distance_m,
         ap.river_mile_downstream AS mile,
         ap.is_float_endpoint,
         ap.approved
    INTO t
    FROM public.access_points ap
   WHERE ap.river_id = g.id AND ap.slug = 'tecumseh-norfork-lake-public-access';

  IF t IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION 'tecumseh-norfork-lake-public-access not found on the north fork; the slug has drifted.';
    END IF;
    RETURN;
  END IF;

  IF NOT t.snapped OR t.snap_distance_m > 200 THEN
    RAISE EXCEPTION
      'Tecumseh is not on the line (snapped %, % m). The pin did not move, or the line did not reach it.',
      t.snapped, t.snap_distance_m;
  END IF;

  SELECT river_mile_downstream INTO pp_mile
    FROM public.access_points
   WHERE river_id = g.id AND slug = 'highway-pp-bridge-north-fork-high-bridge';

  IF pp_mile IS NOT NULL AND t.mile <= pp_mile THEN
    RAISE EXCEPTION
      'Tecumseh is at mile %, not below the Highway PP bridge (%). It is the last take-out.', t.mile, pp_mile;
  END IF;

  IF NOT t.approved OR NOT t.is_float_endpoint THEN
    RAISE EXCEPTION 'Tecumseh lost its approval or its endpoint flag; neither was this migration''s to change.';
  END IF;

  -- The append is beyond every other point, so none may have lost its snap.
  SELECT count(*) INTO unsnapped
    FROM public.access_points ap
   WHERE ap.river_id = g.id AND ap.approved AND ap.location_snap IS NULL;

  IF unsnapped > 0 THEN
    RAISE EXCEPTION '% approved North Fork access point(s) have no snap after the extension.', unsnapped;
  END IF;

  RAISE NOTICE
    'the North Fork now reaches Tecumseh: % mi over % vertices, the access snapped at % m, mile %.',
    g.line_mi, g.npts, t.snap_distance_m, t.mile;
END $$;
