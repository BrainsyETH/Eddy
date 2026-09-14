-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-14 19:11:18 UTC and
-- RECORDED as 20260914191118; authored as 20260914220000 and renamed to the
-- recorded version. Ledger: supabase/production-migrations.txt.
--
-- Apply output: 136 rows took their singular type as a role, 1 float camp
-- became a campground, boat_ramp was added to 7 rows and campground to 5.
-- Roleless rows table-wide: 0. Amenity/role mismatches: 0. No row carries a
-- launch role while ineligible as an endpoint.
--
-- Give the 92 roleless access points their roles, and reconcile role with
-- amenity on twelve more.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────
--
-- ADR 0008 makes `types` the ROLES axis — what a place OFFERS — and roles are
-- what contend for a map marker. 92 approved access points across 13 active
-- rivers carry `types = '{}'`, which says a place offers nothing.
--
-- The backfill below is deliberately NOT filtered to those 92. 137 rows are
-- roleless table-wide: the 92, two still pending on an active river, and 42 on
-- rivers that are not active yet. The draft rivers are the reason — they were
-- imported by the same pipeline and would carry the same defect into their
-- launch day, at which point it stops being invisible. Fixing them now costs
-- one predicate and nothing else, since a row on an inactive river is not
-- readable anyway.
--
-- The cause was mechanical, not editorial:
-- scripts/ingestion/import-dossier-access-points.ts wrote only the singular
-- `type`, so every river onboarded through the dossier pipeline landed
-- roleless. That is fixed at source now, but the fix does not reach back.
--
-- launchRolesOf() falls back to the singular `type`, so those rows still
-- resolve as launches and nothing is broken in the planner. Two things are
-- lost. A single value cannot express two roles, so on those 13 rivers no place
-- can be both a boat ramp and a campground. And the fallback is not universal:
-- 20260806020305_facility_access_point_link.sql joins campgrounds with
-- `a.types @> ARRAY['campground']` and has no fallback at all, so a roleless
-- campground cannot be linked to its live availability.
--
-- ── float_camp IS NOT A ROLE ────────────────────────────────────────────
--
-- access_points_type_check admits 'float_camp' on the singular column, but the
-- roles vocabulary does not carry it: the admin route filters roles to
-- {boat_ramp, gravel_bar, campground, bridge, access, park} and LAUNCH_ROLES is
-- a subset of that. So the obvious backfill — types = ARRAY[type] — would write
-- one row a role every consumer silently drops, which is the same nothing it
-- has now wearing a different shape.
--
-- Greenbriar Float Camp is the single row affected, and it is one of the six
-- USFS float camps 20260825224514 took out of the picker: primitive, river-only
-- access, is_float_endpoint = FALSE. It takes `campground`, which is what it
-- offers and is in the vocabulary, and no launch role, which is the Echo Bluff
-- shape (20260826174017:138-150) and the reason it will not start reporting
-- launch_not_selectable forever.
--
-- ── ROLE AND AMENITY DISAGREEING ────────────────────────────────────────
--
-- Separately, twelve approved rows advertise a facility in `amenities` that
-- their roles do not carry: seven list a boat_ramp amenity without the
-- boat_ramp role, five list camping without the campground role. The amenity is
-- the more specific claim — somebody recorded that the ramp is there — so the
-- role is brought up to meet it, and each of those twelve appears on a layer it
-- was silently missing. Every one of the seven gaining a launch role is already
-- is_float_endpoint = true, so none of them becomes a launch it cannot honour.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
--
-- It invents no role. Every value written is already on the row, in `type` or
-- in `amenities`. It touches no coordinate, no mile, and no approval.

DO $roles$
DECLARE
    populated    BOOLEAN;
    n_backfill   INTEGER;
    n_floatcamp  INTEGER;
    n_ramp       INTEGER;
    n_camp       INTEGER;
    n_roleless   INTEGER;
    n_bad_launch INTEGER;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;
    IF NOT populated THEN
        RAISE NOTICE 'access_points is empty (from-scratch build); nothing to backfill.';
        RETURN;
    END IF;

    -- 1. The float camp first, so the blanket backfill cannot claim it.
    UPDATE public.access_points
    SET types = ARRAY['campground']::TEXT[], updated_at = NOW()
    WHERE type = 'float_camp' AND (types IS NULL OR cardinality(types) = 0);
    GET DIAGNOSTICS n_floatcamp = ROW_COUNT;

    -- 2. Everything else takes its singular type as its one role (cf. 00024).
    UPDATE public.access_points
    SET types = ARRAY[type]::TEXT[], updated_at = NOW()
    WHERE type IS NOT NULL
      AND type <> 'float_camp'
      AND (types IS NULL OR cardinality(types) = 0);
    GET DIAGNOSTICS n_backfill = ROW_COUNT;

    -- 3. Amenity says there is a ramp; the role should say so too.
    UPDATE public.access_points
    SET types = types || ARRAY['boat_ramp']::TEXT[], updated_at = NOW()
    WHERE amenities @> ARRAY['boat_ramp']::TEXT[]
      AND NOT (types && ARRAY['boat_ramp']::TEXT[]);
    GET DIAGNOSTICS n_ramp = ROW_COUNT;

    -- 4. Same for camping.
    UPDATE public.access_points
    SET types = types || ARRAY['campground']::TEXT[], updated_at = NOW()
    WHERE amenities @> ARRAY['camping']::TEXT[]
      AND NOT (types && ARRAY['campground']::TEXT[]);
    GET DIAGNOSTICS n_camp = ROW_COUNT;

    -- ── Verification ────────────────────────────────────────────────────
    SELECT count(*) INTO n_roleless
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.active AND ap.approved AND (ap.types IS NULL OR cardinality(ap.types) = 0);
    IF n_roleless > 0 THEN
        RAISE EXCEPTION '% approved access point(s) on active rivers still carry no role', n_roleless;
    END IF;

    -- Nothing may have become a launch it cannot honour.
    SELECT count(*) INTO n_bad_launch
    FROM public.access_points ap JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.active AND ap.approved
      AND ap.is_float_endpoint = false
      AND ap.types && ARRAY['access','boat_ramp','gravel_bar','bridge']::TEXT[];
    IF n_bad_launch > 0 THEN
        RAISE EXCEPTION '% row(s) carry a launch role while ineligible as an endpoint', n_bad_launch;
    END IF;

    -- The float camp is a campground and nothing else.
    PERFORM 1 FROM public.access_points
     WHERE type = 'float_camp' AND types = ARRAY['campground']::TEXT[];
    IF NOT FOUND THEN
        RAISE EXCEPTION 'the float camp did not end up as a plain campground';
    END IF;

    RAISE NOTICE 'roles backfilled from type on % row(s); % float camp(s) mapped to campground.',
                 n_backfill, n_floatcamp;
    RAISE NOTICE 'amenity reconciliation added boat_ramp to % row(s) and campground to % row(s).',
                 n_ramp, n_camp;
END
$roles$;
