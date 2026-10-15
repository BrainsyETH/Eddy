-- Verified 2026-10-11 against MDC's area maps, live GIS, and published
-- A Paddler's Guide to Missouri. Correct two facts without rebasing the
-- editorial mile index or claiming the unresolved private-launch mile.
--
-- Bennett Spring: MDC Boat Ramps layer 17, OBJECTID 129 / Area_ID 6320,
-- concrete ramp at (-92.8603577757395, 37.74476977715927). The area map
-- distinguishes this northern concrete ramp from two upstream canoe launches.
-- The previous pin is 1,254 m south of the concrete ramp, above Hwy 64.
-- https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17
-- https://mdc.mo.gov/sites/default/files/2024-05/6320map.pdf
--
-- Lead Mine: the guide puts the access at 53.7; 53.9 is Jakes Creek.
-- Its existing pin is within 14 m of MDC Boat Ramps OBJECTID 132, confirming
-- the identity. Preserve that pin and Herrick Ford's published 54.3.
-- https://rivers.moherp.org/maps/28.pdf (MDC guide pp. 40-41)
-- https://mdc.mo.gov/sites/default/files/2024-09/8024map_0.pdf
--
-- Expected outcome: Niangua's three implausible pairs become one. Riverfront
-- still needs its own launch-mile verification; its finding stays OPEN.
DO $$
DECLARE
  bennett public.access_points%ROWTYPE;
  lead_mine public.access_points%ROWTYPE;
  before_detail text;
  after_detail text;
  finding record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.access_points) THEN
    RAISE NOTICE 'Empty access_points: no editorial data to correct';
    RETURN;
  END IF;

  SELECT ap.* INTO STRICT bennett FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'niangua' AND ap.slug = 'bennett-spring-access'
    FOR UPDATE OF ap;
  SELECT ap.* INTO STRICT lead_mine FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
    WHERE r.slug = 'niangua' AND ap.slug = 'lead-mine-access'
    FOR UPDATE OF ap;

  IF bennett.name IS DISTINCT FROM 'Bennett Spring Access'
     OR bennett.river_mile_downstream IS DISTINCT FROM 30.20::numeric
     OR bennett.approved IS DISTINCT FROM true
     OR bennett.is_float_endpoint IS DISTINCT FROM true
     OR bennett.types IS DISTINCT FROM ARRAY['access','boat_ramp']::text[]
     OR bennett.location_orig IS NULL
     OR NOT ST_DWithin(bennett.location_orig::geography,
       ST_SetSRID(ST_MakePoint(-92.861007041,37.733483969),4326)::geography,0.1)
     OR lead_mine.name IS DISTINCT FROM 'Lead Mine Access'
     OR lead_mine.river_mile_downstream IS DISTINCT FROM 53.90::numeric
     OR lead_mine.approved IS DISTINCT FROM true
     OR lead_mine.is_float_endpoint IS DISTINCT FROM true
     OR lead_mine.types IS DISTINCT FROM ARRAY['access','boat_ramp']::text[]
     OR lead_mine.location_orig IS NULL
     OR NOT ST_DWithin(lead_mine.location_orig::geography,
       ST_SetSRID(ST_MakePoint(-92.897735497,37.863601308),4326)::geography,0.1) THEN
    RAISE EXCEPTION 'Reviewed Niangua access state changed; recheck sources';
  END IF;

  SELECT detail INTO STRICT before_detail FROM public.validate_river_data()
    WHERE river_slug='niangua' AND check_name='mileage_segment_implausible';
  IF before_detail NOT LIKE '3 segment(s)%' THEN
    RAISE EXCEPTION 'Expected three Niangua mileage defects, got %', before_detail;
  END IF;

  UPDATE public.access_points SET
    location_orig=ST_SetSRID(ST_MakePoint(-92.8603577757395,37.74476977715927),4326),
    updated_at=now() WHERE id=bennett.id;
  UPDATE public.access_points SET river_mile_downstream=53.70, updated_at=now()
    WHERE id=lead_mine.id;

  IF NOT EXISTS (SELECT 1 FROM public.access_points
      WHERE id=bennett.id AND location_snap IS NOT NULL AND snap_distance_m < 100
        AND river_mile_downstream=30.20)
     OR NOT EXISTS (SELECT 1 FROM public.access_points
      WHERE id=lead_mine.id AND river_mile_downstream=53.70
        AND ST_Equals(location_orig,lead_mine.location_orig)) THEN
    RAISE EXCEPTION 'Correction failed its pin/mile invariants';
  END IF;

  SELECT detail INTO STRICT after_detail FROM public.validate_river_data()
    WHERE river_slug='niangua' AND check_name='mileage_segment_implausible';
  IF after_detail NOT LIKE '1 segment(s)%'
     OR position('"Riverfront Campground & Canoe" to "Bennett Spring Access"' in after_detail)=0
     OR EXISTS (SELECT 1 FROM public.validate_river_data()
        WHERE river_slug='niangua' AND check_name IN
          ('access_point_offline','mileage_order_mismatch')) THEN
    RAISE EXCEPTION 'Unexpected Niangua validation result: %', after_detail;
  END IF;

  INSERT INTO public.admin_activity_log(action,entity_type,entity_id,entity_name,details)
    VALUES
    ('access_point_update','access_point',bennett.id,bennett.name,
      jsonb_build_object('reason','MDC concrete-ramp coordinate verified 2026-10-11',
        'source','https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/Area_Feature_Layers/FeatureServer/17',
        'sourceObjectId',129,'before',ST_AsGeoJSON(bennett.location_orig)::jsonb,
        'after',jsonb_build_object('longitude',-92.8603577757395,'latitude',37.74476977715927))),
    ('access_point_update','access_point',lead_mine.id,lead_mine.name,
      jsonb_build_object('reason','MDC guide distinguishes access mile 53.7 from Jakes Creek mile 53.9',
        'source','https://rivers.moherp.org/maps/28.pdf','before',53.90,'after',53.70));

  -- Refresh only this still-open aggregate after exercising its real SQL rule.
  -- Do not manufacture a completed check run or resolve an outstanding defect.
  FOR finding IN SELECT id,title FROM public.trust_findings
    WHERE check_id='validate_river_data' AND entity_type='river'
      AND entity_key='niangua' AND rule_key='mileage_segment_implausible'
      AND status='open'
  LOOP
    UPDATE public.trust_findings SET detail=after_detail WHERE id=finding.id;
    INSERT INTO public.admin_activity_log(action,entity_type,entity_id,entity_name,details)
      VALUES ('trust_finding_update','trust_finding',finding.id,finding.title,
        jsonb_build_object('reason','Source-verified partial repair; remaining Riverfront mileage requires review',
          'before',before_detail,'after',after_detail,'status','open'));
  END LOOP;
END $$;
