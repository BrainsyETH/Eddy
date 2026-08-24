-- managing_agency, made usable.
--
-- APPLIED to production 2026-08-24 as 20260824173241.
--
-- Two problems. The vocabulary had drifted into four pairs of synonyms —
-- "MO State Parks" beside "Missouri State Parks", "NPS" beside "National Park
-- Service", "USFS" beside "USDA Forest Service — Mark Twain National Forest",
-- and "US Army Corps of Engineers" with no acronym form. And 21 rows that can
-- be sourced left it null.
--
-- Why it matters beyond tidiness: this is the field that separates a shared
-- agency switchboard from a duplicate row. Six ONSR campgrounds share one
-- concessioner phone; two Ozark-St. Francis rec areas share a district line;
-- two Missouri state parks share 877-I-CAMP-MO. None of those are duplicates.
-- Pettit's sharing a number with itself was. Without managing_agency populated
-- there is no shape that tells those apart, which is why 20260824171732 had to
-- be found by hand.
--
-- The column means WHO RUNS THE SITE, not who authorized the business.
--
--   · The twelve Buffalo OUTFITTERS carry nps_authorized = true and are
--     independent companies on the NPS concessioner list. They are Private,
--     and the authorization flag already records the other fact.
--   · buffalo-point-concession is NOT one of them, and the distinction is the
--     whole point of the column: it is the park's OWN lodging — CCC-built
--     cabins and lodge, sourced from the NPS lodging page rather than the
--     concessioner list — operated under concession. The site is NPS-run, so
--     it stays NPS.
--   · Concessions inside a state park follow the convention
--     meramec-park-concessions already set: Private.

-- ── 1. One spelling per agency ────────────────────────────────────────────
UPDATE public.nearby_services SET managing_agency = 'MO State Parks'
 WHERE managing_agency = 'Missouri State Parks';
UPDATE public.nearby_services SET managing_agency = 'NPS'
 WHERE managing_agency = 'National Park Service';
UPDATE public.nearby_services SET managing_agency = 'USFS'
 WHERE managing_agency LIKE 'USDA Forest Service%';
UPDATE public.nearby_services SET managing_agency = 'USACE'
 WHERE managing_agency LIKE 'US Army Corps of Engineers%';

-- ── 2. Agency-run facilities ──────────────────────────────────────────────
UPDATE public.nearby_services SET managing_agency = 'MO State Parks', updated_at = now()
 WHERE managing_agency IS NULL AND slug IN (
   'current-river-state-park',            -- mostateparks.com
   'st-francois-state-park-campground',   -- mostateparks.com/park/st-francois-state-park/camping
   'washington-state-park-campground');   -- mostateparks.com/park/washington-state-park/camping

UPDATE public.nearby_services SET managing_agency = 'AR State Parks', updated_at = now()
 WHERE managing_agency IS NULL AND slug = 'withrow-springs-state-park';

UPDATE public.nearby_services SET managing_agency = 'USFS', updated_at = now()
 WHERE managing_agency IS NULL AND slug IN (
   'north-fork-recreation-area-hammond-camp', -- Mark Twain NF, USFS-managed
   'redding-recreation-area',                 -- fs.usda.gov/r08/ozark-stfrancis
   'wolf-pen-recreation-area');               -- fs.usda.gov/r08/ozark-stfrancis

UPDATE public.nearby_services SET managing_agency = 'USACE', updated_at = now()
 WHERE managing_agency IS NULL AND slug = 'war-eagle-campground-beaver-lake-coe';

-- The Forest Service does not authorize itself. usfs_authorized means "USFS
-- authorized outfitter within Mark Twain National Forest" (00072's own
-- comment); a campground the Forest Service RUNS is not an authorized
-- outfitter, and leaving the flag set would put a USFS-run site on the same
-- footing as the private operators the flag exists to mark.
UPDATE public.nearby_services SET usfs_authorized = false, updated_at = now()
 WHERE slug = 'north-fork-recreation-area-hammond-camp' AND usfs_authorized;

-- ── 3. Private businesses an agency authorizes but does not run ───────────
UPDATE public.nearby_services SET managing_agency = 'Private', updated_at = now()
 WHERE managing_agency IS NULL
   AND (nps_authorized OR usfs_authorized)
   AND type = 'outfitter';

UPDATE public.nearby_services SET managing_agency = 'Private', updated_at = now()
 WHERE managing_agency IS NULL AND slug = 'washington-state-park-concessions';

COMMENT ON COLUMN public.nearby_services.managing_agency IS
  'Who RUNS this site, from a closed vocabulary: NPS, USFS, USACE, MO State Parks, AR State Parks, MDC, AGFC, County, Private. NOT who authorized the business — an NPS-authorized outfitter on the Buffalo is Private, and nps_authorized carries the authorization; an NPS-owned lodge run under concession (buffalo-point-concession) is NPS. NULL means nobody has established it yet, which is why it must never be inferred from the name. Used by the audit to tell a shared agency switchboard (six ONSR campgrounds on one concessioner line) from a genuine duplicate row.';

DO $$
DECLARE
  v_drift int; v_should_be_private int; v_hammond text;
BEGIN
  SELECT count(*) INTO v_drift FROM public.nearby_services
   WHERE managing_agency IS NOT NULL
     AND managing_agency NOT IN ('NPS','USFS','USACE','MO State Parks',
                                 'AR State Parks','MDC','AGFC','County','Private');
  IF v_drift > 0 THEN
    RAISE EXCEPTION '% row(s) carry a managing_agency outside the vocabulary', v_drift;
  END IF;

  -- An AUTHORIZED OUTFITTER is a private company, whatever agency listed it.
  SELECT count(*) INTO v_should_be_private FROM public.nearby_services
   WHERE (nps_authorized OR usfs_authorized) AND type = 'outfitter'
     AND managing_agency IS DISTINCT FROM 'Private';
  IF v_should_be_private > 0 THEN
    RAISE EXCEPTION '% authorized outfitter(s) are not marked Private', v_should_be_private;
  END IF;

  SELECT managing_agency INTO v_hammond FROM public.nearby_services
   WHERE slug = 'north-fork-recreation-area-hammond-camp';
  IF v_hammond IS DISTINCT FROM 'USFS' THEN
    RAISE EXCEPTION 'hammond camp is %, expected USFS', v_hammond;
  END IF;
END $$;
