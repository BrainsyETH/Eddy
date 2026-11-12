-- 20261112170000_beaver_tailwater_lands_inactive.sql
--
-- The White River below Beaver Dam, Arkansas, as its own dam-tailwater river,
-- landed INACTIVE the way 20260824232949 landed the White, Norfork and
-- Taneycomo, and staged unrated the way 20261029115032 staged Norfork.
-- Activation is a separate, owner-directed step (activate-rivers.ts).
--
-- Evidence: scripts/ingestion/reviews/BEAVER_TAILWATER_RESEARCH_2026-11-12.md
-- Identifiers: scripts/ingestion/dossiers/verified-identifiers-tailwater-swl-beaver-dam.md
--
-- Extent: AGFC regulation N1.03 (eff. 2025-01-01) — "White River from 100
-- yards below Beaver Dam to the boat ramp at Houseman Access". Geometry is the
-- NHD HR White River (HUC 11010001) sliced from the CWMS Beaver_Dam location to
-- AGFC facility 792 (Houseman Boat Ramp): 6.99 mi, 23 vertices, emitted by
-- scripts/ingestion/build-tailwater-geometry.ts beaver-tailwater. AGFC
-- publishes 7–7.5 mi.
--
-- Gauge: the dam's total release (CWMS SWL Beaver_Dam), primary, role
-- 'release', cfs, no ladder. No agency publishes a release rating for
-- wading or floating here, so the river is unrated like the other three.
--
-- Deliberately NOT wired: USGS 07049698 (White River near Busch, US 62 bridge)
-- publishes gage height only, and its water surface sits on Table Rock's pool
-- (about 910.3 ft against a 910.0 ft pool on 2026-11-12), so a stage there
-- reads the lake as much as the release. USGS 07049691 at the dam measures
-- temperature and dissolved oxygen only; it belongs in the registry's
-- tailwater block (waterQualitySiteId) when the river is activated, not in
-- river_gauges.
SET LOCAL search_path = public, extensions, pg_temp;

-- ── 1. The river ────────────────────────────────────────────────────────────
INSERT INTO rivers (
    name, slug, geom, length_miles, downstream_point, direction_verified,
    geometry_starts_at_headwaters, description, difficulty_rating, region,
    state, country, timezone, river_type, controlling_dam_id, active,
    weather_city, weather_lat, weather_lon, alert_search_terms
) VALUES (
    'Beaver Tailwater', 'beaver-tailwater',
    ST_GeomFromText('LINESTRING(-93.847461 36.421134, -93.843525 36.422003, -93.838628 36.424839, -93.831562 36.433824, -93.82804 36.433875, -93.822037 36.430016, -93.819703 36.430798, -93.819658 36.432621, -93.821379 36.435521, -93.825411 36.438647, -93.836615 36.442138, -93.83717 36.442825, -93.836382 36.444312, -93.836582 36.446817, -93.834685 36.448313, -93.828562 36.450608, -93.825692 36.450577, -93.822625 36.449091, -93.811766 36.446957, -93.805711 36.44861, -93.804465 36.451241, -93.805238 36.454468, -93.814018 36.463197)', 4326),
    6.99, ST_SetSRID(ST_MakePoint(-93.814018, 36.463197), 4326), true,
    true, 'The White River below Beaver Dam runs about seven miles past Dam Site River Park and the Highway 62 bridge to Houseman Access, where it meets the upper end of Table Rock Lake. Cold releases from Beaver Dam support a trout fishery, and generation can raise the river quickly. A warning horn sounds below the dam when releases start. Fishing, boating and wading are closed within 100 yards of the dam. Dam observations and generation schedules do not establish a safe wading window; check posted signs and current Arkansas Game and Fish Commission trout regulations.',
    'Class I', 'Ozarks',
    'AR', 'US', 'America/Chicago',
    'dam_tailwater', 'swl-beaver-dam', false,
    'Eureka Springs', 36.4405, -93.8338,
    ARRAY['beaver tailwater', 'beaver dam', 'white river', 'busch', 'eureka springs', 'carroll county']::text[]
)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. The release station ──────────────────────────────────────────────────
-- Coordinates are the CWMS Beaver_Dam-Tailwater sub-location (36.4216715,
-- -93.845085), as for the other SWL stations. curated = true: the cron polls
-- only curated stations.
INSERT INTO public.gauge_stations (
    usgs_site_id, site_id_external, provider, name, location, active, curated,
    threshold_descriptions
)
SELECT NULL, 'swl-beaver-dam', 'usace', 'White River below Beaver Dam',
    ST_SetSRID(ST_MakePoint(-93.845085, 36.4216715), 4326), true, true,
    jsonb_build_object(
        'source', 'USACE Little Rock District (CWMS)',
        'note', 'Total release from Beaver Dam. Two generators, about 3,950 cfs each. A warning horn sounds below the dam when generation or spillway releases start. Releases can change without notice.'
    )
