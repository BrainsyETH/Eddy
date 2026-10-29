-- Stage the Norfork tailwater pilot behind 20261029114729_tailwater_pilot_gate.
-- Does not activate the river.
--
-- condition_rating_mode = 'unrated': the release gauge carries no ladder by
-- design (river_gauges_tailwater_rating_provenance), and missing_thresholds
-- otherwise blocks activation.
--
-- Two hazards, so the route is not published with an empty inventory:
--   Norfork Dam (mile 0.00) — upstream of every access. CWMS location
--     Norfork_Dam, the stored geometry's first vertex (20260824232949).
--   Arkansas Highway 5 bridge, Norfork (mile 4.60) — between Bill Ackerman and
--     the takeout. Wikipedia "North Fork Bridge (Arkansas)" gives
--     36.21361, -92.28639, 64 m off the stored channel; the row uses the
--     channel point nearest it. Severity 'info': no agency hazard wording was
--     found for the piers, and issue #1541 asks not to assign an unsupported
--     severity. Neither row claims a restricted-area boundary, a safe release
--     or a portage; posted USACE limits remain an open item in #1541.
SET LOCAL search_path = public, extensions, pg_temp;

DO $$
DECLARE
  norfork_id uuid;
  dam geometry := ST_SetSRID(ST_MakePoint(-92.237552, 36.248211), 4326);
  bridge_ref geometry := ST_SetSRID(ST_MakePoint(-92.28639, 36.21361), 4326);
  bridge geometry;
  dam_mile numeric;
  bridge_mile numeric;
  bridge_snap_m double precision;
  affected integer;
BEGIN
  SELECT id, ST_ClosestPoint(geom, bridge_ref),
    round((ST_LineLocatePoint(ST_LineMerge(geom), dam) * length_miles)::numeric, 2),
    round((ST_LineLocatePoint(ST_LineMerge(geom), bridge_ref) * length_miles)::numeric, 2),
    ST_Distance(geom::geography, bridge_ref::geography)
  INTO STRICT norfork_id, bridge, dam_mile, bridge_mile, bridge_snap_m
  FROM rivers WHERE slug = 'norfork-tailwater' AND NOT active
    AND river_type = 'dam_tailwater' AND controlling_dam_id = 'swl-norfork-dam'
    AND geometry_starts_at_headwaters FOR UPDATE;
  IF dam_mile <> 0 OR bridge_mile NOT BETWEEN 4.4 AND 4.8 OR bridge_snap_m > 100 THEN
    RAISE EXCEPTION 'Re-review Norfork hazard placement against changed geometry';
  END IF;
  -- Unrated means no ladder anywhere, primary or alternate.
  IF EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = norfork_id
      AND cardinality(array_remove(ARRAY[
        rg.level_too_low, rg.level_low, rg.level_optimal_min, rg.level_optimal_max,
        rg.level_high, rg.level_dangerous, rg.alt_level_too_low, rg.alt_level_low,
        rg.alt_level_optimal_min, rg.alt_level_optimal_max, rg.alt_level_high,
        rg.alt_level_dangerous], NULL)) > 0) THEN
    RAISE EXCEPTION 'Norfork gauge carries thresholds; inspect before staging unrated release';
  END IF;
  IF EXISTS (SELECT 1 FROM river_hazards WHERE river_id = norfork_id) THEN
    RAISE EXCEPTION 'Norfork hazards already exist; inspect before adding';
  END IF;

  UPDATE rivers SET condition_rating_mode = 'unrated' WHERE id = norfork_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected one Norfork rating-mode update'; END IF;

  INSERT INTO river_hazards(river_id, name, type, location, river_mile_downstream,
    description, severity, portage_required, portage_side, seasonal_notes, active)
  VALUES
    (norfork_id, 'Norfork Dam', 'other', dam, dam_mile,
     'Norfork Dam, upstream of every access on this river. Do not approach the dam, its outlets or the water directly below it, and follow posted signs and buoys.',
     'danger', NULL, NULL,
     'Releases can raise the river quickly and without local rain. Leave the water if you see or hear it rising.',
     true),
    (norfork_id, 'Highway 5 bridge (Norfork)', 'bridge_piling', bridge, bridge_mile,
     'Arkansas Highway 5 bridge in Norfork, above the takeout. Keep clear of the piers.',
     'info', NULL, NULL, NULL, true);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'Expected two Norfork hazards'; END IF;
END $$;
