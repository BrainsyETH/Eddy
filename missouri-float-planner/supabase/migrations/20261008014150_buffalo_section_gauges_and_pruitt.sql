-- Buffalo's four sections had neither boundaries nor representative gauges.
-- Assign BOTH atomically: an unbounded assigned section would match every mile.
-- Miles use the existing NPS/Boxley-zero access-point scale, not a geometry
-- distance or an invented hydrological boundary. The proposed Ozark split is
-- deliberately not applied without a reviewed coverage decision.
-- Pruitt: USGS 07055680; existing NPS capture buffalo-thresholds-captured.md.
-- NPS Moderate stays Good (200–1000 cfs); no unsupported Good/Flowing split.
-- Existing stations' recreational thresholds, including St. Joe, are preserved.
BEGIN;
DO $$
DECLARE r uuid; station_count integer; section_count integer;
BEGIN
  SELECT id INTO r FROM public.rivers WHERE slug = 'buffalo';
  IF r IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO section_count FROM public.river_sections WHERE river_id = r
    AND section_slug IN ('hailstone','upper-ponca-pruitt','middle-pruitt-gilbert','lower-gilbert-buffalocity');
  SELECT count(*) INTO station_count FROM public.river_gauges rg JOIN public.gauge_stations g ON g.id=rg.gauge_station_id
    WHERE rg.river_id=r AND g.active AND g.usgs_site_id IN ('07055646','07055660','07056000','07056700');
  IF section_count <> 4 OR station_count <> 4 THEN
    RAISE EXCEPTION 'Buffalo preflight failed: % sections, % existing gauges',section_count,station_count;
  END IF;

  INSERT INTO public.gauge_stations(usgs_site_id, site_id_external, provider, name, location, active, curated, state_code, parameter_codes, drainage_area_sqmi)
  VALUES ('07055680','07055680','usgs','Buffalo River at Pruitt, AR',ST_SetSRID(ST_MakePoint(-93.1377777778,36.0591666667),4326),true,true,'AR',ARRAY['00060','00065'],190)
  ON CONFLICT (usgs_site_id) DO UPDATE SET curated=true, active=true;

  INSERT INTO public.river_gauges(river_id,gauge_station_id,is_primary,threshold_unit,
    level_too_low,level_low,level_optimal_min,level_optimal_max,level_high,level_dangerous,
    threshold_source,threshold_source_url,threshold_updated_at)
  SELECT r,id,false,'cfs',100,200,NULL,1000,1000,2000,'editorial',
    'https://www.nps.gov/buff/planyourvisit/paddling.htm',now()
  FROM public.gauge_stations WHERE usgs_site_id='07055680'
  ON CONFLICT (river_id,gauge_station_id) DO NOTHING;

  UPDATE public.river_sections s SET primary_gauge_station_id=g.id,
    river_mile_start=v.start_mile,river_mile_end=v.end_mile
  FROM (VALUES
    ('hailstone','07055646',NULL::numeric,6.0::numeric),
    ('upper-ponca-pruitt','07055660',6.0,29.9),
    ('middle-pruitt-gilbert','07056000',36.7,76.9),
    ('lower-gilbert-buffalocity','07056700',76.9,NULL::numeric)
  ) v(slug,site,start_mile,end_mile)
  JOIN public.gauge_stations g ON g.usgs_site_id=v.site
  WHERE s.river_id=r AND s.section_slug=v.slug;

  -- NPS explicitly identifies Pruitt–Hasty as an alternative when the
  -- upriver stretch is too low: /thingstodo/paddle-pruitt-to-hasty.htm.
  -- Keep Ozark on Ponca until the upstream coverage extension is reviewed.
  INSERT INTO public.river_sections(river_id,section_slug,name,description,sort_order,
    primary_gauge_station_id,river_mile_start,river_mile_end)
  SELECT r,'pruitt-hasty','Pruitt to Hasty',
    'An upper Buffalo alternative when conditions upriver are too low. Read the Pruitt gauge; the Little Buffalo joins before Hasty.',
    2,id,29.9,36.7 FROM public.gauge_stations WHERE usgs_site_id='07055680'
  ON CONFLICT(river_id,section_slug) DO UPDATE SET primary_gauge_station_id=excluded.primary_gauge_station_id,
    river_mile_start=excluded.river_mile_start,river_mile_end=excluded.river_mile_end;
  UPDATE public.river_sections SET name='Middle (Hasty to Gilbert / Tyler Bend)',sort_order=3
    WHERE river_id=r AND section_slug='middle-pruitt-gilbert';
  UPDATE public.river_sections SET sort_order=4 WHERE river_id=r AND section_slug='lower-gilbert-buffalocity';

  -- Gauge locations on the same guide-mile scale as the access points.
  -- Boxley/Hwy21, Ponca, Pruitt/Hwy7, St.Joe/Hwy65, Harriet/Hwy14.
  UPDATE public.river_gauges rg SET river_mile=v.mile,updated_at=now()
  FROM (VALUES ('07055646',0.0),('07055660',6.0),('07055680',29.9),
    ('07056000',72.6),('07056700',98.3)) v(site,mile)
  JOIN public.gauge_stations g ON g.usgs_site_id=v.site
  WHERE rg.river_id=r AND rg.gauge_station_id=g.id;

  -- Preserve the provider's observed timestamp; never manufacture a reading.
  -- Seed history from the existing national snapshot until the curated cron
  -- polls it. The segment RPC reads this tier, while /api/gauges reads both.
  INSERT INTO public.gauge_readings(gauge_station_id,gauge_height_ft,discharge_cfs,reading_timestamp,qualifiers)
  SELECT l.gauge_station_id,l.gauge_height_ft,l.discharge_cfs,l.reading_timestamp,l.qualifiers
  FROM public.gauge_latest l JOIN public.gauge_stations g ON g.id=l.gauge_station_id
  WHERE g.usgs_site_id='07055680' AND l.reading_timestamp IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.gauge_readings old WHERE old.gauge_station_id=l.gauge_station_id AND old.reading_timestamp=l.reading_timestamp);
END $$;
DO $$ DECLARE wrong integer; BEGIN
if not exists (select 1 from public.rivers where slug='buffalo') then return; end if;
select count(*) into wrong from (values (0.0,'07055646'),(6.0,'07055660'),(8.7,'07055660'),(27.8,'07055660'),(29.9,'07055680'),(36.69,'07055680'),(36.7,'07056000'),(76.9,'07056700'),(131.4,'07056700')) v(mile,site)
left join lateral get_river_condition_segment((select id from rivers where slug='buffalo'),p_put_in_mile=>v.mile) c on true where c.gauge_usgs_id is distinct from v.site;
if wrong>0 then raise exception 'Buffalo gauge boundary regression: %', wrong; end if;
END $$;
COMMIT;
