-- APPLIED to production (ilefwfpvphadsbptiaur) as version 20260826210200, the
-- version the recording assigned, not the 20260826190000 this file was authored as.
-- Renamed 2026-09-02 to match. The ledger is supabase/production-migrations.txt.
--
-- Van Buren City Access is at mile 85.9, not mile 0.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────────────
--
-- `van-buren` is an APPROVED FLOAT ENDPOINT with river_mile_downstream NULL.
-- It is the only such row in the table — every other approved access point on
-- every river carries a mile.
--
-- It has been NULL since the row was created, because the row comes from
-- supabase/seed/access_points.sql, and that INSERT lists eleven columns and
-- river_mile_downstream is not one of them. Nothing has filled it since: the
-- seed's ON CONFLICT clause sets only `approved`, and the
-- `access_points_auto_snap` trigger computes location_snap and
-- snap_distance_m, never the mile.
--
-- ── WHY NULL BECAME 0, AND WHY THAT IS NOT THE BUG ───────────────────────
--
-- toAccessPoint in src/lib/offline/shapes.ts maps the column with
--
--     riverMile: row.river_mile_downstream != null ? parseFloat(...) : 0
--
-- and that default is deliberate. `riverMile: number` is not nullable on the
-- wire, and the mapper is shared by the per-river routes and the offline
-- bundle precisely so the two cannot disagree about a missing value — see that
-- file's header. Making it nullable would change the wire contract and the iOS
-- app to describe one bad row. The defect is the row.
--
-- ── WHAT THE 0 DID ───────────────────────────────────────────────────────
--
-- Mile 0 is the headwaters, so a point that is really 85.9 miles downstream
-- sorted to the top of the river and compared as upstream of everything:
--
--   * detail.ts splits neighbours on `entry.mile < currentMile` and
--     `> currentMile`. At currentMile = 0 the upstream list is empty and the
--     downstream list is every other access on the Current.
--   * getGaugeStatus(river, currentMile) picks the gauge nearest the mile, so
--     the sheet reached for a headwaters gauge ~86 miles from the reader.
--   * PlanPageClient orders put-in and take-out by riverMile, so Van Buren
--     ordered ahead of Montauk.
--
-- ── THE VALUE, CORROBORATED THREE WAYS ───────────────────────────────────
--
-- Two other rows sit at this same place in town and both already read 85.90.
-- Projected onto Eddy's Current geometry as a line fraction, `van-buren` falls
-- BETWEEN them:
--
--   van-buren-city-access       0.49744   85.90
--   van-buren                   0.49748   (this row)
--   van-buren-riverfront-park   0.49760   85.90
--
-- Independently, interpolating from the nearest rows with miles either side —
-- Waymeyer (77.70 at 0.45583) and Big Spring (90.20 at 0.51702) — puts it at
-- 86.2. 85.90 is taken rather than 86.2 because the two rows AT THIS LANDING
-- already say 85.90, and three records of one place disagreeing by a third of
-- a mile would be a new defect in place of the old one.
--
-- river_mile_upstream is deliberately left NULL. Nothing in the web app or the
-- iOS app reads that column, and the two sibling rows disagree about it
-- (64.70 and 49.30) for the same landing — so there is no value to copy that
-- would mean anything. Inventing one to fill a blank is how the 85.9/86.2
-- problem above gets created on purpose.

BEGIN;

UPDATE public.access_points ap
   SET river_mile_downstream = 85.90,
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'van-buren'
   AND ap.river_mile_downstream IS NULL;

DO $$
DECLARE
  populated boolean;
  mile      numeric;
  sibling   numeric;
  orphans   integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
  IF NOT populated THEN
    RAISE NOTICE 'empty access_points (from-scratch build); nothing to assert.';
    RETURN;
  END IF;

  SELECT ap.river_mile_downstream INTO mile
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id AND r.slug = 'current'
   WHERE ap.slug = 'van-buren';

  IF mile IS NULL THEN
    RAISE EXCEPTION
      'van-buren still has no river mile. It is an approved float endpoint, so the planner would place it at mile 0 and read every other access on the Current as downstream of it.';
  END IF;

  -- The landing is ~86 miles down. A value near 0 is the original defect
  -- returning; a wild one is a different mistake.
  IF mile < 80 OR mile > 92 THEN
    RAISE EXCEPTION
      'van-buren is at mile %, which is not the Van Buren landing (~85.9, between Waymeyer at 77.7 and Big Spring at 90.2).', mile;
  END IF;

  -- The strongest available check: the row 120 m away on the same bank.
  SELECT ap.river_mile_downstream INTO sibling
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id AND r.slug = 'current'
   WHERE ap.slug = 'van-buren-riverfront-park';

  IF sibling IS NOT NULL AND abs(mile - sibling) > 0.5 THEN
    RAISE EXCEPTION
      'van-buren reads mile % but van-buren-riverfront-park, the same landing 120 m away, reads %. One of them is wrong.',
      mile, sibling;
  END IF;

  -- The invariant the whole defect violated, across every river: a point the
  -- planner will OFFER must know where it is. src/lib/trust/checks/
  -- float-endpoint-eligibility.ts reports this daily; this is the same rule
  -- asserted once, here, so the migration cannot leave the table in the state
  -- it exists to repair.
  SELECT count(*) INTO orphans
    FROM public.access_points ap
   WHERE ap.approved = TRUE
     AND ap.is_float_endpoint = TRUE
     AND ap.river_mile_downstream IS NULL;

  IF orphans > 0 THEN
    RAISE EXCEPTION
      '% approved float endpoint(s) still have no river mile. Each one is placed at the headwaters by toAccessPoint''s null default and mis-sorts its whole river.', orphans;
  END IF;

  RAISE NOTICE
    'van-buren: mile % (sibling reads %); no approved float endpoint is missing a river mile.',
    mile, sibling;
END $$;

COMMIT;
