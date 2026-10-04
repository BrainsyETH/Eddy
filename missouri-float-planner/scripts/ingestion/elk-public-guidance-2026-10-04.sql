-- One-time reviewed data correction. Project: ilefwfpvphadsbptiaur.
-- Preview inside BEGIN / ROLLBACK; apply inside BEGIN / COMMIT.
-- No rating thresholds, access eligibility, or portage side changes.
DO $elk_copy$
DECLARE r uuid; changed integer;
BEGIN
  SELECT id INTO STRICT r FROM public.rivers WHERE slug='elk' AND active AND condition_rating_mode='unrated' FOR UPDATE;
  UPDATE public.rivers
  SET float_tip=$copy$The upper Elk can become shallow in dry weather, especially late summer and fall; expect dragging and longer travel times. Mount Shira and Cowskin do not allow camping.$copy$,
      float_summary=$copy$The Elk runs from Pineville through Noel, with public river accesses, gravel bars, bluffs and riverside campgrounds. Upper reaches can become shallow in dry weather; expect dragging and longer travel times. Eddy shows measured Noel stage without recreational condition ratings.$copy$,
      updated_at=now()
  WHERE id=r AND float_tip='Use approved river access points. Mount Shira and Cowskin do not allow camping.';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Elk guidance changed since review'; END IF;

  UPDATE public.river_hazards SET description=$copy$Low-water road crossing beside Trestle Park. Scout from upstream. If there is no clear open channel, or water is flowing into pipes or culverts, land well upstream. Never float into the structure. Carry only on an established route with permission to use it; otherwise end your float above the crossing.$copy$,updated_at=now()
  WHERE id='b6fd803d-c22b-469a-a449-1b49d551bd21' AND river_id=r AND active
    AND description='Low-water road crossing beside Trestle Park. Confirm the passage and landing arrangement with the operator.'
    AND portage_required IS NULL AND portage_side IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Crossing changed since review'; END IF;

  UPDATE public.river_hazards SET severity='danger',description=$copy$Low-head dam at Shadow Lake in Noel. Do not float over the dam or approach its recirculating current. Land well upstream. A portage route and side have not been verified.$copy$,updated_at=now()
  WHERE id='5cdb702d-d2a9-4451-afd7-bd7f0c9469a3' AND river_id=r AND active
    AND type='low_water_dam' AND severity='warning'
    AND description='Low dam near Noel (Shadow Lake). Portage.'
    AND portage_required=true AND portage_side IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Shadow Lake Dam changed since review'; END IF;
END $elk_copy$;
SELECT name,severity,description,portage_required,portage_side FROM public.river_hazards
WHERE river_id='f90f67f2-555f-45c6-92c3-b74006b2bb95' AND active ORDER BY river_mile_downstream;
