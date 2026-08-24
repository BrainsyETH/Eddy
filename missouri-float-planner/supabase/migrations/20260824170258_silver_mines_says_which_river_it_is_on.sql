-- Silver Mines Campground names the river it is on.
--
-- APPLIED to production 2026-08-24 as 20260824170258.
--
-- 20260815120000 inserted the service_rivers link without is_primary, which
-- defaults to false, leaving the row linked to the St. Francis and claiming no
-- primary river at all. GET /api/rivers/[slug]/services orders by is_primary
-- descending, so the campground has been sorting below every row that does
-- claim one. It has exactly one link, so which river is primary is not a
-- judgement call.
--
-- Guarded rather than blind: the update touches only a service whose links are
-- entirely non-primary, so re-running it cannot re-point a primary somebody
-- set deliberately in between.

UPDATE public.service_rivers sr
   SET is_primary = true
  FROM public.nearby_services ns
 WHERE sr.service_id = ns.id
   AND ns.slug = 'silver-mines-campground-usfs'
   AND NOT EXISTS (
     SELECT 1 FROM public.service_rivers other
      WHERE other.service_id = ns.id AND other.is_primary
   );

DO $$
DECLARE
  v_primaries int;
  v_links     int;
BEGIN
  SELECT count(*) FILTER (WHERE sr.is_primary), count(*)
    INTO v_primaries, v_links
    FROM public.service_rivers sr
    JOIN public.nearby_services ns ON ns.id = sr.service_id
   WHERE ns.slug = 'silver-mines-campground-usfs';

  IF v_links > 0 AND v_primaries <> 1 THEN
    RAISE EXCEPTION
      'silver-mines-campground-usfs has % link(s) and % primary — expected exactly 1',
      v_links, v_primaries;
  END IF;
END $$;
