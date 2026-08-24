-- The nine sourced links are pinned to their VALUES, not to their identities.
--
-- APPLIED to production 2026-08-24 as 20260824193653.
--
-- 20260824192132 cleared the manufactured link provenance but spared nine links
-- by (service_slug, river_slug) alone, then checked its work by counting nine
-- rows and testing them for "https". Both checks are satisfied by the WRONG
-- data, and on a fresh replay they would be.
--
-- The nine correct per-river sources were never written by a migration. They
-- came from running scripts/import-service-river-facts.ts against
-- service-river-facts.csv, out of band. So on a database rebuilt from
-- migrations alone, 20260824184746's blanket backfill populates those nine
-- links from the BUSINESS-level source, 192132 preserves them because their
-- identities are on its allowlist, and its assertions pass because nine rows
-- exist and every business source happens to contain a URL.
--
-- Demonstrated rather than argued. Reproducing that state and running the two
-- sets of assertions side by side: the old pair reports count = 9 and zero
-- rows missing a URL — both green — while the value check reports 5 links
-- citing something other than the page somebody read. One of the five is the
-- precise defect the revert exists to remove:
--
--   bsc-outdoors / big-piney would cite
--     "https://bscoutdoors.com, https://missouricanoe.org/gasconade-river/"
--   — a GASCONADE page cited as the source for a BIG PINEY link.
--
-- Same error as the backfill itself, one level up: identity treated as proof
-- that a value is right. A source is only correct if it IS the page somebody
-- read for that river, so the page is written down here and compared.
--
-- Order-independent and idempotent by construction: clear every link, then set
-- exactly these nine from literals. Whatever any earlier migration did, the end
-- state is the same. On production this changes nothing and proves it.

CREATE TEMP TABLE pinned_link_sources (
  service_slug text NOT NULL,
  river_slug   text NOT NULL,
  source       text NOT NULL,
  checked_at   date NOT NULL
) ON COMMIT DROP;

-- Verbatim from scripts/ingestion/service-river-facts.csv.
INSERT INTO pinned_link_sources VALUES
  ('bass-river-resort',                'courtois',  'https://bassresort.com/river-trips/',        DATE '2026-08-24'),
  ('ozark-outdoors-resort',            'courtois',  'https://ozarkoutdoorsresort.com/canoeing/',  DATE '2026-08-24'),
  ('bsc-outdoors',                     'gasconade', 'https://bscoutdoors.com',                    DATE '2026-08-24'),
  ('bsc-outdoors',                     'big-piney', 'https://bscoutdoors.com',                    DATE '2026-08-24'),
  ('mountain-creek-family-resort',     'niangua',   'https://www.mountaincreekfamilyresort.com',  DATE '2026-08-24'),
  ('maggard-canoe-corkery-campground', 'niangua',   'https://nianguariver.com/camping',           DATE '2026-08-24'),
  ('niangua-river-oasis',              'niangua',   'https://nrocanoe.com/float-trips/',          DATE '2026-08-24'),
  ('rubys-landing',                    'gasconade', 'https://rubyslanding.com',                   DATE '2026-08-24'),
  ('pecks-last-resort',                'big-piney', 'https://www.peckslastresort.com',            DATE '2026-08-24');

-- 1. Nothing keeps a citation by virtue of having survived a previous pass.
UPDATE public.service_rivers
   SET verified_source = NULL, checked_at = NULL
 WHERE verified_source IS NOT NULL OR checked_at IS NOT NULL;

-- 2. The nine get exactly the page somebody read for that river.
UPDATE public.service_rivers sr
   SET verified_source = p.source,
       checked_at      = p.checked_at
  FROM pinned_link_sources p,
       public.nearby_services ns,
       public.rivers r
 WHERE ns.slug = p.service_slug
   AND r.slug  = p.river_slug
   AND sr.service_id = ns.id
   AND sr.river_id   = r.id;

DO $$
DECLARE
  v_missing int;
  v_sourced int;
  v_wrong   int;
BEGIN
  -- Every pinned pair must actually be a link. A silently-absent one would
  -- leave eight sourced links and a count assertion nobody wrote.
  SELECT count(*) INTO v_missing
    FROM pinned_link_sources p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.service_rivers sr
       JOIN public.nearby_services ns ON ns.id = sr.service_id
       JOIN public.rivers r ON r.id = sr.river_id
      WHERE ns.slug = p.service_slug AND r.slug = p.river_slug);
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% pinned link(s) do not exist', v_missing;
  END IF;

  SELECT count(*) INTO v_sourced
    FROM public.service_rivers WHERE verified_source IS NOT NULL;
  IF v_sourced <> 9 THEN
    RAISE EXCEPTION 'expected 9 sourced links, found %', v_sourced;
  END IF;

  -- The check that matters: not "nine rows with a URL" but "these nine rows,
  -- each citing this exact page, checked on this exact date".
  SELECT count(*) INTO v_wrong
    FROM public.service_rivers sr
    JOIN public.nearby_services ns ON ns.id = sr.service_id
    JOIN public.rivers r ON r.id = sr.river_id
   WHERE sr.verified_source IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pinned_link_sources p
        WHERE p.service_slug = ns.slug
          AND p.river_slug   = r.slug
          AND p.source       = sr.verified_source
          AND p.checked_at   = sr.checked_at);
  IF v_wrong > 0 THEN
    RAISE EXCEPTION '% link(s) cite something other than the pinned source', v_wrong;
  END IF;
END $$;
