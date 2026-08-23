-- Montauk is a put-in Eddy cannot yet draw a route from. Withhold the picker.
--
-- APPLIED to production 2026-08-23 as 20260823200007.
--
-- 20260823192151 marked Montauk a float endpoint because it IS the first put-in
-- on the Current. That is still true and nothing here contradicts it. What is
-- also true is that Eddy's Current geometry does not reach it, and offering a
-- launch whose route starts somewhere else is worse than not offering it yet.
--
-- ── Measured, not inferred ───────────────────────────────────────────────
--
-- get_float_segment(montauk, cedargrove) returns:
--
--   quoted distance   8.90 mi   (river_mile 9.00 − 0.10)
--   drawn geometry    7.25 mi
--   geometry starts   POINT(-91.6614 37.450406) — 2 236 m from Montauk's pin
--
-- So the map would draw a line beginning 1.4 miles DOWNSTREAM of where somebody
-- is standing, under a float time computed from a distance the line does not
-- cover. That is a bad answer to a go/no-go question, not a cosmetic gap.
--
-- ── It is the LINE that is short, not the pin that is wrong ──────────────
--
-- The obvious repair — move the pin onto the river — is wrong here, and the
-- reason is Tan Vat:
--
--   point          recorded mile   position along Eddy's line   snap
--   Montauk             0.10            0.00 (clamped)          2 236 m
--   Tan Vat             0.90            0.00                       49 m
--   Baptist Camp        2.10            1.18                       25 m
--   Cedargrove          9.00            7.19                       87 m
--
-- Tan Vat is ON the line (49 m) and sits at its very start. Eddy's Current
-- therefore BEGINS at Tan Vat, while the recorded miles are measured from a
-- true headwaters ~1.8 mi above that. Moving Montauk onto the line start would
-- drop it on top of Tan Vat. The line is truncated; extending it upstream to
-- the park is an NHD import, and it is what unblocks this row.
--
-- Note the same offset affects every upper-Current pair — a Tan Vat →
-- Cedargrove float quotes 8.10 mi and draws 7.19. That is pre-existing and not
-- addressed here; Montauk is the only one whose route starts in the wrong
-- PLACE rather than merely running short.
--
-- ── What is deliberately kept ────────────────────────────────────────────
--
-- `approved` stays TRUE: the detail page, the marker, the sitemap entry and the
-- export are all keyed on it, and losing them is precisely the conflation
-- 20260811203000 made and this branch exists to undo. Montauk is still one
-- point, still one marker, still the first put-in.
--
-- The `access` role stays too, and that is load-bearing: with it,
-- float-endpoint-eligibility.ts raises `launch_not_selectable` against this row
-- every day it stays this way. A launch nobody can choose SHOULD be an open
-- finding — it is how this comes back when the geometry lands, instead of
-- quietly staying false forever.
--
-- ── And the fee badge, which was simply wrong ────────────────────────────
--
-- fee_required drove a "$ Fee" chip (CompactAccessCard.tsx:129) over fee_notes
-- that say there is no launch fee. Missouri state parks charge no day-use or
-- launch fee; the camping, cabins and dining are optional paid amenities. The
-- flag answers "does it cost anything to use this access", so it is FALSE, and
-- the amenity prices stay described in fee_notes where they belong.
UPDATE public.access_points ap
   SET is_float_endpoint = FALSE,
       fee_required = FALSE,
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'montauk-state-park';

DO $$
DECLARE
  m         record;
  populated boolean;
BEGIN
  -- `supabase db reset` applies migrations to an empty database and loads the
  -- seed afterwards. Nothing to assert about on a from-scratch build.
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT ap.approved, ap.is_float_endpoint, ap.fee_required, ap.types
    INTO m
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.slug = 'montauk-state-park';

  IF m IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION
        'montauk-state-park not found on the current river, in a database that already holds access points; the slug has drifted.';
    END IF;
    RAISE NOTICE 'ran against an empty access_points table (a from-scratch build).';
    RETURN;
  END IF;

  IF NOT m.approved THEN
    RAISE EXCEPTION
      'montauk-state-park is unapproved. This migration withdraws it from the PICKER, not from the map — its page, pin and sitemap entry stay.';
  END IF;

  IF m.is_float_endpoint OR m.fee_required THEN
    RAISE EXCEPTION
      'montauk-state-park is is_float_endpoint=% fee_required=%; both must be false.',
      m.is_float_endpoint, m.fee_required;
  END IF;

  IF NOT (m.types @> ARRAY['access']::text[]) THEN
    RAISE EXCEPTION
      'montauk-state-park lost the access role. It IS a launch; it is only waiting for the river line. The role is what makes the trust check report it as such.';
  END IF;

  RAISE NOTICE
    'montauk-state-park: approved, access role kept, withheld from the picker until the Current geometry reaches it.';
END $$;
