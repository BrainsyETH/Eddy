-- Two Big River launches at St. Francois State Park, verified 2026-10-27.
-- Evidence and coordinate provenance:
-- scripts/ingestion/access-points/verified-st-francois-access.md
-- Numeric pins: published MoParkFeatures 1261/1262 (third party), checked
-- against Missouri State Parks' official 08/24 map and OSM road/parking layout.
-- https://mostateparks.com/park/st-francois-state-park/boating
-- https://mostateparks.com/media/pdf/st-francois-state-park-map
--
-- This is a scoped correction, not a reimport of the Big River dossier.
-- Keep the existing campground pin and UseDirect facility 83. Two located_at
-- links route its inventory/booking to the launch sheets without merging the
-- three distinct arrivals or enrolling the same campsite inventory twice.

DO $migration$
DECLARE
  v_river_id uuid;
  v_service_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_river_id FROM public.rivers WHERE slug = 'big-river';
  -- A fresh database may not yet have the separately imported river data.
  IF v_river_id IS NULL THEN RETURN; END IF;

  SELECT id INTO STRICT v_service_id FROM public.nearby_services
   WHERE slug = 'st-francois-state-park-campground' AND type = 'campground';
  IF NOT EXISTS (
    SELECT 1 FROM public.campsite_facilities
     WHERE source = 'mo_state_parks' AND source_facility_id = '83'
       AND nearby_service_id = v_service_id AND enabled
  ) OR NOT EXISTS (
    SELECT 1 FROM public.service_rivers
     WHERE river_id = v_river_id AND service_id = v_service_id
  ) THEN
    RAISE EXCEPTION 'St. Francois campground facility/Big River link is missing; nothing changed';
  END IF;

  INSERT INTO public.access_points (
    river_id, name, slug, location_orig, type, types, is_public, ownership,
    managing_agency, official_site_url, description, facilities, amenities,
    directions_override, parking_info, fee_required, fee_notes,
    approved, is_float_endpoint
  ) VALUES
  (
    v_river_id, 'St. Francois State Park Access 2',
    'st-francois-state-park-access-2',
    ST_SetSRID(ST_MakePoint(-90.541217, 37.956417), 4326),
    'access', ARRAY['access'], true, 'State Park', 'State Park',
    'https://mostateparks.com/park/st-francois-state-park/boating',
    'Upstream canoe and kayak access on the Big River in St. Francois State Park, near the Shelter 2 picnic area. Parking and vault toilets are nearby. The park campground is a separate destination within the park; camping reservations are available through Missouri State Parks. Motorized boats are not recommended by the park.',
    'Canoe/kayak river access, parking, vault toilets and picnic area. Campground elsewhere in the park.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Enter St. Francois State Park from US Highway 67 north of Bonne Terre. Follow park roads toward Shelter 2 and the southern river-access picnic loop; use the river-access parking area.',
    'Parking in the river-access picnic area; capacity not verified.',
    false, 'Camping and shelter reservations are separate from day-use river access.',
    false, true
  ),
  (
    v_river_id, 'St. Francois State Park Access 1',
    'st-francois-state-park-access-1',
    ST_SetSRID(ST_MakePoint(-90.5341, 37.966933), 4326),
    'access', ARRAY['access'], true, 'State Park', 'State Park',
    'https://mostateparks.com/park/st-francois-state-park/boating',
    'Downstream canoe and kayak access on the Big River in St. Francois State Park, in the northern day-use picnic area south of the ballfield. Parking and vault toilets are nearby. The park campground is a separate destination within the park; camping reservations are available through Missouri State Parks. Motorized boats are not recommended by the park.',
    'Canoe/kayak river access, parking, vault toilets, picnic area and playground. Campground elsewhere in the park.',
    ARRAY['parking', 'restrooms', 'picnic'],
    'Enter St. Francois State Park from US Highway 67 north of Bonne Terre. Follow the park road to the northern day-use picnic area south of the ballfield and use the river-access parking area.',
    'Parking in the river-access day-use area; capacity not verified.',
    false, 'Camping and shelter reservations are separate from day-use river access.',
    false, true
  ) ON CONFLICT (river_id, slug) DO NOTHING;

  -- On a rerun, never silently approve a conflicting coordinate/launch decision.
  SELECT count(*) INTO v_count
    FROM public.access_points ap
    JOIN (VALUES
      ('st-francois-state-park-access-2', -90.541217, 37.956417),
      ('st-francois-state-park-access-1', -90.5341, 37.966933)
    ) AS expected(slug, lon, lat) ON expected.slug = ap.slug
   WHERE ap.river_id = v_river_id
     AND ST_Equals(ap.location_orig, ST_SetSRID(ST_MakePoint(expected.lon, expected.lat), 4326))
     AND ap.is_float_endpoint AND ap.types = ARRAY['access'];
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'St. Francois access slugs conflict with reviewed pins; nothing changed';
  END IF;

  -- Same geometry-mile calculation as set_access_point_miles_from_geometry,
  -- limited to the new slugs so no other Big River row is changed.
  UPDATE public.access_points ap
     SET river_mile_downstream = s.river_mile,
         river_mile_upstream = GREATEST(r.length_miles - s.river_mile, 0)::numeric(6,2)
    FROM public.rivers r,
         public.access_points target,
         LATERAL public.snap_to_river(target.location_orig, target.river_id) s
   WHERE r.id = v_river_id AND target.river_id = r.id AND ap.id = target.id
     AND target.slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2')
     AND ap.river_mile_downstream IS NULL;

  SELECT count(*) INTO v_count FROM public.access_points
   WHERE river_id = v_river_id
     AND slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2')
     AND location_snap IS NOT NULL AND snap_distance_m <= 250
     AND river_mile_downstream IS NOT NULL;
  IF v_count <> 2 OR NOT EXISTS (
    SELECT 1 FROM public.access_points upstream, public.access_points downstream
     WHERE upstream.river_id = v_river_id AND downstream.river_id = v_river_id
       AND upstream.slug = 'st-francois-state-park-access-2'
       AND downstream.slug = 'st-francois-state-park-access-1'
       AND upstream.river_mile_downstream < downstream.river_mile_downstream
  ) THEN
    RAISE EXCEPTION 'St. Francois snapping/mile-order validation failed; nothing changed';
  END IF;

  UPDATE public.access_points SET approved = true, approved_at = now()
   WHERE river_id = v_river_id AND NOT approved
     AND slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2');

  -- Correct the existing service, preserving its coordinates and live inventory.
  -- The park's camping page supplies this exact park-specific reservation URL.
  -- Old RV count and fee range predate the expansion; do not invent replacements.
  UPDATE public.nearby_services
     SET city = 'Bonne Terre', address_line1 = '8920 U.S. Highway 67 N.',
         zip = '63628-3598',
         description = 'Year-round campground in St. Francois State Park on the Big River near Bonne Terre, with basic, electric and full-hookup sites. A new 63-site section opened October 2, 2026. Showers, water and dump stations are available seasonally. The park has two separate canoe and kayak access areas.',
         reservation_url = 'https://icampmo1.usedirect.com/MSPWeb/#!park/83',
         booking_platform = 'icampmo',
         seasonal_notes = 'Camping is available year-round. Showers and water are available April through October; check the park for current facility availability.',
         season_open_month = 1, season_close_month = 12,
         rv_sites = NULL, fee_range = NULL,
         services_offered = CASE WHEN 'dump_station' = ANY(COALESCE(services_offered, ARRAY[]::public.service_offering[]))
           THEN services_offered ELSE array_append(COALESCE(services_offered, ARRAY[]::public.service_offering[]), 'dump_station') END,
         verified_source = 'https://mostateparks.com/park/st-francois-state-park/camping',
         last_verified_at = now(), updated_at = now()
   WHERE id = v_service_id;

  INSERT INTO public.access_point_services
    (access_point_id, nearby_service_id, relationship, source, verified_at)
  SELECT id, v_service_id, 'located_at',
         'https://mostateparks.com/media/pdf/st-francois-state-park-map', now()
    FROM public.access_points
   WHERE river_id = v_river_id
     AND slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2')
  ON CONFLICT (access_point_id, nearby_service_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.access_point_services aps
    JOIN public.access_points ap ON ap.id = aps.access_point_id
   WHERE ap.river_id = v_river_id AND aps.nearby_service_id = v_service_id
     AND ap.slug IN ('st-francois-state-park-access-1', 'st-francois-state-park-access-2')
     AND aps.relationship = 'located_at';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'St. Francois campground links conflict with reviewed arrivals; nothing changed';
  END IF;
END
$migration$;
