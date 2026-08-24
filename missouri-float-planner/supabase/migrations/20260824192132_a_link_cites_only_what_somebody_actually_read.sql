-- Undo the river-link provenance backfill. It manufactured evidence.
--
-- APPLIED to production 2026-08-24 as 20260824192132.
--
-- 20260824184746 copied each business's row-level verified_source onto every
-- unsourced river link, gated only on the source not being one of four
-- placeholder words. That gate was far weaker than it looked, and the result
-- was 129 links citing pages that do not establish what they were cited for:
--
--   · 71 of the 129 carry no URL at all — bare domains, and strings like
--     "mcfa_directory" and "existing_codebase_migration_00055". The migration's
--     own comment claimed it stamped "only where the owning service cites
--     something citable". 55% of what it stamped cannot be opened.
--   · 2 contain a placeholder token inside a compound string. The filter tested
--     the WHOLE value with NOT IN, so "mcfa_directory, knowledge_base" passed a
--     check written to exclude knowledge_base.
--   · 45 belong to 21 multi-river businesses, where one page was stamped onto
--     every river the business touches. wild-bills-outfitter now cites the NPS
--     Buffalo River concessioner page for its CROOKED CREEK link. That page is
--     about the Buffalo. It says nothing about Crooked Creek.
--
-- The rule this violated was already written down, one migration earlier, and
-- then not followed: 20260824115114 deliberately refused a blanket backfill of
-- service_field_sources for exactly this reason — a row source cannot prove
-- every fact, and a confident-looking wrong attribution is worse than a blank.
--
-- The line that actually holds: provenance may be RECORDED at the moment a
-- human asserts the fact, and may not be INFERRED later by SQL. So:
--
--   · import_services keeps setting a new link's source from the CSV row. The
--     researcher asserted that river, from that page, in that file, and the
--     importer already requires the source to parse as a URL.
--   · import-service-river-facts keeps refining a link with the page that
--     documents that specific river — the nine links below, each authored
--     per-river by hand.
--   · Nothing stamps a link nobody looked at. NULL is the honest value: it
--     means "no-one has established this", which is true, and which the
--     coverage work can act on. A citation that cannot be checked is not a
--     weaker version of that — it is a false one.

UPDATE public.service_rivers sr
   SET verified_source = NULL,
       checked_at      = NULL
  FROM public.nearby_services ns,
       public.rivers r
 WHERE ns.id = sr.service_id
   AND r.id  = sr.river_id
   AND sr.verified_source IS NOT NULL
   -- Keep only the links a human sourced per-river, from
   -- scripts/ingestion/service-river-facts.csv.
   AND (ns.slug, r.slug) NOT IN (
     ('bass-river-resort',                'courtois'),
     ('ozark-outdoors-resort',            'courtois'),
     ('bsc-outdoors',                     'gasconade'),
     ('bsc-outdoors',                     'big-piney'),
     ('mountain-creek-family-resort',     'niangua'),
     ('maggard-canoe-corkery-campground', 'niangua'),
     ('niangua-river-oasis',              'niangua'),
     ('rubys-landing',                    'gasconade'),
     ('pecks-last-resort',                'big-piney')
   );

DO $$
DECLARE
  v_sourced int;
  v_no_url  int;
BEGIN
  SELECT count(*) INTO v_sourced
    FROM public.service_rivers WHERE verified_source IS NOT NULL;
  IF v_sourced <> 9 THEN
    RAISE EXCEPTION 'expected 9 hand-sourced links to remain, found %', v_sourced;
  END IF;

  -- Every survivor must be a page somebody can open.
  SELECT count(*) INTO v_no_url
    FROM public.service_rivers
   WHERE verified_source IS NOT NULL AND verified_source !~* 'https?://';
  IF v_no_url > 0 THEN
    RAISE EXCEPTION '% surviving link(s) cite something with no URL', v_no_url;
  END IF;
END $$;