WHERE NOT EXISTS (
    SELECT 1 FROM public.gauge_stations gs
    WHERE gs.provider = 'usace' AND gs.site_id_external = 'swl-beaver-dam'
);

INSERT INTO public.river_gauges (river_id, gauge_station_id, is_primary, threshold_unit, role)
SELECT r.id, gs.id, true, 'cfs', 'release'
FROM public.rivers r
JOIN public.gauge_stations gs ON gs.provider = 'usace' AND gs.site_id_external = 'swl-beaver-dam'
WHERE r.slug = 'beaver-tailwater'
  AND NOT EXISTS (
      SELECT 1 FROM public.river_gauges rg
      WHERE rg.river_id = r.id AND rg.gauge_station_id = gs.id
  );

-- ── 3. Unrated, with the fixed hazards mapped ───────────────────────────────
-- Beaver Dam (mile 0.00): AGFC closes fishing, boating and wading within 100
-- yards. US 62 bridge (about mile 4.5): the only road bridge over the river on
-- the reach (OSM way 114223771; USGS 07049698 sits on it). Severity 'info' as
-- for Norfork's Highway 5 bridge: no agency hazard wording found for the piers.
-- Neither row claims a USACE restricted-area boundary, a safe release or a
-- portage.
DO $$
DECLARE
  beaver_id uuid;
  dam geometry := ST_SetSRID(ST_MakePoint(-93.847461, 36.421134), 4326);
  bridge_ref geometry := ST_SetSRID(ST_MakePoint(-93.823641, 36.449064), 4326);
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
  INTO STRICT beaver_id, bridge, dam_mile, bridge_mile, bridge_snap_m
  FROM rivers WHERE slug = 'beaver-tailwater' AND NOT active
    AND river_type = 'dam_tailwater' AND controlling_dam_id = 'swl-beaver-dam'
    AND geometry_starts_at_headwaters FOR UPDATE;
  IF dam_mile <> 0 OR bridge_mile NOT BETWEEN 4.0 AND 5.0 OR bridge_snap_m > 100 THEN
    RAISE EXCEPTION 'Re-review Beaver hazard placement (dam %, bridge % mi, % m off)', dam_mile, bridge_mile, bridge_snap_m;
  END IF;
  IF EXISTS (SELECT 1 FROM river_gauges rg WHERE rg.river_id = beaver_id
      AND cardinality(array_remove(ARRAY[
        rg.level_too_low, rg.level_low, rg.level_optimal_min, rg.level_optimal_max,
        rg.level_high, rg.level_dangerous, rg.alt_level_too_low, rg.alt_level_low,
        rg.alt_level_optimal_min, rg.alt_level_optimal_max, rg.alt_level_high,
        rg.alt_level_dangerous], NULL)) > 0) THEN
    RAISE EXCEPTION 'Beaver gauge carries thresholds; inspect before staging unrated';
  END IF;
  IF EXISTS (SELECT 1 FROM river_hazards h WHERE h.river_id = beaver_id) THEN
    RAISE EXCEPTION 'Beaver hazards already exist; inspect before adding';
  END IF;

  UPDATE rivers SET condition_rating_mode = 'unrated' WHERE id = beaver_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected one Beaver rating-mode update'; END IF;

  INSERT INTO river_hazards(river_id, name, type, location, river_mile_downstream,
    description, severity, portage_required, portage_side, seasonal_notes, active)
  VALUES
    (beaver_id, 'Beaver Dam', 'other', dam, dam_mile,
     'Beaver Dam, upstream of every access on this river. Fishing, boating and wading are closed within 100 yards of the dam. Follow posted signs and buoys.',
     'danger', NULL, NULL,
     'A horn sounds below the dam when generation or spillway releases start. The river can rise quickly without local rain; leave the water when you hear the horn or see it rising.',
     true),
    (beaver_id, 'Highway 62 bridge (Busch)', 'bridge_piling', bridge, bridge_mile,
     'US Highway 62 bridge near Busch, between Bertrand and Houseman. Keep clear of the piers.',
     'info', NULL, NULL, NULL, true);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'Expected two Beaver hazards'; END IF;
END $$;
