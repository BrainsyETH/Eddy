-- Give Montauk State Park its page, its pin and its sitemap entry back.
--
-- APPLY ONLY AFTER the endpoint resolver and the updated clients are live. This
-- is stage 3 of 3; 20260823120000 is stage 1 and explains why the two are not
-- one file. In short: `approved` makes the record public again, and until the
-- server rejects Montauk as an endpoint and the clients stop offering it, a
-- re-approved Montauk is a selectable put-in to anything already installed.
--
-- ── What comes back ──────────────────────────────────────────────────────
--
-- All of it keyed on `approved`, none of it on eligibility:
--
--   the detail page + /api/rivers/current/access/montauk-state-park
--                                   src/lib/access-points/detail.ts:63
--   the map marker                  /api/rivers/[slug]/access-points
--   the canonical URL in the sitemap  src/app/sitemap.ts:59-61
--   /api/export/rivers.json and the offline bundle
--   the two `located_at` links from 20260811150000, which have been hanging off
--   an unapproved row since 2026-08-11 and reading as nothing
--
-- What does NOT come back is the put-in/take-out picker. `is_float_endpoint`
-- stays FALSE, and /api/plan, /api/shuttle and /api/og/float now resolve
-- endpoints through src/lib/access-points/endpoint-resolver.ts, which requires
-- approved AND is_float_endpoint AND a matching river_id. A Montauk id posted
-- directly to the API is refused, not merely hidden by the UI.
--
-- ── The classification 20260811203000 established is kept ─────────────────
--
-- type='park', types={park,campground}, the fee note and the description all
-- stand. Nothing here says Montauk is a launch; it says Montauk is a place, and
-- a place is allowed to have a page.
--
-- ── One warning returns, and that is correct ─────────────────────────────
--
-- validate_river_data() reports `access_point_not_snapped` (severity: warning)
-- for every approved row with location_snap IS NULL. Montauk's pin is 2 236 m
-- from the Current's line, past the 1 500 m ceiling at which
-- auto_snap_access_point refuses to snap, so it rejoins Ha Ha Tonka, Whistle
-- Bridge and Mother Nature's in that warning — exactly where it sat before
-- 2026-08-11.
--
-- That distance is not a bad coordinate, and the number should not be read as
-- one. The nearest point on the Current's geometry to Montauk IS the geometry's
-- first vertex — st_closestpoint(r.geom, ap.location_orig) equals
-- st_startpoint(r.geom), and both distances are 2 235.65 m. Eddy's line simply
-- begins 2.2 km below the park. Any correctly-pinned headwaters record would
-- produce the same figure. The rule is left alone: it is a warning, it already
-- fires for three other honest locations, and rewriting a 205-line validation
-- function to silence it would move trust-ledger fingerprints for no gain.
UPDATE public.access_points ap
   SET approved = TRUE,
       approved_at = NOW(),
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'montauk-state-park';

-- ── Checked, for the same reason every statement here is ─────────────────
DO $$
DECLARE
  montauk   record;
  eligible  bigint;
  approved  bigint;
  populated boolean;
BEGIN
  -- Same reason as 20260823120000: `supabase db reset` applies migrations to an
  -- empty database and loads the seed afterwards, so on a from-scratch build the
  -- UPDATE above matches nothing and there is nothing here to assert. The seed
  -- inserts Montauk already approved and leaves it ineligible, which is the same
  -- end state this migration produces against production.
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT ap.approved, ap.is_float_endpoint, ap.type, ap.types
    INTO montauk
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.slug = 'montauk-state-park';

  IF montauk IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION
        'montauk-state-park not found on the current river, in a database that already holds access points; the slug has drifted.';
    END IF;
    RAISE NOTICE
      'montauk-state-park re-approval ran against an empty access_points table (a from-scratch build); seed/access_points.sql inserts it approved and ineligible.';
    RETURN;
  END IF;

  IF NOT montauk.approved THEN
    RAISE EXCEPTION
      'montauk-state-park is still unapproved. This migration exists to restore its page, pin and sitemap entry, and it corrected nothing.';
  END IF;

  -- The whole point. If eligibility came back with approval, the false launch
  -- came back with it and 20260811203000 was undone rather than corrected.
  IF montauk.is_float_endpoint THEN
    RAISE EXCEPTION
      'montauk-state-park is approved AND marked a float endpoint. Approval restores the record; it must not restore the put-in.';
  END IF;

  IF montauk.type <> 'park' THEN
    RAISE EXCEPTION
      'montauk-state-park is typed %, not park. The classification 20260811203000 established is meant to survive this migration.',
      montauk.type;
  END IF;

  SELECT count(*) INTO approved FROM public.access_points WHERE approved;
  SELECT count(*) INTO eligible FROM public.access_points WHERE is_float_endpoint;

  IF approved <> eligible + 1 THEN
    RAISE WARNING
      'approved=% eligible=%. Expected exactly one approved-but-ineligible row (Montauk) at this point; a wider gap means other records were re-classified outside this migration.',
      approved, eligible;
  END IF;

  RAISE NOTICE
    'montauk-state-park: approved, not a float endpoint. approved=% eligible=%.',
    approved, eligible;
END $$;
