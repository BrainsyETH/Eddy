-- Eddy's Current River begins 2.4 miles below its own first put-in. Extend it.
--
-- APPLIED to production 2026-08-25 as 20260825224950.
--
-- 20260823200007 withheld Montauk State Park from the put-in and take-out
-- pickers and said exactly what would unblock it: "extending the line upstream
-- to the park is an NHD import, and it is what unblocks this row." This is that
-- import.
--
-- ── Why the line stopped at Tan Vat, which was nobody's mistake ──────────
--
-- scripts/import-nhd-rivers-from-tnm.ts keeps flowlines whose `gnis_name` is
-- "Current River". Checked against the HUC8 (11010008) itself: NHD does not
-- apply that name above Tan Vat. Within three miles of Montauk the named
-- reaches are 79 unnamed segments and 19 of "Pigeon Creek"; the closest
-- flowline actually called "Current River" is 1.39 miles downstream of the
-- park, which is precisely where Eddy's line started.
--
-- So the importer was right and the filter was right. NHD's naming simply does
-- not match how the river is floated: the Current rises at Montauk Spring, the
-- park is its first put-in, and the reach between them carries a tributary's
-- name in the national dataset. That is a naming convention, not a different
-- river, and Eddy's `geom` answers "where can you float", not "what does GNIS
-- call this".
--
-- ── What is being prepended ─────────────────────────────────────────────
--
-- The connected chain of perennial/artificial-path flowlines from the park down
-- to the first named Current River vertex — seven NHD segments, simplified at
-- the import's own 0.0005 deg tolerance to 12 vertices:
--
--   length              2.40 mi   (2.475 mi raw, before simplification)
--   crow flight         1.30 mi   sinuosity 1.91 (the Current's own is 1.86)
--   upstream end        0.025 mi (132 ft) from Montauk's pin
--   downstream end      coincident with the existing line's first vertex
--   doubling back       none — every vertex moves away from Montauk
--
-- The join is exact, so the shared vertex is dropped rather than duplicated and
-- the result is a single simple LineString, not a MultiLineString.
--
-- ── It fixes more than Montauk ──────────────────────────────────────────
--
-- 20260823200007 noted the quoted-vs-drawn gap on the upper Current and
-- explicitly did not address it: "a Tan Vat -> Cedargrove float quotes 8.10 mi
-- and draws 7.19. That is pre-existing and not addressed here."
--
-- It was the same missing 2.4 miles. Recorded miles were always measured from
-- the true headwaters at Montauk; the LINE was the thing that started late, so
-- every drawn distance ran short by roughly the length of the gap:
--
--   point            quoted    drawn before    drawn after
--   Montauk            0.10     0.00 (clamped)     0.02
--   Cedargrove         9.00     7.19               9.59
--   Akers Ferry       16.70    14.79              17.19
--   Pulltite Spring   26.30    23.84              26.23
--   Sinking Creek     33.80    31.45              33.84
--
-- Mean disagreement across the eight upstream access points falls from 1.73 mi
-- to 0.68, and the lower river now agrees to within a tenth of a mile.
--
-- ── What is deliberately NOT done ───────────────────────────────────────
--
-- The access-point miles are not recomputed. On this river they are editorial:
-- ZERO of 38 rows satisfy `river_mile_downstream + river_mile_upstream =
-- length_miles`, so unlike War Eagle Creek (where all seven summed exactly and
-- were therefore derived) these are published guide miles that somebody chose.
-- Replacing 38 of them with measured values is an editorial decision about
-- whose mileage Eddy quotes, and it is not this migration's to make.
--
-- Two rows do look wrong against the extended line and are left for that
-- decision: Tan Vat quotes 0.90 and now draws 2.40, Baptist Camp quotes 2.10
-- and draws 3.58. Both quoted values are too small to be possible — Montauk to
-- Tan Vat is 1.30 miles as the crow flies, so 0.80 recorded miles cannot span
-- it whatever route the channel takes.
--
-- `length_miles` IS updated, because on this river it was measured rather than
-- quoted: it read 171.58 against a line of exactly 171.58. Keeping that
-- property is what makes the next snap correct, since snap_to_river() multiplies
-- by it.
UPDATE public.rivers r
   SET geom = ST_MakeLine(
         -- Drop the chain's final vertex: it IS the existing line's first one,
         -- and ST_MakeLine concatenates rather than merges.
         ST_RemovePoint(
           ST_SetSRID(ST_GeomFromText('LINESTRING(-91.68695950145718 37.450818608535485,-91.68674590145753 37.449318675204495,-91.6818847014651 37.450419675202795,-91.67967696813514 37.45253120853283,-91.67913030146934 37.45468820852949,-91.67598570147425 37.45605907519399,-91.67268096814604 37.45496740852906,-91.67153476814781 37.45265620853263,-91.67132430148149 37.447300075207636,-91.66888310148528 37.44535280854399,-91.6663905681558 37.44629807520914,-91.66139990149685 37.450405675202774)'), 4326),
           11
         ),
         r.geom
       ),
       updated_at = NOW()
 WHERE r.slug = 'current'
   AND r.geom IS NOT NULL
   -- Idempotence: only if the line does not already reach the park.
   AND ST_Distance(
         ST_StartPoint(r.geom)::geography,
         ST_SetSRID(ST_MakePoint(-91.6866657, 37.4505347), 4326)::geography
       ) > 500;

UPDATE public.rivers
   SET length_miles = round((ST_Length(geom::geography) / 1609.34)::numeric, 2),
       updated_at = NOW()
 WHERE slug = 'current' AND geom IS NOT NULL;

-- Re-snap only what the extension made snappable. Touching location_orig is
-- what fires access_points_auto_snap (BEFORE UPDATE OF location_orig,
-- river_id), which is the canonical path — it recomputes location_snap,
-- snap_distance_m and the mile columns through snap_to_river() rather than
-- duplicating that logic here. Scoped to rows that are currently UNSNAPPED and
-- are now within the trigger's own 1500 m ceiling, so no correctly-snapped row
-- is disturbed and no editorial mile is overwritten wholesale.
UPDATE public.access_points ap
   SET location_orig = ap.location_orig
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.location_snap IS NULL
   AND ap.location_orig IS NOT NULL
   AND ST_Distance(ap.location_orig::geography, r.geom::geography) <= 1500;

-- Montauk can be chosen now. 20260823200007 set this FALSE and kept the access
-- role precisely so float-endpoint-eligibility.ts would keep reporting it until
-- this moment; the finding was the reminder, and this is the answer to it.
UPDATE public.access_points ap
   SET is_float_endpoint = TRUE,
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'montauk-state-park'
   AND ap.location_snap IS NOT NULL;

DO $$
DECLARE
  populated  boolean;
  g          record;
  m          record;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT GeometryType(geom) AS gtype,
         ST_IsSimple(geom)  AS simple,
         ST_NPoints(geom)   AS npts,
         length_miles,
         round((ST_Length(geom::geography) / 1609.34)::numeric, 2) AS line_mi,
         round((ST_Distance(ST_StartPoint(geom)::geography,
                ST_SetSRID(ST_MakePoint(-91.6866657, 37.4505347), 4326)::geography))::numeric, 0) AS start_to_montauk_m
    INTO g
    FROM public.rivers WHERE slug = 'current';

  IF g IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION 'the current river is missing from a populated database.';
    END IF;
    RAISE NOTICE 'ran against an empty database (a from-scratch build).';
    RETURN;
  END IF;

  IF g.gtype <> 'LINESTRING' THEN
    RAISE EXCEPTION
      'the Current came out as %, not a LINESTRING. The prepend did not join — check the shared vertex.', g.gtype;
  END IF;

  IF NOT g.simple THEN
    RAISE EXCEPTION 'the extended Current self-intersects; the prepended chain is not the main stem.';
  END IF;

  IF g.start_to_montauk_m > 500 THEN
    RAISE EXCEPTION
      'the line still starts % m from Montauk. The whole point of this migration is that it should not.', g.start_to_montauk_m;
  END IF;

  IF abs(g.length_miles - g.line_mi) > 0.01 THEN
    RAISE EXCEPTION
      'length_miles % does not match the measured line %.', g.length_miles, g.line_mi;
  END IF;

  SELECT ap.location_snap IS NOT NULL AS snapped,
         ap.snap_distance_m,
         ap.is_float_endpoint,
         ap.approved,
         ap.types @> ARRAY['access']::text[] AS has_access_role
    INTO m
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.slug = 'montauk-state-park';

  IF m IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION 'montauk-state-park not found on the current; the slug has drifted.';
    END IF;
    RETURN;
  END IF;

  IF NOT m.snapped THEN
    RAISE EXCEPTION
      'montauk still has no location_snap (snap_distance_m %). It sat at 2236 m; the extended line should put it inside the trigger''s 1500 m ceiling.',
      m.snap_distance_m;
  END IF;

  IF m.snap_distance_m > 500 THEN
    RAISE EXCEPTION
      'montauk snapped, but % m away. That is too far to be the park itself.', m.snap_distance_m;
  END IF;

  IF NOT m.is_float_endpoint THEN
    RAISE EXCEPTION 'montauk is still not a float endpoint; the picker is still missing the first put-in.';
  END IF;

  IF NOT m.approved OR NOT m.has_access_role THEN
    RAISE EXCEPTION 'montauk lost its approval or its access role; neither was this migration''s to change.';
  END IF;

  RAISE NOTICE
    'the Current now starts at Montauk: % mi over % vertices, montauk snapped at % m and selectable.',
    g.line_mi, g.npts, m.snap_distance_m;
END $$;
