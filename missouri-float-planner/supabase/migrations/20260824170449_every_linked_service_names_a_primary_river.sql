-- The last service left without a primary river.
--
-- APPLIED to production 2026-08-24 as 20260824170449.
--
-- steele-river-kayaks is permanently closed, so it is excluded from the
-- quality ratchet and drawn nowhere — which is exactly why it was easy to
-- leave broken. It is not harmless: 20260824124650 made import_services assert
-- that a linked service ends with exactly one primary, and that assertion runs
-- per operation inside one transaction. An import that so much as re-verified
-- this row would raise and take every other row in the file down with it.
--
-- One link, so the choice is forced. Guarded the same way as
-- 20260824170258: only a service whose links are entirely non-primary is
-- touched, and only when it has exactly one link — a multi-link row with no
-- primary is a judgement call and this migration refuses to make it.

UPDATE public.service_rivers sr
   SET is_primary = true
 WHERE sr.service_id IN (
   SELECT service_id
     FROM public.service_rivers
    GROUP BY service_id
   HAVING count(*) = 1 AND count(*) FILTER (WHERE is_primary) = 0
 );

DO $$
DECLARE
  v_broken int;
BEGIN
  SELECT count(*) INTO v_broken
    FROM (SELECT service_id, count(*) FILTER (WHERE is_primary) AS p
            FROM public.service_rivers GROUP BY service_id) t
   WHERE t.p <> 1;

  IF v_broken > 0 THEN
    RAISE EXCEPTION
      '% linked service(s) still do not name exactly one primary river', v_broken;
  END IF;
END $$;
