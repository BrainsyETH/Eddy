-- War Eagle Creek is 68 miles long. Eddy has been quoting 33, and halving every
-- float on it.
--
-- `rivers.length_miles` read 33.17 against a stored line measuring 68.10. The
-- river_geometry check has filed that as `length_miles_disagrees_geometry` at
-- 51% off since 2026-08-06. It is not a cosmetic disagreement between two
-- measurements of the same creek — one of them is wrong by a factor of two, and
-- it is the one every derived number is built from.
--
-- ── Which one is wrong, three ways ───────────────────────────────────────
--
-- 1. SINUOSITY. Source-to-mouth crow flight is 32.14 mi. At length_miles 33.17
--    the creek would have a sinuosity of 1.03 — straighter, essentially, than
--    the line between its ends. Every other active river in the catalog runs
--    1.41 (Huzzah) to 3.01 (Bourbeuse). The stored line's own sinuosity is
--    2.12, which is unremarkable — the Big Piney is 2.00, the St. Francis 2.11.
--    A meandering Ozark creek does not have a sinuosity of 1.03.
--
-- 2. PUBLISHED FLOAT DISTANCES. Outfitters and guides quote the two reaches
--    with access points at both ends:
--
--      Hwy 412 bridge  -> Withrow Springs    published 4.5 mi
--      Withrow Springs -> Hwy 45 (Hindsville) published 12.7 mi
--
--    Measured along the stored line those are 4.50 and 12.53. Measured in the
--    stored river miles they are 2.20 and 6.10. The line agrees with the
--    outfitters to within a rounding error; the column is about half.
--
-- 3. THE MECHANISM. scripts/import-nhd-rivers-from-tnm.ts writes length_miles
--    only on the INSERT path; its UPDATE path replaces `geom` and touches
--    nothing else. War Eagle Creek's geometry was re-imported — its own header
--    records the FCode 46000 fix made for this creek specifically, "excluding it
--    splits the main stem and drops the lower half" — and the column kept the
--    value it was created with, from the era when rivers.geom was a ~30-vertex
--    near-straight placeholder. 33.17 is a measurement of a line that no longer
--    exists.
--
-- ── Why the access points could not arbitrate ────────────────────────────
--
-- All seven look perfectly self-consistent: their river miles reproduce
-- `pct_along_line * 33.17` to two decimals. That is not corroboration, it is
-- circularity — mile markers are ASSIGNED as
-- `length_miles * ST_LineLocatePoint(geom, point)` (00040_assign_rivers_to_pois,
-- and the POI compute-mile route), so they inherit whatever the column says and
-- can never disagree with it. They are downstream of the defect, which is why
-- they are recomputed here rather than trusted.
--
-- ── What this actually cost ─────────────────────────────────────────────
--
-- /api/plan derives trip distance from the river-mile delta of the two
-- endpoints (`segmentData.start_river_mile` / `end_river_mile`), and float time
-- from that distance. So every quoted distance and every float time on this
-- creek has been running at about 49% of reality: a party planning what Eddy
-- called a 10-mile day was being sent on 20. On a creek that is only floatable
-- March to mid-June, in a state whose float season ends in the dark.
--
-- ── Blast radius, checked rather than assumed ───────────────────────────
--
-- Only two tables carry this scale for War Eagle Creek. points_of_interest,
-- river_hazards, river_mile_markers, community_reports and float_segments have
-- ZERO rows for this river; river_sections has 4 rows and river_gauges 1, all
-- with NULL miles. So `rivers.length_miles` and the seven access points are the
-- whole of it, and both are recomputed from the geometry rather than typed.
UPDATE public.rivers
   SET length_miles = round((st_length(geom::geography) / 1609.34)::numeric, 2),
       updated_at = NOW()
 WHERE slug = 'war-eagle-creek'
   AND geom IS NOT NULL;

-- Recomputed from the line, in the same expression the mile-assignment path
-- uses, so these cannot drift from it. river_mile_upstream is the complement
-- and was on the same broken scale (down + up = 33.17 on every row).
UPDATE public.access_points ap
   SET river_mile_downstream = round((st_linelocatepoint(r.geom, ap.location_orig) * r.length_miles)::numeric, 2),
       river_mile_upstream   = round(((1 - st_linelocatepoint(r.geom, ap.location_orig)) * r.length_miles)::numeric, 2),
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'war-eagle-creek'
   AND r.geom IS NOT NULL
   AND ap.location_orig IS NOT NULL;

