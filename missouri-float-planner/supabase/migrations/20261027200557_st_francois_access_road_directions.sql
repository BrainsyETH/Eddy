-- Follow-up from the public-page smoke test of 20261027195705.
-- directions_override is used as a map URL/destination by clients. Store
-- approach prose in road_access so navigation falls back to verified pins.
DO $migration$
DECLARE
  v_river_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_river_id FROM public.rivers WHERE slug = 'big-river';
  IF v_river_id IS NULL THEN RETURN; END IF;

  UPDATE public.access_points
     SET road_access = COALESCE(road_access, directions_override),
         directions_override = NULL
   WHERE river_id = v_river_id
     AND slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2')
     AND directions_override LIKE 'Enter St. Francois State Park from US Highway 67%';

  SELECT count(*) INTO v_count FROM public.access_points
   WHERE river_id = v_river_id
     AND slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2')
     AND directions_override IS NULL
     AND road_access LIKE 'Enter St. Francois State Park from US Highway 67%';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'St. Francois road directions differ from the reviewed rows; nothing changed';
  END IF;
END
$migration$;
