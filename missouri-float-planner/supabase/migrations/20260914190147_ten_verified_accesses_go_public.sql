-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-14 19:01:47 UTC and
-- RECORDED as 20260914190147; authored as 20260914210000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt.
--
-- Apply output: 10 published, 9 launches and 1 float-in campground. Approved on
-- active rivers 309 -> 319, pending 39 -> 29, usable endpoints 311. Shine Eye
-- reads {campground} with is_float_endpoint = false. validate_river_data()
-- opened no new finding on any of the five rivers.
--
-- Publish ten access points that have been sitting verified and invisible.
--
-- ── WHAT THESE ARE ──────────────────────────────────────────────────────
--
-- Of the 39 rows still pending on an active river after
-- 20260914184414 cleared the mislocated import, 21 were researched between
-- 2026-03 and 2026-07 with descriptions, sources and coordinates. They have
-- never been approved, so RLS has never shown them to anyone. Ten of the 21
-- survive every check below and are published here.
--
-- Several close gaps the audit named: Mt. Sterling Bridge splits the Gasconade's
-- 24.6-mile Pointers Creek to Helds Island gap, Indian Ford sits mid-way between
-- Bell Chute and Paydown, and Whitehouse Ford gives the Jerome reach a
-- short-float take-out.
--
-- ── THE CHECK THAT KEPT FOUR OF THEM BACK ───────────────────────────────
--
-- Snap distance was the obvious gate and it is not sufficient. Every candidate
-- was also placed against its nearest approved neighbour and scored on the
-- ratio 20260914175427 introduced — quoted mileage over line mileage, which
-- should sit near 1.0-1.5. Four failed, all within 250 m of the channel:
--
--   courtois  Bass River Low-Water Bridge   ratio 0.00  identical mile AND
--             identical position to the approved Bass River Resort, 8 m away.
--             A duplicate pin and a zero-length segment. It wants a
--             same_place link, not a second marker.
--   courtois  County Road 654 Bridge        ratio 0.01  mile 0.05 against
--             Brazil Low-Water Bridge's 0.10, with 4.38 miles of line between
--             them. One of the two miles is wrong.
--   huzzah    Highway 8 Bridge (Lower)      ratio 0.19  mile 23.10 against
--             Huzzah Valley Resort's 23.00, 0.52 miles of line apart.
--   meramec   Meramec State Park Lower Ramp  no river_mile_downstream at all,
--             so there is nothing to check and nothing to plan from.
--
-- Approving those four would have published rows that quote an impossible
-- distance to the next access — the exact defect the new rule exists to catch,
-- introduced deliberately one migration after adding the rule. The rule cannot
-- warn about them first, because it only reads approved rows. That asymmetry is
-- why the ratio belongs in the pre-approval check and not only in the ledger.
--
-- Also held: niangua Charity Access and Big John Access, which sit in the same
-- upper-Niangua cluster as Williams Ford and carry the same unresolved
-- mile-versus-coordinate question (docs/river-mile-segment-findings-2026-09-14
-- .md), and the five rows beyond 250 m, which need either a corrected
-- coordinate or an off_channel_reason.
--
-- ── is_float_endpoint IS DECIDED PER ROW, FROM THE ROW ──────────────────
--
-- Nine of the ten are launches and each says so in its own description: "a
-- major commercial put-in/take-out", "the 6-mile shuttle put-in", "the
-- traditional take-out", "an informal put-in/take-out", "carry-in bridge
-- access". Customer-only is an access restriction, not a disqualification —
-- Ruby's Landing and Twin Rivers Landing are outfitter landings and floats
-- genuinely start and end there.
--
-- Shine Eye is the exception and gets the Echo Bluff shape. Its description
-- ends "walk-in or float-in only", and 20260825224514 already settled what that
-- means: a float trip needs a vehicle at both ends, so a put-in you cannot
-- drive to is a trip that never starts and a take-out you cannot drive to is
-- worse. It is published as a campground with is_float_endpoint = FALSE.
--
-- Its `gravel_bar` role goes with it, and that is not tidying. gravel_bar is a
-- LAUNCH role (src/lib/access-points/launch-roles.ts), so a row carrying it
-- while ineligible is exactly the permanently-false finding
-- 20260826174017_echo_bluff_is_on_sinking_creek.sql:138-150 warns about — the
-- kind somebody eventually silences by flipping the wrong flag. Echo Bluff
-- carries {campground, park} and no launch role for the same reason. Shine Eye
-- keeps {campground}: it is a place to sleep in the middle of a Buffalo float,
-- which is what the row is for.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
--
-- It writes no coordinate and no river mile. Every value below was already on
-- the row; this migration only flips `approved` and, for one row, removes a
-- role the row cannot honour.

