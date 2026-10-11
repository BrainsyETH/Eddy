-- Applied to production ilefwfpvphadsbptiaur on 2026-10-11.
-- Recorded as 20261011203745; all three corrections verified after application.
-- One DO statement makes the changes atomic; unexpected editorial drift aborts
-- the whole correction. Reapplying the reviewed state is a no-op.
--
-- Rich Fountain (06934000) exists and is active, but has no Gasconade link.
-- USGS places it at 38.388806,-91.819889; Eddy's Rollins Ferry launch is at
-- 38.393556,-91.820345 (~0.53 km straight-line separation).
-- https://waterdata.usgs.gov/monitoring-location/USGS-06934000/
-- This adds a SECONDARY, UNRATED gauge. Do not copy Hazelgreen/Jerome's
-- thresholds or infer a river mile from a straight-line distance. The primary
-- gauge, existing curated links, sections and condition thresholds stay intact.
--
-- AGFC calls the Crooked Creek access Kelley's Slab. Preserve its UUID, slug,
-- coordinates and miles so existing planner URLs/saved routes keep resolving.
-- https://www.agfc.com/things-to-do/water-trails/crooked-creek/
--
-- Dawt: the old active record describes the pre-removal dam and directs users
-- through a right-end chute. USACE authorized partial removal in 2016; reporting
-- with before/after photographs documents about two-thirds removed in Feb 2017.
-- https://www.swl.usace.army.mil/Media/News-Releases/Article/933354/corps-verifies-use-of-nationwide-permit-for-removal-of-a-portion-of-dawt-mill-d/
-- https://ozarkcountytimes.com/dam-comes-down-more-photos-and-information-about-dawt-dam-removal
-- Retire this obsolete warning rather than advertise a present-day portage or
-- chute. This is NOT clearance to navigate the site. Preserve the old pin/mile
-- for audit only: neither was independently verified as part of this review.

DO $review$
DECLARE
  gasconade_id uuid;
  crooked_id uuid;
  north_fork_id uuid;
  station_id uuid;
  slab public.access_points%ROWTYPE;
  dawt public.river_hazards%ROWTYPE;
  retired_description constant text := 'Historical Dawt Mill Dam record retired after review on 2026-10-11. About two-thirds of the dam was removed in February 2017; the former required-portage and right-end-chute instructions are obsolete. Current channel hazards, access permissions, and a safe passage or portage have not been verified. The retained map position and river mile are archival, not current navigation guidance. Source: https://ozarkcountytimes.com/dam-comes-down-more-photos-and-information-about-dawt-dam-removal';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rivers WHERE slug IN ('gasconade', 'crooked-creek', 'north-fork-white')) THEN
    RAISE NOTICE 'Reviewed rivers not seeded; no guide data corrections to apply.';
    RETURN;
  END IF;

  -- Fail on missing/duplicate prerequisites in a populated target dataset.
  SELECT id INTO STRICT gasconade_id FROM public.rivers WHERE slug = 'gasconade' FOR UPDATE;
  SELECT id INTO STRICT crooked_id FROM public.rivers WHERE slug = 'crooked-creek' FOR UPDATE;
  SELECT id INTO STRICT north_fork_id FROM public.rivers WHERE slug = 'north-fork-white' FOR UPDATE;
  SELECT id INTO STRICT station_id FROM public.gauge_stations
    WHERE usgs_site_id = '06934000' AND active
      AND name = 'Gasconade River near Rich Fountain, MO' FOR UPDATE;

  INSERT INTO public.river_gauges (
    river_id, gauge_station_id, is_primary, threshold_unit,
    level_too_low, level_low, level_optimal_min, level_optimal_max,
    level_high, level_dangerous, threshold_source, threshold_source_url
  ) VALUES (
    gasconade_id, station_id, false, 'cfs',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  ) ON CONFLICT (river_id, gauge_station_id) DO NOTHING;

  SELECT * INTO STRICT slab FROM public.access_points
    WHERE river_id = crooked_id AND slug = 'kelly-s-slab-access' FOR UPDATE;
  IF slab.name NOT IN ('Kelly''s Slab Access', 'Kelley''s Slab Access') OR slab.name IS NULL THEN
    RAISE EXCEPTION 'Refusing to overwrite changed Kelley''s Slab name: %', slab.name;
  END IF;
  UPDATE public.access_points SET name = 'Kelley''s Slab Access', updated_at = now()
    WHERE id = slab.id AND name = 'Kelly''s Slab Access';

  SELECT * INTO STRICT dawt FROM public.river_hazards
    WHERE name = 'Dawt Mill Dam' AND river_id = north_fork_id FOR UPDATE;
  IF dawt.active IS FALSE AND dawt.portage_required IS FALSE
    AND dawt.portage_side IS NULL AND dawt.seasonal_notes IS NULL
    AND dawt.description = retired_description THEN
    NULL; -- Already retired by this migration.
  ELSIF dawt.name = 'Dawt Mill Dam' AND dawt.type = 'low_water_dam'
    AND dawt.active IS TRUE AND dawt.portage_required IS TRUE
    AND dawt.portage_side = 'right' AND dawt.river_mile_downstream = 57.5
    AND dawt.updated_at = '2026-07-19T15:26:30.776941+00:00'::timestamptz
    AND dawt.description = 'Dawt Mill Dam, a low dam just above the Tecumseh take-out that backs water up about a quarter mile and is a known canoe-buster. Portage or slide down the shallow chute at the right end (a rough path also goes around the right). A good rapid runs below the dam.' THEN
    UPDATE public.river_hazards
    SET active = false, portage_required = false, portage_side = NULL,
        seasonal_notes = NULL, description = retired_description, updated_at = now()
    WHERE id = dawt.id;
  ELSE
    RAISE EXCEPTION 'Refusing to retire Dawt Mill: the reviewed hazard changed; re-review current evidence.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.river_gauges WHERE river_id = gasconade_id AND gauge_station_id = station_id)
    OR NOT EXISTS (SELECT 1 FROM public.access_points WHERE id = slab.id AND name = 'Kelley''s Slab Access')
    OR NOT EXISTS (SELECT 1 FROM public.river_hazards WHERE id = dawt.id AND active IS FALSE
      AND portage_required IS FALSE AND portage_side IS NULL AND seasonal_notes IS NULL
      AND description = retired_description) THEN
    RAISE EXCEPTION 'River guide data correction verification failed';
  END IF;
END
$review$;
