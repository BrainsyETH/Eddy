-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-10-10 and RECORDED as
-- 20261010231514. Ledger: supabase/production-migrations.txt. Apply output:
-- Dillard Mill -> Highway 49 quotes 2.00 mi; Huzzah mileage findings clear.
--
-- Dillard Mill sits about two miles ABOVE the Huzzah's published mile 0.0.
--
-- `mileage_segment_implausible` reports one Huzzah segment: Dillard Mill ->
-- Highway 49 Bridge quotes 0.10 mi against 1.44 mi of river line (ratio
-- 0.07). docs/river-mile-segment-findings-2026-09-14.md read the pair of
-- round numbers at the top of the creek as placeholders and asked whether the
-- Huzzah has a published mile index before assigning one. It does, and it
-- settles which endpoint is wrong:
--
--   "0.0 access is at the Hwy. 49 bridge."
--   "Dillard Mill is about 2 miles above the Hwy. 49 access."
--     https://fllog.wordpress.com/2013/04/16/float-66-huzzah-creek/
--   Highway 49 -> Red Bluff is published as 8 mi; stored 0.20 -> 8.30 quotes
--   8.10, so Highway 49 and everything below it already follow the index.
--
-- So Highway 49's 0.20 is right (the index's 0.0, rounded the same way the
-- rest of the stored chain is) and Dillard Mill's 0.10 is a placeholder.
-- Dillard Mill lies upstream of the index origin, so on that index its mile
-- is NEGATIVE: about two miles above 0.20 is -1.80. The alternative, shifting
-- every Huzzah mile by +1.9 so the mill reads 0.1, would rebase the published
-- index the planner's labels follow, which this repository refuses to do (see
-- src/lib/geo/mile-index.ts and migration 20260914175427).
--
-- Check: Dillard Mill -> Highway 49 becomes 2.00 mi against 1.44 mi of line
-- (ratio 1.39), inside the 0.5-2.0 band of ordinary sinuosity, and the rule's
-- Huzzah finding clears. Precision is the source's "about two miles"; it
-- replaces a value that was wrong by a factor of twenty.
--
-- Nothing depends on miles being non-negative: get_float_segment quotes
-- ABS(end - start), ordering is by the mile, and no constraint or trigger
-- reads river_mile_downstream. Saved float plans keep the distance they were
-- saved with; new plans and Float Mode use the corrected mile.

DO $huzzah$
DECLARE
    n_bad INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.access_points) THEN
        RAISE NOTICE 'access_points is empty (from-scratch build); nothing to correct.';
        RETURN;
    END IF;

    PERFORM 1
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'huzzah' AND ap.slug IN ('dillard-mill', 'highway-49-bridge')
    FOR UPDATE OF ap;

    SELECT count(*) INTO n_bad
    FROM (VALUES ('dillard-mill', 0.10::NUMERIC), ('highway-49-bridge', 0.20::NUMERIC))
         AS expected(slug, mile)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.access_points ap
        JOIN public.rivers r ON r.id = ap.river_id
        WHERE r.slug = 'huzzah'
          AND ap.slug = expected.slug
          AND ap.approved
          AND ap.river_mile_downstream = expected.mile
    );
    IF n_bad <> 0 THEN
        RAISE EXCEPTION 'refusing: % Huzzah prerequisite row(s) changed or disappeared', n_bad;
    END IF;

    UPDATE public.access_points ap
    SET river_mile_downstream = -1.80,
        updated_at = NOW()
    FROM public.rivers r
    WHERE r.id = ap.river_id
      AND r.slug = 'huzzah'
      AND ap.slug = 'dillard-mill';

    -- The rule that named this segment must now be clean on the Huzzah.
    IF EXISTS (
        SELECT 1 FROM public.validate_river_data()
        WHERE river_slug = 'huzzah'
          AND check_name IN ('mileage_segment_implausible', 'mileage_order_mismatch')
    ) THEN
        RAISE EXCEPTION 'refusing: Huzzah mileage findings remain after the correction';
    END IF;
END
$huzzah$;
