-- 20260805190000_length_miles_from_geometry_jacks_fork_current.sql
--
-- APPLIED to production as version 20260805190000 (the filename matches the
-- recording). Ledger: supabase/production-migrations.txt.
--
-- Correct rivers.length_miles on jacks-fork and current, where the column has
-- drifted from the line it is supposed to describe.
--
-- ── Where the drift comes from ──────────────────────────────────────────────
--
-- scripts/import-nhd-rivers-from-tnm.ts writes length_miles only on its INSERT
-- path. Its UPDATE path sets geom and direction_verified and touches nothing
-- else, so re-importing a river's geometry leaves the mileage from whenever the
-- row was first created. Nothing surfaced that until the coordinate density
-- metric was fixed to measure the line rather than the column, at which point
-- the drift became a finding of its own instead of a distortion inside another
-- number. Audit F5 knew — 00142_get_float_segment_snap_fractions.sql names it in
-- its header and routes the drawn polyline around it — but routing around a
-- wrong number is not the same as fixing it, and the mileage path still reads it.
--
-- ── Why the geometry is the correct half here ───────────────────────────────
--
-- Not assumed. Mile markers are assigned as
-- `length_miles * ST_LineLocatePoint(geom, point)` (00040_assign_rivers_to_pois),
-- so comparing stored miles against the column is circular. The hand-entered
-- guide miles are not: 00142's header records that segment distance comes from
-- "hand-entered miles", and those are an external reference the import never
-- touched. Locating each access point on the line and scaling by each candidate
-- length asks which candidate reproduces the guide.
--
-- jacks-fork — eleven access points, guide mile vs the two candidates:
--
--   access point           guide    x geom (44.84)   x column (54.70)
--   Buck Hollow             6.80      7.01             8.55
--   Rymers Access          16.20     16.25            19.83
--   Bay Creek              25.20     26.74            32.62
--   Alley Spring           31.00     30.76            37.52
--   Eminence City Access   37.30     37.33            45.54
--   Shawnee Creek          41.90     42.41            51.73
--   Two Rivers             44.30     44.84            54.70
--
-- The line reproduces the guide within about half a mile over forty-four. The
-- column puts Two Rivers ten miles past where every guide to this river puts it.
--
-- current — same test, same answer:
--
--   access point           guide    x geom (171.58)  x column (134.20)
--   Akers Ferry            16.70     14.79            11.57
--   Round Spring           35.20     33.04            25.84
--   Two Rivers             52.50     51.12            39.99
--   Powder Mill            58.70     58.34            45.63
--   Van Buren Riverfront   85.90     84.17            65.84
--   Big Tree               94.00     94.73            74.09
--   Float Camp            120.30    118.27            92.50
--
-- The line tracks the guide within a couple of miles over a hundred and twenty;
-- the column is short by more than a quarter.
--
-- ── Deliberately NOT in this migration ──────────────────────────────────────
--
-- war-eagle-creek stores 33.17 against a 68.10-mile line, and it is the one case
-- where the LINE is the suspect rather than the column. Its stored miles are
-- exactly `fraction x 33.17`, i.e. generated from the column by 00040, so they
-- are circular and cannot arbitrate. What can: roughly a fifth of the line lies
-- downstream of War Eagle Mill, which sits essentially at the mouth on the
-- Beaver Lake backwater. The import walks connected NHD reaches and keeps the
-- longest component, and this script's own header flags War Eagle as the river
-- needing FCode 46000 to avoid splitting its main stem — the fiddliest assembly
-- in the catalog and the likeliest to have swallowed a tributary or the lake
-- arm. Writing 68.10 into that column would bake an over-captured line into
-- every mile marker on the creek. It needs someone to look at the map.
--
-- current also stops short of Montauk State Park: the park is 2,236 m off the
-- line and lands at fraction 0.0000, so the geometry begins below the actual
-- put-in. That is the access_point_not_snapped finding on this river, it is a
-- real defect, and it is a geometry repair rather than a mileage one. This
-- migration fixes the scale of the line that exists; it does not extend it.
--
-- ── Consequences ────────────────────────────────────────────────────────────
--
-- Every existing river_mile_downstream on these two rivers was computed against
-- the old column and is now inconsistent with it. Run `npm run db:correct-miles`
-- for both slugs after applying. Until that runs, the stored miles are exactly
-- as wrong as they were before — this changes the scale, not the markers.

-- ── The fix ─────────────────────────────────────────────────────────────────
-- jacks-fork: 54.70 -> 44.84   (line measured with ST_Length(geom::geography))
-- current:   134.20 -> 171.58
UPDATE rivers
SET length_miles = ROUND((ST_Length(geom::geography) / 1609.344)::numeric, 2)
WHERE slug IN ('jacks-fork', 'current')
  AND geom IS NOT NULL;

-- ── Assertions ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  drift numeric;
BEGIN
  FOR r IN
    SELECT slug, length_miles, ST_Length(geom::geography) / 1609.344 AS measured
    FROM rivers WHERE slug IN ('jacks-fork', 'current')
  LOOP
    IF r.length_miles IS NULL THEN
      RAISE EXCEPTION '% has no length_miles after the update', r.slug;
    END IF;

    drift := abs(r.length_miles - r.measured) / r.measured;
    IF drift > 0.001 THEN
      RAISE EXCEPTION '% still disagrees with its line: % vs %', r.slug, r.length_miles, r.measured;
    END IF;
  END LOOP;

  -- The two named rivers, and only those. A WHERE clause that matched more than
  -- it should would rewrite mileage across the catalog, and war-eagle-creek is
  -- specifically the row that must not be touched.
  SELECT count(*) INTO drift FROM rivers
   WHERE slug = 'war-eagle-creek' AND length_miles = 33.17;
  IF drift <> 1 THEN
    RAISE EXCEPTION 'war-eagle-creek length_miles moved; it was deliberately left alone';
  END IF;
END $$;
