-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-02 13:29:21 UTC and
-- RECORDED as 20260902132921; authored as 20260902143000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt. Every
-- invariant at the foot passed against the live rows: Montauk → Tan Vat
-- 2.38, Big Spring 4.3 below Van Buren, the Akers gauge on the Akers ferry.
--
-- ONE MISS, fixed by 20260902134206: the POI update below also requires
-- `p.location IS NOT NULL`, and two riverside outfitters carry only a snapped
-- location, so the coalesce that could have measured them never ran. The
-- predicate should have been on the coalesce. Left as applied.
--
-- The Current's river miles, recomputed from the line that now starts at
-- Montauk.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────────────
--
-- 20260825224950 extended the Current's geometry 2.4 miles upstream to Montauk
-- and freed Montauk State Park as a put-in. It left every river mile alone,
-- on the reasoning that access-point miles are editorial. They are: they are a
-- guide's miles, hand-maintained, and Montauk's own 0.10 predates the
-- extension (20260823192151). But a guide's mile 0 was near the OLD line's
-- start, so the moment Montauk became a put-in the first reach on the river
-- read 0.8 miles (Tan Vat 0.90 − Montauk 0.10) against 2.38 by the line. A
-- float plan for Montauk → Tan Vat computed at a third of its length.
--
-- Read against production on 2026-09-02, geometry mile minus stored mile,
-- every approved access point within 500 m of the line:
--
--   Montauk State Park   0.10 →  0.02   Tan Vat        0.90 →  2.40
--   Baptist Camp         2.10 →  3.58   Cedargrove     9.00 →  9.59
--   Akers Ferry         16.70 → 17.19   Powder Mill   58.70 → 60.73
--   Van Buren           85.90 → 86.55   Big Tree      94.00 → 97.12
--   Clubhouse           94.50 → 97.43   (33 points; median +0.6, max +3.1)
--
-- The geometry's numbers sit closer to the NPS mileposts than the stored ones
-- (Akers is quoted at 17; Big Spring at 4 miles below Van Buren), and the
-- stored ones are not consistent with each other either: Big Tree and
-- Clubhouse are 0.5 apart stored and 0.3 apart by the line, Powder Mill and
-- Roberts Field 5.1 apart stored and 3.9 by the line. A guide's scale that
-- disagrees with itself by two miles was never a ruler.
--
-- Two other tables carry a Current mile, and theirs were worse:
--
--   river_gauges.river_mile — hand-typed integers. Van Buren 100 (line: 86.6),
--     Doniphan 134 (line: 125.1), Montauk 0 (line: 1.6), Powder Mill null.
--   points_of_interest.river_mile — assigned by 00040 from an earlier, shorter
--     line. Big Spring 69.2 (line: 90.9), Blue Spring 46.5 (line: 61.8), The
--     Junction 40.2 (line: 53.8); four riverside POIs carried no mile at all.
--
-- ── WHAT THIS DOES ────────────────────────────────────────────────────────
--
-- One ruler: the line, from Montauk. Every row on the Current that sits
-- within 500 m of it — access points, gauges, POIs — gets
-- length_miles × ST_LineLocatePoint, the expression 00040 and the War Eagle
-- migration (20260825224732) both use, so nothing here can drift from them.
-- Rows farther than 500 m from the line (a lake campground 14 km off, a
-- ranger station 6 km off, three unapproved access points 1–16 km off) are a
-- projection onto water they are not on, and are left exactly as they were.
--
-- 500 m, not the trigger's 1500 m ceiling: every approved access point on the
-- river is within 163 m, every gauge within 84 m, and the one riverside POI
-- past 200 m (Round Spring, 472 m, on its spring branch) is the case the wider
-- figure is for. Nothing between 500 and 1500 m is on the river.
--
-- This is the ONE river where the stored scale was already the line's scale to
-- within a mile. The Niangua, Bourbeuse, Meramec, St. Francis, Buffalo and
-- Black carry guide scales offset 8–30 miles from their lines, uniformly, and
-- are NOT touched: float time subtracts, so they are internally consistent,
-- and moving them is a decision about which published numbers the product
-- speaks. See docs/RECENT_BRANCHES_FIX_PLAN_2026-09-01.md §6.1.
--
-- Idempotent: recomputing from the line twice gives the same numbers.

-- ── Access points ─────────────────────────────────────────────────────────
UPDATE public.access_points ap
   SET river_mile_downstream = round((st_linelocatepoint(r.geom, coalesce(ap.location_snap, ap.location_orig)) * r.length_miles)::numeric, 2),
       river_mile_upstream   = round(((1 - st_linelocatepoint(r.geom, coalesce(ap.location_snap, ap.location_orig))) * r.length_miles)::numeric, 2),
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND r.geom IS NOT NULL
   AND ap.location_orig IS NOT NULL
   AND ap.snap_distance_m IS NOT NULL
   AND ap.snap_distance_m <= 500;

