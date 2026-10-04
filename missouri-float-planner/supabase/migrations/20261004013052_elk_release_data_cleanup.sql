-- Elk release preparation only. NOT APPLIED; Elk remains inactive.
-- Sources, coordinates, and remaining launch work:
-- scripts/ingestion/elk-release-review-2026-10-04.md
-- Service changes use the existing CSV importer, separately from this migration.

SET LOCAL search_path = public, extensions, pg_temp;

DO $elk$
DECLARE
  elk_id uuid;
  elk_active boolean;
  affected integer;
BEGIN
  SELECT id, active INTO STRICT elk_id, elk_active
  FROM public.rivers WHERE slug = 'elk' FOR UPDATE;
  IF elk_active THEN
    RAISE EXCEPTION 'Elk is already active; re-review this pre-release correction before applying';
  END IF;

  -- These are bridge coordinates, with no verified public landing. Keep their
  -- identities for research; do not silently move a saved endpoint elsewhere.
  UPDATE public.access_points SET
    approved = false, approved_at = NULL, is_float_endpoint = false,
    is_public = false, image_urls = ARRAY[]::text[],
    facilities = 'Highway crossing; public launch, landing and parking have not been verified.',
    description = CASE slug
      WHEN 'us-71-bridge-i-49-access' THEN
        'Held from the planner: the stored location is the I-49/US-71 crossing, not a verified launch. Use the separate City of Pineville access.'
      ELSE
        'Held from the planner: the stored location is the MO-59 bridge, not a verified public landing. Noel City Park is historically described on Butler Creek. Operator landings must be verified separately.'
    END,
    updated_at = now()
  WHERE river_id = elk_id AND slug IN
    ('us-71-bridge-i-49-access', 'noel-shadow-lake-access-hwy-59-bridge');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'Expected two Elk bridge records, found %', affected; END IF;

  UPDATE public.access_points SET
    ownership = 'Unverified', managing_agency = NULL, updated_at = now()
  WHERE river_id = elk_id AND slug = 'noel-shadow-lake-access-hwy-59-bridge';

  UPDATE public.access_points SET
    approved = false, approved_at = NULL, is_float_endpoint = false,
    river_mile_downstream = NULL, river_mile_upstream = NULL,
    ownership = 'City', managing_agency = 'Municipal',
    facilities = 'City-maintained access on Indian Creek, not the Elk mainstem.',
    description = 'Excluded from Elk routes: MDC identifies Lanagan as an Indian Creek access. Retained as a research record for that tributary.',
    updated_at = now()
  WHERE river_id = elk_id AND slug = 'lanagan-access';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Lanagan research record'; END IF;

  UPDATE public.access_points SET
    managing_agency = 'Municipal',
    facilities = 'Boat ramp, parking and privy shown on the MDC area map.',
    description = 'City-maintained Elk River access under an MDC cooperative agreement. Reach the developed launch and parking from Rhine Road.',
    -- The source explicitly restricts this particular photo to MDC use.
    image_urls = ARRAY[]::text[], updated_at = now()
  WHERE river_id = elk_id AND slug = 'city-of-pineville-elk-river-access';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Pineville access'; END IF;

  UPDATE public.access_points SET
    facilities = 'Gravel boat launch and large parking area. Camping is prohibited.',
    description = 'MDC access on the west bank, reached from Highway 59 north of Noel. Restrooms and an accessible trail have not been verified.',
    updated_at = now()
  WHERE river_id = elk_id AND slug = 'mount-shira-access';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Mount Shira access'; END IF;

  UPDATE public.access_points SET
    facilities = 'MDC boat ramp and parking at Highway 43. Camping is prohibited.',
    description = 'Public access on the lower Elk near Tiff City. Trips from above Noel cross Shadow Lake Dam; a through-route portage has not been verified.',
    updated_at = now()
  WHERE river_id = elk_id AND slug = 'cowskin-access';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Cowskin access'; END IF;

  -- Preserve the historic Tiff City numbers and linkage until Noel is calibrated.
  -- Correct only the false NWS provenance: these are the owner's historical
  -- outfitter bands, not flood-stage thresholds and not Noel-stage thresholds.
  UPDATE public.river_gauges rg SET
    threshold_source = 'outfitter',
    threshold_source_url = 'https://www.elkriverfloats.com/river-levels/',
    updated_at = now()
  FROM public.gauge_stations g
  WHERE rg.river_id = elk_id AND rg.gauge_station_id = g.id
    AND g.usgs_site_id = '07189000';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected historic Tiff City link'; END IF;

  UPDATE public.rivers SET
    float_summary = 'The Elk runs from Pineville through Noel, with gravel bars, bluffs and outfitter-supported day floats. Upper trips can become shallow in dry weather; the lower river receives Indian Creek. River-level calibration is being updated for the Noel gauge.',
    float_tip = 'Arrange launch and landing with a public access or outfitter. Plan upper and lower trips separately at Shadow Lake Dam.',
    updated_at = now()
  WHERE id = elk_id;

  UPDATE public.river_characteristics SET
    low_water_meaning = 'Shallow gravel bars can require dragging, particularly above Indian Creek; no Noel-stage cutoff is signed off.',
    rising_water_hazards = 'Rain-driven rises. Shadow Lake Dam separates upper and lower trips.',
    updated_at = now()
  WHERE river_id = elk_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Elk characteristics'; END IF;

  UPDATE public.river_sections SET
    name = 'Elk River: Pineville–Noel and lower Elk to Cowskin',
    description = 'Upper floats run between Pineville and Noel. Lower Elk trips below Shadow Lake Dam to Cowskin require separate access and routing verification. This is not a verified continuous through-route. Eddy miles start at the Big Sugar/Little Sugar confluence; historical combined-creek guide miles use another origin.'
  WHERE river_id = elk_id AND section_slug = 'elk-main';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected Elk main section'; END IF;

  -- Shared vertices from USGS NHD flowlines (retrieved 2026-10-04). These
  -- confluence POIs are not launches, campsites, springs, or land-access grants.
  -- position_source NULL means coordinates supplied by the cited dataset,
  -- rather than field-surveyed or interpolated from a guide mileage.
  INSERT INTO public.points_of_interest
    (river_id, name, slug, description, type, source, latitude, longitude,
     location, river_mile, images, tags, active, is_on_water, raw_data)
  SELECT elk_id, p.name, p.slug, p.description, 'other', 'manual', p.lat, p.lon,
    extensions.ST_SetSRID(extensions.ST_MakePoint(p.lon,p.lat),4326)::extensions.geography,
    round((extensions.ST_LineLocatePoint(r.geom,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p.lon,p.lat),4326)) * r.length_miles)::numeric,2),
    '[]'::jsonb, ARRAY['confluence'], true, true,
    jsonb_build_object('coordinate_method','USGS NHD shared flowline vertex',
      'source_url','https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6',
      'nhd_permanent_identifiers',p.feature_ids,'reviewed_at','2026-10-04',
      'review_file','scripts/ingestion/elk-release-review-2026-10-04.md')
  FROM public.rivers r CROSS JOIN (VALUES
    ('Big Sugar / Little Sugar confluence','elk-big-sugar-little-sugar-confluence',
     'Big Sugar Creek and Little Sugar Creek meet at Pineville to form the Elk River. This is the origin of Eddy''s Elk river-mile index.',
     36.5882863657504,-94.3826795944845,ARRAY['86154253','86154453','86154255']),
    ('Indian Creek confluence','elk-indian-creek-confluence',
     'Indian Creek joins the Elk above the Trestle Park area. This inflow distinguishes the lower float corridor from the upper Pineville reach.',
     36.58150982744679,-94.45037527837668,ARRAY['86154681','86155147','86154679'])
  ) p(name,slug,description,lat,lon,feature_ids)
  WHERE r.id = elk_id
    AND NOT EXISTS (SELECT 1 FROM public.points_of_interest existing
      WHERE existing.river_id = elk_id AND existing.slug = p.slug);
END
$elk$;