DO $$
DECLARE
  populated  boolean;
  len        numeric;
  geom_mi    numeric;
  n_points   integer;
  reach_412  numeric;
  reach_with numeric;
BEGIN
  -- `supabase db reset` applies migrations to an empty database and loads the
  -- seed afterwards. Nothing to assert about on a from-scratch build.
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT length_miles, round((st_length(geom::geography) / 1609.34)::numeric, 2)
    INTO len, geom_mi
    FROM public.rivers WHERE slug = 'war-eagle-creek';

  IF len IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION
        'war-eagle-creek not found (or has no length) in a database that already holds access points; the slug has drifted.';
    END IF;
    RAISE NOTICE 'ran against an empty database (a from-scratch build).';
    RETURN;
  END IF;

  IF geom_mi IS NULL THEN
    RAISE EXCEPTION 'war-eagle-creek has no geometry to measure against.';
  END IF;

  -- The finding this migration closes: the check fires above 10% drift.
  IF abs(len - geom_mi) / geom_mi > 0.01 THEN
    RAISE EXCEPTION
      'length_miles % still disagrees with the stored line (% mi).', len, geom_mi;
  END IF;

  IF len < 60 THEN
    RAISE EXCEPTION
      'length_miles came out %, which is the old halved scale. The geometry is not what this migration assumed.', len;
  END IF;

  SELECT count(*) INTO n_points
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'war-eagle-creek';

  IF n_points = 0 THEN
    RAISE NOTICE 'no access points on war-eagle-creek to recompute.';
    RETURN;
  END IF;

  -- Every row must land on the new scale, complement included.
  IF EXISTS (
    SELECT 1 FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
     WHERE r.slug = 'war-eagle-creek'
       AND ap.river_mile_downstream IS NOT NULL
       AND abs((ap.river_mile_downstream + ap.river_mile_upstream) - r.length_miles) > 0.02
  ) THEN
    RAISE EXCEPTION
      'an access point river_mile_downstream + river_mile_upstream no longer sums to length_miles.';
  END IF;

  -- Ground truth. These two reaches are quoted by outfitters at 4.5 and 12.7
  -- miles; before this migration the same pairs read 2.20 and 6.10. A tolerance
  -- of a mile covers the difference between a guide's round number and a traced
  -- channel without admitting the halved scale.
  -- Scoped to this river: `withrow-springs%` and `hwy-45-bridge%` are the kind
  -- of slug that exists on more than one creek, and a cross join over the whole
  -- table would compare two points that share no water. A missing reach is an
  -- ERROR rather than a skip, because these two comparisons are the only
  -- external evidence in this migration — silently passing when they cannot be
  -- computed would leave it asserting nothing but its own arithmetic.
  SELECT b.river_mile_downstream - a.river_mile_downstream INTO reach_412
    FROM public.access_points a
    JOIN public.rivers ra ON ra.id = a.river_id AND ra.slug = 'war-eagle-creek'
    JOIN public.access_points b ON b.river_id = a.river_id
   WHERE a.slug = 'hwy-412-bridge-access' AND b.slug LIKE 'withrow-springs%';

  SELECT b.river_mile_downstream - a.river_mile_downstream INTO reach_with
    FROM public.access_points a
    JOIN public.rivers ra ON ra.id = a.river_id AND ra.slug = 'war-eagle-creek'
    JOIN public.access_points b ON b.river_id = a.river_id
   WHERE a.slug LIKE 'withrow-springs%' AND b.slug LIKE 'hwy-45-bridge%';

  IF reach_412 IS NULL OR reach_with IS NULL THEN
    RAISE EXCEPTION
      'could not compute the published reaches on war-eagle-creek (412->Withrow %, Withrow->45 %). The access-point slugs have drifted, and with them the only outside check this migration has.',
      reach_412, reach_with;
  END IF;

  IF abs(reach_412 - 4.5) > 1.0 THEN
    RAISE EXCEPTION
      'Hwy 412 -> Withrow Springs computes % mi against a published 4.5.', reach_412;
  END IF;

  IF abs(reach_with - 12.7) > 1.0 THEN
    RAISE EXCEPTION
      'Withrow Springs -> Hwy 45 computes % mi against a published 12.7.', reach_with;
  END IF;

  RAISE NOTICE
    'war-eagle-creek: length_miles % mi from the line, % access points recomputed, published reaches check out (% and % mi).',
    len, n_points, reach_412, reach_with;
END $$;