-- ── Gauges ────────────────────────────────────────────────────────────────
UPDATE public.river_gauges rg
   SET river_mile = round((st_linelocatepoint(r.geom, gs.location) * r.length_miles)::numeric, 2),
       updated_at = NOW()
  FROM public.rivers r, public.gauge_stations gs
 WHERE rg.river_id = r.id
   AND gs.id = rg.gauge_station_id
   AND r.slug = 'current'
   AND r.geom IS NOT NULL
   AND gs.location IS NOT NULL
   AND st_distance(r.geom::geography, gs.location::geography) <= 500;

-- ── Points of interest ────────────────────────────────────────────────────
UPDATE public.points_of_interest p
   SET river_mile = round((st_linelocatepoint(r.geom, coalesce(p.location_snap, p.location::geometry)) * r.length_miles)::numeric, 2),
       updated_at = NOW()
  FROM public.rivers r
 WHERE p.river_id = r.id
   AND r.slug = 'current'
   AND r.geom IS NOT NULL
   AND p.location IS NOT NULL
   AND p.snap_distance_m IS NOT NULL
   AND p.snap_distance_m <= 500;

-- ── Invariants ────────────────────────────────────────────────────────────
DO $$
DECLARE
  populated boolean;
  n_points int;
  first_reach numeric;
  big_spring_below_van_buren numeric;
  akers_gauge_vs_ferry numeric;
BEGIN
  -- A fresh `supabase db reset` seeds the Current with placeholder geometry
  -- and no Montauk row; there is nothing to assert against. A populated
  -- database has dozens of points on this river.
  SELECT count(*) INTO n_points
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.approved;
  populated := n_points >= 20;
  IF NOT populated THEN
    RAISE NOTICE 'the current has % approved access points; treating this as an unpopulated database and skipping the invariants.', n_points;
    RETURN;
  END IF;

  -- Every recomputed row lands on the new scale, complement included.
  IF EXISTS (
    SELECT 1 FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
     WHERE r.slug = 'current'
       AND ap.snap_distance_m <= 500
       AND (ap.river_mile_downstream IS NULL
            OR abs((ap.river_mile_downstream + ap.river_mile_upstream) - r.length_miles) > 0.02)
  ) THEN
    RAISE EXCEPTION 'a Current access point within 500 m of the line has no mile, or its miles do not sum to length_miles.';
  END IF;

  -- The reach this migration exists for. 2.38 by the line; a tenth of a mile
  -- of tolerance covers rounding, not the 0.8 it read before.
  SELECT b.river_mile_downstream - a.river_mile_downstream INTO first_reach
    FROM public.access_points a
    JOIN public.rivers r ON r.id = a.river_id AND r.slug = 'current'
    JOIN public.access_points b ON b.river_id = a.river_id
   WHERE a.slug = 'montauk-state-park' AND b.slug = 'tan-vat';
  IF first_reach IS NULL THEN
    RAISE EXCEPTION 'could not find montauk-state-park and tan-vat on the current; the slugs have drifted.';
  END IF;
  IF abs(first_reach - 2.38) > 0.15 THEN
    RAISE EXCEPTION 'Montauk -> Tan Vat came out % miles; expected 2.38 from the line.', first_reach;
  END IF;

  -- Outside evidence: the NPS quotes Big Spring at four river miles below
  -- Van Buren. The stored POI mile had it 17 miles ABOVE.
  SELECT p.river_mile - ap.river_mile_downstream INTO big_spring_below_van_buren
    FROM public.points_of_interest p
    JOIN public.rivers r ON r.id = p.river_id AND r.slug = 'current'
    JOIN public.access_points ap ON ap.river_id = r.id AND ap.slug = 'van-buren'
   WHERE p.slug = 'big-spring';
  IF big_spring_below_van_buren IS NULL THEN
    RAISE EXCEPTION 'could not find big-spring and van-buren on the current; the slugs have drifted.';
  END IF;
  IF big_spring_below_van_buren < 3.0 OR big_spring_below_van_buren > 5.5 THEN
    RAISE EXCEPTION 'Big Spring came out % miles below Van Buren; the NPS says about four.', big_spring_below_van_buren;
  END IF;

  -- The Akers gauge is at the Akers ferry. Both now measured on the same line,
  -- they must agree to within a bend.
  SELECT abs(rg.river_mile - ap.river_mile_downstream) INTO akers_gauge_vs_ferry
    FROM public.river_gauges rg
    JOIN public.gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN public.rivers r ON r.id = rg.river_id AND r.slug = 'current'
    JOIN public.access_points ap ON ap.river_id = r.id AND ap.slug = 'akers-ferry'
   WHERE gs.name ILIKE 'Current River above Akers%';
  IF akers_gauge_vs_ferry IS NULL OR akers_gauge_vs_ferry > 0.5 THEN
    RAISE EXCEPTION 'the Akers gauge and the Akers ferry disagree by % miles on one line.', akers_gauge_vs_ferry;
  END IF;

  -- Nothing off the river was moved: the rows past 500 m keep whatever they
  -- had, which for the two lake and ranger-station POIs is NULL.
  IF EXISTS (
    SELECT 1 FROM public.points_of_interest p JOIN public.rivers r ON r.id = p.river_id
     WHERE r.slug = 'current' AND p.snap_distance_m > 500 AND p.updated_at > NOW() - interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'a point of interest more than 500 m from the Current was updated by this migration.';
  END IF;
END $$;
