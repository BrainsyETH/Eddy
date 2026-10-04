-- Operator identifies the Low Water Bridge beside Trestle Park:
-- https://kozykamp.com/ (Trestle Park location description)
-- Location corroborated by the operator property map, owner screenshot and
-- USGS georeferenced imagery (2026-10-04 review; not a field survey).
-- See scripts/ingestion/elk-trestle-crossing.json for reproducible placement.
SET LOCAL search_path = public, extensions, pg_temp;
DO $$
DECLARE
  elk_id uuid;
  crossing geometry := ST_SetSRID(ST_MakePoint(-94.454712,36.58491),4326);
  crossing_mile numeric;
  snap_m double precision;
BEGIN
  SELECT id, round((ST_LineLocatePoint(geom,crossing)*length_miles)::numeric,2),
    ST_Distance(geom::geography,crossing::geography)
  INTO STRICT elk_id, crossing_mile, snap_m
  FROM rivers WHERE slug='elk' AND NOT active AND geometry_starts_at_headwaters FOR UPDATE;
  IF crossing_mile NOT BETWEEN 6.3 AND 6.8 OR snap_m > 50 THEN
    RAISE EXCEPTION 'Re-review Trestle crossing against changed Elk geometry';
  END IF;
  IF EXISTS (SELECT 1 FROM river_hazards WHERE river_id=elk_id
    AND name='Elk Springs Road low-water crossing') THEN
    RAISE EXCEPTION 'Trestle crossing already exists; inspect before adding';
  END IF;
  INSERT INTO river_hazards(river_id,name,type,location,river_mile_downstream,
    description,severity,portage_required,portage_side,active)
  VALUES(elk_id,'Elk Springs Road low-water crossing','other',crossing,crossing_mile,
    'Low-water road crossing beside Trestle Park. Confirm the passage and landing arrangement with the operator.',
    'warning',NULL,NULL,true);
  -- No portage claim, access approval, river activation or inferred safe level.
END $$;
