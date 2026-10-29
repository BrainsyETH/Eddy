-- Stage the White and Lake Taneycomo tailwaters behind 20261029114729_tailwater_pilot_gate.
-- Does not activate either river.
--
-- Evan decided on 2026-10-29 to publish every approved access point on both
-- rivers ("show access points at the highest level"): 23 float endpoints on the
-- White, 5 on Taneycomo. The pilot gate's scope check holds the dossiers'
-- tailwaterPilot.floatEndpoints to exactly those sets.
--
-- condition_rating_mode = 'unrated' on both: no linked gauge carries a ladder
-- (river_gauges_tailwater_rating_provenance), checked below.
--
-- Dam hazards, placed on the stored geometry's ends, which
-- 20260824232949 anchored on these structures:
--   White      Bull Shoals Dam, mile 0.00 (CWMS Bull_Shoals_Dam)
--   Taneycomo  Table Rock Dam, mile 0.00 (CWMS Table_Rock_Dam)
--   Taneycomo  Powersite Dam, mile 23.11 (USGS 07053820, Lake Taneycomo at
--              Ozark Beach Dam). Empire Park ramp, mile 22.52, is the last
--              take-out above it. No portage route is claimed.
-- No other hazards are asserted. Shoals, bridges and posted dam limits on these
-- rivers have not been reviewed; validate_river_data keeps warning that an
-- inventory this small is not a hazard-free route.
SET LOCAL search_path = public, extensions, pg_temp;

DO $$
DECLARE
  white_id uuid;
  taney_id uuid;
  white_start geometry;
  taney_start geometry;
  taney_end geometry;
  taney_length numeric;
  affected integer;
BEGIN
  SELECT id, ST_StartPoint(ST_LineMerge(geom)) INTO STRICT white_id, white_start
  FROM rivers WHERE slug = 'white' AND NOT active AND river_type = 'dam_tailwater'
    AND controlling_dam_id = 'swl-bull-shoals-dam' AND geometry_starts_at_headwaters FOR UPDATE;
  SELECT id, ST_StartPoint(ST_LineMerge(geom)), ST_EndPoint(ST_LineMerge(geom)), length_miles
  INTO STRICT taney_id, taney_start, taney_end, taney_length
  FROM rivers WHERE slug = 'taneycomo' AND NOT active AND river_type = 'dam_tailwater'
    AND controlling_dam_id = 'swl-table-rock-dam' AND geometry_starts_at_headwaters FOR UPDATE;

  -- The reviewed anchors; a regenerated line must be re-reviewed, not trusted.
  IF ST_Distance(white_start::geography, ST_SetSRID(ST_MakePoint(-92.574858, 36.366063), 4326)::geography) > 50
     OR ST_Distance(taney_start::geography, ST_SetSRID(ST_MakePoint(-93.310229, 36.595254), 4326)::geography) > 50
     OR ST_Distance(taney_end::geography, ST_SetSRID(ST_MakePoint(-93.124555, 36.65891), 4326)::geography) > 50 THEN
    RAISE EXCEPTION 'Re-review dam hazard placement against changed White or Taneycomo geometry';
  END IF;

  IF EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id IN (white_id, taney_id)
      AND cardinality(array_remove(ARRAY[
        rg.level_too_low, rg.level_low, rg.level_optimal_min, rg.level_optimal_max,
        rg.level_high, rg.level_dangerous, rg.alt_level_too_low, rg.alt_level_low,
        rg.alt_level_optimal_min, rg.alt_level_optimal_max, rg.alt_level_high,
        rg.alt_level_dangerous], NULL)) > 0) THEN
    RAISE EXCEPTION 'A White or Taneycomo gauge carries thresholds; inspect before staging unrated release';
  END IF;
  IF EXISTS (SELECT 1 FROM river_hazards WHERE river_id IN (white_id, taney_id)) THEN
    RAISE EXCEPTION 'White or Taneycomo hazards already exist; inspect before adding';
  END IF;

  UPDATE rivers SET condition_rating_mode = 'unrated' WHERE id IN (white_id, taney_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'Expected two rating-mode updates'; END IF;

  INSERT INTO river_hazards(river_id, name, type, location, river_mile_downstream,
    description, severity, portage_required, portage_side, seasonal_notes, active)
  VALUES
    (white_id, 'Bull Shoals Dam', 'other', white_start, 0,
     'Bull Shoals Dam, upstream of every access on this river. Do not approach the dam, its outlets or the water directly below it, and follow posted signs and buoys.',
     'danger', NULL, NULL,
     'Releases can raise the river quickly and without local rain. Leave the water if you see or hear it rising.',
     true),
    (taney_id, 'Table Rock Dam', 'other', taney_start, 0,
     'Table Rock Dam, upstream of every access on Lake Taneycomo. Do not approach the dam, its outlets or the water directly below it, and follow posted signs and buoys.',
     'danger', NULL, NULL,
     'Releases can raise the water quickly and without local rain. Leave the water if you see or hear it rising.',
     true),
    (taney_id, 'Powersite Dam (Ozark Beach)', 'other', taney_end, taney_length,
     'Powersite Dam ends Lake Taneycomo at Ozark Beach. Empire Park ramp is the last take-out above it. Do not approach the dam.',
     'danger', NULL, NULL, NULL, true);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 3 THEN RAISE EXCEPTION 'Expected three dam hazards'; END IF;
END $$;
