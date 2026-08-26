-- The six Eleven Point float camps leave the picker. You cannot drive to them.
--
-- APPLIED to production 2026-08-25 as 20260825224514.
--
-- Denny Hollow, Horseshoe Bend, Greenbriar, Morgan Spring, Whites Creek and
-- Barn Hollow are USFS primitive float camps in and around the Irish
-- Wilderness. Every one carried is_float_endpoint = TRUE, so every one could be
-- chosen as a put-in or a take-out.
--
-- ── The disqualifying fact was already on the row ────────────────────────
--
-- Each of the six records, in its own columns:
--
--   road_access    "NO ROAD ACCESS"                  (five of six; NULL on Greenbriar)
--   parking_info   "No vehicle access. River only."
--   ownership      USFS
--
-- A float trip needs a vehicle at BOTH ends. A put-in you cannot drive to is a
-- trip that never starts; a take-out you cannot drive to is worse — a party
-- finishing a float at Whites Creek at dusk, 28.5 miles down the Eleven Point,
-- with their shuttle parked at Greer and no road out. These are places to sleep
-- in the MIDDLE of a float, which is what "float camp" means, and the rows say
-- so in their own text.
--
-- ── Five were reported. The sixth is why this is not just a data fix ─────
--
-- float-endpoint-eligibility.ts reported five of them at HIGH as
-- `non_launch_offered_as_endpoint` — every role non-launch, yet offered. That
-- worked only because those five happen to carry `campground` alone.
--
-- Greenbriar was never reported at all. Its `types` is the EMPTY ARRAY, which
-- the check deliberately treats as unjudgeable (97 approved rows are in that
-- state; flagging them all would say nothing but "the backfill has not
-- happened"). So it sat in the put-in picker, in exactly the same condition as
-- five neighbours that were being reported every day, and the roles axis could
-- not see it by construction.
--
-- It was found by the assertion at the bottom of this migration, which swept
-- the whole table rather than the five rows the fix started from. That is the
-- only reason it is in here.
--
-- The accompanying `unreachable_offered_as_endpoint` rule asks the question the
-- roles axis cannot: can a vehicle get here. It reads road_access AND
-- parking_info, because the importer writes the declaration into whichever it
-- has — Greenbriar's is in parking_info with road_access NULL — and it fires
-- whatever the roles say. Adding `gravel_bar` to a float camp (not wrong: you
-- do land on one) would otherwise have silenced the roles finding on the other
-- five and returned them to the picker.
--
-- That rule also declines to raise `launch_not_selectable` against a road-less
-- point, which matters from the moment this migration lands: after it all six
-- are correctly ineligible, and a check that then said "this is a launch nobody
-- can choose" would be sending somebody to undo the fix.
--
-- ── What is deliberately kept ────────────────────────────────────────────
--
-- `approved` stays TRUE and the roles stay, on the same reasoning as
-- 20260823200007: the detail page, the map marker, the sitemap entry and the
-- export are all keyed on approval, and these are real places people plan
-- around. A float camp is one of the better reasons to run the Eleven Point.
-- Nothing here removes them from Eddy; it removes them from the two pickers
-- that ask "where are you leaving the car".
UPDATE public.access_points ap
   SET is_float_endpoint = FALSE,
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'eleven-point'
   AND ap.slug IN (
         'denny-hollow-float-camp',
         'horseshoe-bend-float-camp',
         'greenbriar-float-camp',
         'morgan-spring-float-camp',
         'whites-creek-float-camp',
         'barn-hollow-float-camp'
       );

DO $$
DECLARE
  populated   boolean;
  n_total     integer;
  n_endpoint  integer;
  n_approved  integer;
  stray       text;
BEGIN
  -- `supabase db reset` applies migrations to an empty database and loads the
  -- seed afterwards. Nothing to assert about on a from-scratch build.
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT count(*),
         count(*) FILTER (WHERE ap.is_float_endpoint),
         count(*) FILTER (WHERE ap.approved)
    INTO n_total, n_endpoint, n_approved
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'eleven-point'
     AND ap.slug IN (
           'denny-hollow-float-camp',
           'horseshoe-bend-float-camp',
           'greenbriar-float-camp',
           'morgan-spring-float-camp',
           'whites-creek-float-camp',
           'barn-hollow-float-camp'
         );

  IF n_total = 0 THEN
    IF populated THEN
      RAISE EXCEPTION
        'none of the six Eleven Point float camps were found in a database that already holds access points; the slugs have drifted.';
    END IF;
    RAISE NOTICE 'ran against an empty access_points table (a from-scratch build).';
    RETURN;
  END IF;

  IF n_total <> 6 THEN
    RAISE EXCEPTION
      'expected 6 Eleven Point float camps, found %. Check the slugs before assuming this migration did its job.', n_total;
  END IF;

  IF n_endpoint <> 0 THEN
    RAISE EXCEPTION
      '% of the six float camps are still is_float_endpoint = true.', n_endpoint;
  END IF;

  IF n_approved <> 6 THEN
    RAISE EXCEPTION
      'only % of the six float camps are still approved. This migration withdraws them from the PICKERS, not from the map — their pages, pins and sitemap entries stay.', n_approved;
  END IF;

  -- The sweep that found Greenbriar. Deliberately over the WHOLE table and over
  -- BOTH fields, not the six rows above: scoping an assertion to the rows you
  -- already decided to fix can only ever confirm you fixed them. Mirrors
  -- isVehicleUnreachable() in float-endpoint-eligibility.ts, lookahead and all —
  -- without it a leading "No road access fee." matches a phrase meaning the
  -- opposite.
  SELECT string_agg(ap.name, ', ' ORDER BY ap.name)
    INTO stray
    FROM public.access_points ap
   WHERE ap.approved
     AND ap.is_float_endpoint
     AND (ap.road_access  ~* '^\s*(no road access|no vehicle access|river access only)(?!\s+\w)'
       OR ap.parking_info ~* '^\s*(no road access|no vehicle access|river access only)(?!\s+\w)');

  IF stray IS NOT NULL THEN
    RAISE EXCEPTION
      'still offering places with no vehicle access as float endpoints: %. Same defect, wider than the six rows this migration names.', stray;
  END IF;

  RAISE NOTICE
    'six Eleven Point float camps: approved and on the map, out of the put-in and take-out pickers.';
END $$;
