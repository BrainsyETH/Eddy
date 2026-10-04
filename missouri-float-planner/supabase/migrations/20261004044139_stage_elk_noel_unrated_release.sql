-- Stage the above-dam, readings-only Elk release. Does not activate the river.
-- Prerequisites: elk_release_data_cleanup and explicit_unrated_river_release.
-- Tiff's exact historical link is archived in scripts/ingestion/elk-tiff-threshold-archive.json.
DO $$
DECLARE
  elk_id uuid;
  noel_id uuid;
  affected integer;
BEGIN
  PERFORM set_config('search_path', 'public, extensions, pg_temp', true);
  SELECT id INTO STRICT elk_id FROM public.rivers WHERE slug = 'elk' AND NOT active FOR UPDATE;
  -- Refuse a partial/out-of-order cleanup or unexpected new link. No broad deletes.
  IF EXISTS (SELECT 1 FROM public.access_points WHERE river_id = elk_id
      AND slug IN ('us-71-bridge-i-49-access', 'noel-shadow-lake-access-hwy-59-bridge')
      AND (approved OR is_float_endpoint)) THEN
    RAISE EXCEPTION 'Apply Elk data cleanup before staging the release';
  END IF;
  IF (SELECT count(*) FROM public.river_gauges WHERE river_id = elk_id) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.river_gauges rg JOIN public.gauge_stations g ON g.id = rg.gauge_station_id
    WHERE rg.river_id = elk_id AND rg.id = '30b8d27f-ab4b-441a-bcf2-5b8fc5d188b7'
      AND g.usgs_site_id = '07189000' AND rg.is_primary AND rg.threshold_unit = 'ft'
      AND rg.threshold_source = 'outfitter' AND rg.level_too_low = 2.5
      AND rg.level_optimal_min = 3.5 AND rg.level_optimal_max = 5 AND rg.level_dangerous = 6
      AND rg.level_low IS NULL AND rg.level_high IS NULL
      AND rg.alt_level_too_low IS NULL AND rg.alt_level_low IS NULL
      AND rg.alt_level_optimal_min IS NULL AND rg.alt_level_optimal_max IS NULL
      AND rg.alt_level_high IS NULL AND rg.alt_level_dangerous IS NULL
  ) THEN RAISE EXCEPTION 'Expected the reviewed historical Tiff link; inspect changed gauge data'; END IF;

  SELECT id INTO STRICT noel_id FROM public.gauge_stations
    WHERE usgs_site_id = '07188925' AND provider = 'usgs' AND active
      AND '00065' = ANY(parameter_codes);

  DELETE FROM public.river_gauges
    WHERE id = '30b8d27f-ab4b-441a-bcf2-5b8fc5d188b7' AND river_id = elk_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected one Tiff link to archive'; END IF;
  -- Neither the station nor its historical observations/stars are deleted.
  INSERT INTO public.river_gauges (
    river_id, gauge_station_id, is_primary, threshold_unit, river_mile,
    level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous,
    alt_level_too_low, alt_level_low, alt_level_optimal_min, alt_level_optimal_max, alt_level_high, alt_level_dangerous,
    threshold_source, threshold_source_url
  ) SELECT elk_id, noel_id, true, 'ft',
    round((ST_LineLocatePoint(ST_LineMerge(r.geom), g.location::geometry) * r.length_miles)::numeric, 2),
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    FROM public.rivers r CROSS JOIN public.gauge_stations g WHERE r.id = elk_id AND g.id = noel_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected one Noel measurement link'; END IF;

  UPDATE public.gauge_stations SET curated = true WHERE id = noel_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Noel curation'; END IF;

  UPDATE public.access_points SET is_float_endpoint = false, updated_at = now()
    WHERE river_id = elk_id AND slug = 'cowskin-access';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Cowskin access'; END IF;
  -- Keep the approved public listing. Shared endpoint resolution now rejects it.
  IF EXISTS (SELECT 1 FROM public.access_points WHERE river_id = elk_id AND approved AND is_float_endpoint
    AND (river_mile_downstream IS NULL OR river_mile_downstream >= 11.61)) THEN
    RAISE EXCEPTION 'Review unexpected endpoint outside the above-dam corridor';
  END IF;

  UPDATE public.rivers SET condition_rating_mode = 'unrated',
    float_summary = 'The Elk runs from Pineville through Noel, with gravel bars, bluffs and outfitter-supported day floats. Eddy shows measured Noel stage without recreational condition ratings. Upper trips can become shallow in dry weather.',
    float_tip = 'Arrange private access with the operator. Initial planner trips end above Shadow Lake Dam.',
    updated_at = now() WHERE id = elk_id;
  UPDATE public.river_sections SET name = 'Elk River: Pineville–Noel above Shadow Lake Dam',
    description = 'Initial corridor from Pineville to private landings in Noel above Shadow Lake Dam. Operator trips connect Kozy Kamp, Trestle Park and Wayside; endpoint review is separate from this gauge transition.',
    primary_gauge_station_id = noel_id, river_mile_start = 0, river_mile_end = 11.61
    WHERE river_id = elk_id AND section_slug = 'elk-main';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected the Elk main section'; END IF;
END $$;
