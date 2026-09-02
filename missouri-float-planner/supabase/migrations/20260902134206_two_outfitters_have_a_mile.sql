-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-02 13:42:06 UTC and
-- RECORDED as 20260902134206; authored as 20260902150000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt. Read back:
-- carr-s-canoe-rentals 35.09, two-rivers-canoe-rental 53.36.
--
-- Two riverside points of interest on the Current — Carr's Canoe Rentals
-- (112 m from the line) and Two Rivers Canoe Rental (72 m) — carry a snapped
-- location and no raw one: `location` is NULL and `location_snap` is set.
-- 20260902132921 required `location IS NOT NULL` alongside its
-- coalesce(location_snap, location), so its own predicate excluded the two
-- rows its expression could have measured. Read back after applying: both
-- still NULL, derived 35.09 and 53.36.
--
-- Same expression, same 500 m scope, the predicate the first migration should
-- have had: any location will do. Every other row on the river is already on
-- this ruler, so this is idempotent against them.

UPDATE public.points_of_interest p
   SET river_mile = round((st_linelocatepoint(r.geom, coalesce(p.location_snap, p.location::geometry)) * r.length_miles)::numeric, 2),
       updated_at = NOW()
  FROM public.rivers r
 WHERE p.river_id = r.id
   AND r.slug = 'current'
   AND r.geom IS NOT NULL
   AND coalesce(p.location_snap, p.location::geometry) IS NOT NULL
   AND p.snap_distance_m IS NOT NULL
   AND p.snap_distance_m <= 500
   AND p.river_mile IS NULL;

DO $$
DECLARE
  n_points int;
  missing text;
BEGIN
  SELECT count(*) INTO n_points
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.approved;
  IF n_points < 20 THEN
    RAISE NOTICE 'the current has % approved access points; treating this as an unpopulated database and skipping the invariant.', n_points;
    RETURN;
  END IF;

  -- No riverside POI on the Current is left without a mile.
  SELECT string_agg(p.slug, ', ') INTO missing
    FROM public.points_of_interest p JOIN public.rivers r ON r.id = p.river_id
   WHERE r.slug = 'current' AND p.snap_distance_m <= 500 AND p.river_mile IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'riverside points of interest on the current still carry no mile: %', missing;
  END IF;
END $$;
