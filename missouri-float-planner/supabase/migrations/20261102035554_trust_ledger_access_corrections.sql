-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-11-02 03:55:54 UTC and
-- RECORDED as 20261102035554. Ledger: supabase/production-migrations.txt.
--
-- Three access-point corrections from the 2026-11-02 Trust Ledger review.
-- Each UPDATE is guarded on the value it replaces, so re-running is a no-op and
-- a row somebody has since edited by hand is left alone (and the assertion at
-- the end says so rather than passing quietly).
--
-- ── 1. Mammoth Spring State Park (Dam #1) is a launch ───────────────────────
-- non_launch_offered_as_endpoint (high): offered as a put-in while its only
-- role was `park`. The roles were incomplete, not the eligibility — the Spring
-- River dossier (scripts/ingestion/access-points/spring-river.json) records
-- "Float put-in is below Dam #1; AGFC trout water begins 100 yds below the
-- dam", and it is the first access on the river. So `access` is ADDED and
-- is_float_endpoint is left true. `park` stays first: types[0] is the label the
-- planner and find-float strip print.
--
-- ── 2. Niangua: Riverfront Campground & Canoe, 30.0 -> 28.8 ─────────────────
-- mileage_segment_implausible: Riverfront -> Bennett Spring Access quoted
-- 0.20 mi over 1.41 mi of line. The Niangua's stored miles sit on an editorial
-- ruler offset from the geometry by a near-constant amount (mile-index.ts), and
-- around Bennett Spring that offset is 24.81-24.83 on every neighbour (Moon
-- Valley, Cat Hollow, Bennett Spring Access) — Riverfront alone read 23.60. So
-- Riverfront is the wrong row. 53.60 geometry miles less the neighbours' 24.82
-- is 28.78; 28.8 keeps the river's one-decimal convention and gives Cat Hollow
-- -> Riverfront 2.3 mi over 2.28 of line and Riverfront -> Bennett Spring
-- 1.4 over 1.41.
--
-- ── 3. Meramec: Riverview Ranch, 73.8 -> 74.2 ───────────────────────────────
-- mileage_segment_implausible: Campbell Bridge -> Riverview Ranch quoted
-- 0.20 mi over 0.53 mi of line. Campbell Bridge (73.6) agrees with MDC's own
-- published "mile 73.7"; Riverview Ranch's 73.8 is a resort "near Campbell
-- Bridge" given a mile one notch past it. Neighbouring offsets run 21.8-22.4,
-- too loose to read one decimal from, so the mile is set by the two segments it
-- bounds instead: 74.2 makes both Campbell Bridge -> Riverview Ranch (0.6 over
-- 0.53) and Riverview Ranch -> Blue Springs Creek (4.4 over 3.90) a 1.13 ratio.
-- 74.1 would leave the first at 0.94 — shorter than the line, which a real
-- channel cannot be.
--
-- Keyed on river slug + access-point slug (unique per river), as the other
-- data migrations here are, so it replays on a rebuilt database.
--
-- river_mile_upstream is not touched: these rivers' upstream column does not
-- sum to length_miles today (see 20260825224950) and nothing reads it.

UPDATE public.access_points ap
SET types = ARRAY['park', 'access']::TEXT[], updated_at = NOW()
FROM public.rivers r
WHERE r.id = ap.river_id AND r.slug = 'spring-river'
  AND ap.slug = 'mammoth-spring-state-park-dam-1'
  AND ap.types = ARRAY['park']::TEXT[];

UPDATE public.access_points ap
SET river_mile_downstream = 28.8, updated_at = NOW()
FROM public.rivers r
WHERE r.id = ap.river_id AND r.slug = 'niangua'
  AND ap.slug = 'riverfront-campground-canoe'
  AND ap.river_mile_downstream = 30.00;

UPDATE public.access_points ap
SET river_mile_downstream = 74.2, updated_at = NOW()
FROM public.rivers r
WHERE r.id = ap.river_id AND r.slug = 'meramec'
  AND ap.slug = 'riverview-ranch'
  AND ap.river_mile_downstream = 73.80;

DO $$
DECLARE
    bad text;
BEGIN
    SELECT string_agg(ap.name, ', ') INTO bad
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE (r.slug = 'spring-river' AND ap.slug = 'mammoth-spring-state-park-dam-1'
           AND NOT ap.types @> ARRAY['access']::TEXT[])
       OR (r.slug = 'niangua' AND ap.slug = 'riverfront-campground-canoe'
           AND ap.river_mile_downstream <> 28.8)
       OR (r.slug = 'meramec' AND ap.slug = 'riverview-ranch'
           AND ap.river_mile_downstream <> 74.2);

    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'access corrections did not land on: % (edited since review?)', bad;
    END IF;

    -- Only meaningful where the corrected rows exist; a database rebuilt from
    -- migrations alone may not carry them, and must not fail on that.
    IF EXISTS (
        SELECT 1 FROM public.access_points
        WHERE slug IN ('riverfront-campground-canoe', 'riverview-ranch')
    ) AND EXISTS (
        SELECT 1 FROM validate_river_data()
        WHERE check_name = 'mileage_segment_implausible' AND river_slug IN ('meramec', 'niangua')
    ) THEN
        RAISE EXCEPTION 'mileage_segment_implausible still reports meramec or niangua after the correction';
    END IF;
END $$;
