-- Rate Ozark (guide mile 27.8) by the Pruitt gauge instead of Ponca.
-- Owner decision 2026-10-08, from a local paddler's report: the upper river
-- drops fast but Pruitt holds water longer, and Ozark-to-Pruitt (2.1 mi) runs
-- onto that gauge. 20261008014150 left Ozark on Ponca pending this review.
-- Only the shared boundary moves (29.9 -> 27.8); Ozark is the only access
-- point between them. Section slugs are kept for bookmarks.
BEGIN;
DO $$
DECLARE r uuid;
BEGIN
  SELECT id INTO r FROM public.rivers WHERE slug = 'buffalo';
  IF r IS NULL THEN RETURN; END IF;
  UPDATE public.river_sections SET river_mile_end = 27.8, name = 'Upper (Ponca to Ozark)'
    WHERE river_id = r AND section_slug = 'upper-ponca-pruitt';
  UPDATE public.river_sections SET river_mile_start = 27.8, name = 'Ozark to Hasty'
    WHERE river_id = r AND section_slug = 'pruitt-hasty';
END $$;
DO $$ DECLARE wrong integer; BEGIN
if not exists (select 1 from public.rivers where slug='buffalo') then return; end if;
select count(*) into wrong from (values (0.0,'07055646'),(6.0,'07055660'),(8.7,'07055660'),(22.3,'07055660'),(27.79,'07055660'),(27.8,'07055680'),(29.9,'07055680'),(36.69,'07055680'),(36.7,'07056000'),(76.9,'07056700'),(131.4,'07056700')) v(mile,site)
left join lateral get_river_condition_segment((select id from rivers where slug='buffalo'),p_put_in_mile=>v.mile) c on true where c.gauge_usgs_id is distinct from v.site;
if wrong>0 then raise exception 'Buffalo gauge boundary regression: %', wrong; end if;
END $$;
COMMIT;
