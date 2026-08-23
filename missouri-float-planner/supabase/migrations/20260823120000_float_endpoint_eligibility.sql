-- Separate "is this a launch" from "has an admin reviewed this".
--
-- ── The confusion this ends ───────────────────────────────────────────────
--
-- 20260811203000 needed Montauk State Park to stop being offered as a put-in.
-- The only lever available was `approved`, so it used that — and said so in its
-- own header: "`approved` is the admin-review flag, not a 'this is not a launch'
-- flag; the honest lever is the roles axis of ADR 0008."
--
-- `approved` is read by everything that decides whether a record EXISTS for the
-- public: src/lib/access-points/detail.ts (the detail page and its API),
-- /api/rivers/[slug]/access-points (the map marker), src/app/sitemap.ts (the
-- canonical URL), /api/export/rivers.json and the offline bundle. So making
-- Montauk unselectable also 404'd its page, removed its pin, and dropped it out
-- of the sitemap with no redirect. One flag, two questions, and answering the
-- second wrongly took out four things nobody meant to touch.
--
-- ── Why not the roles axis, which is the right long-term answer ───────────
--
-- Because `types` is not populated enough to gate anything yet. Live, before
-- this migration:
--
--     approved  has 'access' role   rows
--     true      true                189
--     true      false               123   ← 97 of these have an EMPTY types array
--
-- Gating the planner on `types @> {access}` today would silently remove about a
-- third of Eddy's approved launches from the picker. That is a worse failure
-- than the one being fixed, and a silent one. The roles axis stays the
-- destination; `is_float_endpoint` is the bridge, and the backfill of those 97
-- rows is what lets this column be retired.
--
-- ── DEFAULT false, deliberately ──────────────────────────────────────────
--
-- Eligibility is opt-in. The two failure directions are not symmetric:
--
--   flag wrongly false  a real put-in is visible but unselectable. Annoying,
--                       reported quickly, nobody gets wet.
--   flag wrongly true   Eddy offers a launch where there is no ramp, and
--                       somebody drives to a park boundary with a boat.
--
-- The second is a safety error, so the default fails toward it being false. The
-- cost of that choice is the first direction going unnoticed, which is why the
-- trust check in src/lib/trust/checks/float-endpoint-eligibility.ts exists: it
-- reports approved rows carrying the `access` role with is_float_endpoint FALSE,
-- and park/campground kinds with it TRUE. Neither direction is left to a default.
--
-- ── What this migration does NOT do, and why it cannot ───────────────────
--
-- Montauk is NOT re-approved here, and re-approval is not in this release at
-- all. `approved` is what puts the record back in front of the public, and
-- until the endpoint resolver is DEPLOYED nothing rejects it as a launch:
-- /api/rivers/[slug]/access-points on the old server code has no eligibility
-- filter, so a re-approved Montauk reaches every client as a selectable put-in.
--
-- That window cannot be closed from inside a migration, because migrations here
-- reach production through `npm run db:migrate` (scripts/run-migrations.ts),
-- which is decoupled from the Vercel deploy entirely. Two files in one directory
-- apply together whenever somebody runs it; a comment saying "apply this one
-- later" is a comment, not a boundary. The only real boundary is a separate
-- release, so re-approval is a follow-up PR to be applied after this branch's
-- code is live.
--
-- Its prerequisite, tracked with it: Montauk's two nearby_services rows sit at
-- IDENTICAL coordinates (37.4407,-91.6739) and both link `located_at`, which
-- /api/services never turns into an accessPointId (IDENTITY_RELATIONSHIP is
-- 'same_place', route.ts:177). So iOS draws them as two stacked pins today, and
-- re-approval would add the access marker as a third. They need geocoding apart
-- from Missouri State Parks sources first.
--
-- The wider inconsistency is also untouched and worth naming: 50 approved
-- `campground`-typed and 4 approved `park`-typed rows remain, and this migration
-- backfills all of them to TRUE because they are what the planner offers today.
-- Auditing them against primary sources is separate work; the trust check above
-- is what keeps them visible in the meantime.

ALTER TABLE public.access_points
  ADD COLUMN IF NOT EXISTS is_float_endpoint boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.access_points.is_float_endpoint IS
  'May this point be chosen as a float put-in or take-out? Distinct from `approved`, which asks only whether an admin has reviewed the record and it may be shown at all. A park or campground on the water can be approved (page, pin, sitemap) while never being offered as a launch. Opt-in: see 20260823120000.';

-- Everything the planner offers TODAY keeps being offered. This is a
-- behaviour-preserving backfill, not a re-classification — the audit that
-- decides which of these are genuinely launches is separate work.
--
-- Unapproved rows are deliberately left FALSE: they are not offered now, and the
-- admin approve path sets the flag explicitly when it promotes one.
UPDATE public.access_points
   SET is_float_endpoint = TRUE,
       updated_at = NOW()
 WHERE approved = TRUE
   AND slug <> 'montauk-state-park';

-- ── Checked, because an UPDATE that matches nothing SUCCEEDS ─────────────
--
-- The lesson 20260811203000 recorded the hard way: a one-shot data change whose
-- WHERE has drifted commits cleanly and corrects nothing. This block refuses to
-- commit unless the column exists, Montauk is excluded, and no approved row was
-- left behind.
DO $$
DECLARE
  missing   bigint;
  montauk   record;
  eligible  bigint;
  populated boolean;
BEGIN
  -- `supabase db reset` runs every migration against an EMPTY database and only
  -- then loads supabase/seed/. So on a from-scratch build there is no Montauk
  -- row to check yet, and asserting its state here would fail every reset. The
  -- row-specific assertions below therefore run only once there are rows to
  -- assert about; the seed carries the same rule at the end of
  -- seed/access_points.sql.
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT count(*) INTO missing
    FROM public.access_points
   WHERE approved = TRUE AND is_float_endpoint = FALSE
     AND slug <> 'montauk-state-park';

  IF missing > 0 THEN
    RAISE EXCEPTION
      'is_float_endpoint backfill left % approved point(s) ineligible. Every point the planner offers today must stay offered; this migration re-classifies nothing.',
      missing;
  END IF;

  SELECT approved, is_float_endpoint INTO montauk
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.slug = 'montauk-state-park';

  IF montauk IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION
        'montauk-state-park not found on the current river, in a database that already holds access points. The slug has drifted; reconcile it before this migration means anything.';
    END IF;
    RAISE NOTICE
      'is_float_endpoint added to an empty access_points table (a from-scratch build). seed/access_points.sql carries the same backfill.';
    RETURN;
  END IF;

  IF montauk.is_float_endpoint THEN
    RAISE EXCEPTION
      'montauk-state-park is marked a float endpoint. It is the one record this column exists to exclude.';
  END IF;

  -- Reported, never enforced. `approved` is deliberately not this migration's
  -- business: approved-and-ineligible is the state the follow-up produces and
  -- the state Montauk should end up in, so asserting either value here would be
  -- asserting somebody else's invariant — and would fail a rebuild that replays
  -- this file after the follow-up.
  RAISE NOTICE
    'montauk-state-park: approved=%, is_float_endpoint=false. Re-approval ships separately, after this branch''s code is deployed.',
    montauk.approved;

  SELECT count(*) INTO eligible
    FROM public.access_points WHERE is_float_endpoint = TRUE;

  RAISE NOTICE
    'is_float_endpoint: % eligible endpoint(s); montauk-state-park excluded and still unapproved.',
    eligible;
END $$;