DO $publish$
DECLARE
    populated       BOOLEAN;
    approved_before INTEGER;
    approved_after  INTEGER;
    n_approved      INTEGER;
    n_missing       INTEGER;
    n_bad_ratio     INTEGER;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
    IF NOT populated THEN
        RAISE NOTICE 'access_points is empty (from-scratch build); nothing to publish.';
        RETURN;
    END IF;

    CREATE TEMP TABLE publishing (river TEXT, ap TEXT, endpoint BOOLEAN) ON COMMIT DROP;
    INSERT INTO publishing VALUES
        ('black',      'mill-creek',                TRUE),
        ('black',      'twin-rivers-landing',       TRUE),
        ('bourbeuse',  'laubinger-ford',            TRUE),
        ('buffalo',    'shine-eye',                 FALSE),
        ('gasconade',  'blacks-ford',               TRUE),
        ('gasconade',  'indian-ford-mo-42-bridge',  TRUE),
        ('gasconade',  'mt-sterling-bridge',        TRUE),
        ('gasconade',  'rubys-landing',             TRUE),
        ('gasconade',  'whitehouse-ford',           TRUE),
        ('st-francis', 'gruner-ford-hwy-h-bridge',  TRUE);

    -- Every row must still be there, still pending, and still carry a mile.
    SELECT count(*) INTO n_missing
    FROM publishing p
    WHERE NOT EXISTS (
        SELECT 1 FROM public.access_points ap
        JOIN public.rivers r ON r.id = ap.river_id
        WHERE r.slug = p.river AND ap.slug = p.ap
          AND ap.approved = false
          AND ap.river_mile_downstream IS NOT NULL
    );
    IF n_missing > 0 THEN
        RAISE EXCEPTION 'refusing: % of the 10 rows are missing, already approved, or have no river mile', n_missing;
    END IF;

    SELECT count(*) INTO approved_before FROM public.access_points WHERE approved = true;

    -- Shine Eye drops the launch role it cannot honour, before it goes public.
    UPDATE public.access_points ap
    SET types = ARRAY['campground']::TEXT[]
    FROM public.rivers r
    WHERE r.id = ap.river_id AND r.slug = 'buffalo' AND ap.slug = 'shine-eye'
      AND ap.types @> ARRAY['gravel_bar']::TEXT[];

    UPDATE public.access_points ap
    SET approved = true,
        approved_at = NOW(),
        is_float_endpoint = p.endpoint,
        updated_at = NOW()
    FROM public.rivers r, publishing p
    WHERE r.id = ap.river_id AND r.slug = p.river AND ap.slug = p.ap
      AND ap.approved = false;
    GET DIAGNOSTICS n_approved = ROW_COUNT;

    IF n_approved <> 10 THEN
        RAISE EXCEPTION 'expected to approve 10 rows, approved %', n_approved;
    END IF;

    SELECT count(*) INTO approved_after FROM public.access_points WHERE approved = true;
    IF approved_after - approved_before <> 10 THEN
        RAISE EXCEPTION 'approved count moved by % rather than 10', approved_after - approved_before;
    END IF;

    -- Shine Eye must be a campground you cannot launch from, in both columns.
    PERFORM 1 FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
     WHERE r.slug = 'buffalo' AND ap.slug = 'shine-eye'
       AND ap.is_float_endpoint = false AND NOT (ap.types && ARRAY['access','boat_ramp','gravel_bar','bridge']::TEXT[]);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shine Eye still carries a launch role or is still offered as an endpoint';
    END IF;

    -- The rule these were checked against must stay silent about them.
    SELECT count(*) INTO n_bad_ratio
    FROM validate_river_data()
    WHERE check_name = 'mileage_segment_implausible'
      AND river_slug IN ('black','bourbeuse','buffalo','gasconade','st-francis');
    IF n_bad_ratio > 0 THEN
        RAISE EXCEPTION 'publishing these rows opened % implausible-segment finding(s) on their rivers', n_bad_ratio;
    END IF;

    RAISE NOTICE 'published % access point(s); 9 launches and 1 float-in campground.', n_approved;
    RAISE NOTICE 'approved count % -> %.', approved_before, approved_after;
END
$publish$;
