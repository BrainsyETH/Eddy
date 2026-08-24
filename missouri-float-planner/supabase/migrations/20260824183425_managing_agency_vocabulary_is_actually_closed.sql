-- The agency vocabulary stops being aspirational.
--
-- APPLIED to production 2026-08-24 as 20260824183425.
--
-- 20260824173241 normalised the spellings and wrote the closed set into the
-- column comment, then asserted it once at apply time. That validates history
-- and guarantees nothing about tomorrow: the next hand-written UPDATE or a
-- typo in a CSV could put anything in this column.
--
-- It is not a cosmetic column. check-service-model asks whether an agency runs
-- the site to decide whether a shared phone number is a switchboard or the
-- same business filed twice. Written the obvious way — not null and not
-- 'Private' — a typo like 'Privte' reads as an agency and SUPPRESSES the
-- duplicate warning for every row on that number, silently and permanently.
-- agencyRuns() in scripts/service-quality.ts now recognises only known values
-- so an unknown one fails eager instead; this constraint stops it reaching the
-- table at all, and the importer names the CSV line before it gets that far.
--
-- Verified after applying: an UPDATE setting 'Privte' is refused with
-- 23514 nearby_services_managing_agency_check.
--
-- Deliberately NOT the same vocabulary as access_points.managing_agency, which
-- 00034 constrains to MDC/NPS/USFS/COE/State Park/County/Municipal/Private and
-- @eddy/types ships as ManagingAgency. The two disagree — COE against USACE
-- for one agency, one shared 'State Park' against a per-state spelling, and
-- each holds a value the other lacks. That divergence predates this branch:
-- the directory already carried 'MO State Parks' and 'USFS' before any of this
-- work. Unifying them means touching 274 access points, the map sheet and a
-- shipped iOS type, so it is filed as separate work rather than smuggled in
-- behind a constraint.

ALTER TABLE public.nearby_services
DROP CONSTRAINT IF EXISTS nearby_services_managing_agency_check;

ALTER TABLE public.nearby_services
ADD CONSTRAINT nearby_services_managing_agency_check
CHECK (
  managing_agency IS NULL OR
  managing_agency = ANY(ARRAY[
    'NPS', 'USFS', 'USACE', 'MO State Parks', 'AR State Parks',
    'MDC', 'AGFC', 'County', 'Private'])
);

DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.nearby_services
   WHERE managing_agency IS NOT NULL
     AND managing_agency <> ALL (ARRAY[
       'NPS', 'USFS', 'USACE', 'MO State Parks', 'AR State Parks',
       'MDC', 'AGFC', 'County', 'Private']);
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% row(s) outside the vocabulary survived the constraint', v_bad;
  END IF;
END $$;
