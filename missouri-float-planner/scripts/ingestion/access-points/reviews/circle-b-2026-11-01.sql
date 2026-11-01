-- Circle B Campground & Resort as a private access on the Jacks Fork, 2026-11-01.
-- Applied to production (ilefwfpvphadsbptiaur) at the owner's request.
--
-- The report: iOS drew Circle B only as a campground (its directory row in
-- nearby_services) and the web map did not draw it at all, because there was
-- no access point. The web map draws access points, not directory rows.
--
-- The owner: Circle B is a private access, a campground and a gravel bar.
-- Imported from ../jacks-fork.json (kind access, roles access/campground/
-- gravel_bar, is_public false, ownership private). The pin is on the
-- campground's gravel bar on the inside of the bend, read from Esri World
-- Imagery: 37.158735, -91.365888, 10 m from the river line. The directory row's
-- pin (37.15518, -91.36701) is the office, 294 m from the water.
-- Mile 36.66 (geometry; Jacks Fork miles track the line), between Alley Spring
-- (31.00) and Eminence City Access (37.30).
--
-- Fee: the operator publishes no launch fee, so the text says camping, cabin
-- and rental fees apply and tells non-guests to call (573-226-3618).
--
-- same_place link to the directory row (circle-b-campground), so the app folds
-- the campground marker into this pin and the sheet carries its phone, website
-- and description (accessLayers.ts, linked-services.ts).
--
-- Applied as one transaction: the importer's RPC (same payload
-- import-dossier-access-points.ts --write builds), the importer's --approve
-- checks (a mile, in order, snap <= 250 m), then this.
DO $$
DECLARE
  v_river uuid; v_ap uuid; v_svc uuid; v_tally jsonb; v_mile numeric; v_snap numeric; n int;
BEGIN
  SELECT id INTO v_river FROM rivers WHERE slug = 'jacks-fork';
  SELECT id INTO v_svc FROM nearby_services WHERE slug = 'circle-b-campground' AND id = '51409029-44f4-44d8-8496-b37268bb9dd3';
  IF v_svc IS NULL THEN RAISE EXCEPTION 'circle-b directory row not found'; END IF;
  IF EXISTS (SELECT 1 FROM access_points WHERE river_id = v_river AND slug = 'circle-b-campground') THEN
    RAISE EXCEPTION 'circle-b-campground access point already exists';
  END IF;

  v_tally := apply_access_point_dossier(v_river, $plan$[{"action":"insert","slug":"circle-b-campground","payload":{
    "name":"Circle B Campground & Resort","type":"access",
    "location_orig":{"type":"Point","coordinates":[-91.365888,37.158735]},
    "is_public":false,"ownership":"private","managing_agency":"Private",
    "official_site_url":"https://circlebcampground.com/",
    "description":"Private riverfront campground and resort on the Jacks Fork in Eminence, in a bend about 0.7 river miles above Eminence City Access. The river runs past a large gravel bar along the campground. Cabins, tent and RV camping, canoe rentals, a store and showers.",
    "facilities":"Air-conditioned cabins, tent camping, full-hookup RV sites, canoe and kayak rentals with shuttle, store, showers and laundry. Gravel bar on the river.",
    "road_access":"18823 Circle B Road, Eminence, MO 65466. Through the campground to the gravel bar.",
    "parking_info":"Campground parking.",
    "fee_required":true,
    "fee_notes":"Private campground: camping, cabin and rental fees apply. If you are not a guest, call Circle B at 573-226-3618 before launching or parking and ask what it costs.",
    "is_float_endpoint":true,"types":["access","campground","gravel_bar"]}}]$plan$::jsonb);
  IF (v_tally->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'insert tally %', v_tally; END IF;

  SELECT id, river_mile_downstream, snap_distance_m INTO v_ap, v_mile, v_snap
    FROM access_points WHERE river_id = v_river AND slug = 'circle-b-campground';
  IF v_mile IS NULL OR v_mile <= 31.00 OR v_mile >= 37.30 THEN
    RAISE EXCEPTION 'mile % not between Alley Spring (31.00) and Eminence City Access (37.30)', v_mile;
  END IF;
  IF v_snap IS NULL OR v_snap > 250 THEN RAISE EXCEPTION 'snap % m', v_snap; END IF;

  UPDATE access_points SET
    amenities = '{parking,restrooms,camping,store}',
    local_tips = '<p><strong>Private campground.</strong> Launch from the gravel bar along the campground. If you are not a guest, call Circle B at 573-226-3618 before you launch or park. The public Eminence City Access is about 0.7 river miles downstream.</p><p>Circle B recommends its 8-mile float to Two Rivers.</p>',
    approved = true, approved_at = now()
   WHERE id = v_ap AND NOT approved;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'approve matched %', n; END IF;

  INSERT INTO access_point_services (access_point_id, nearby_service_id, relationship, source, verified_at)
  VALUES (v_ap, v_svc, 'same_place', 'owner', now());
END $$;
-- Result: id 3e7a2875-8824-401f-90a2-1a4f417d2e1c, mile 36.66 (upstream 8.18),
-- snap 10 m, approved, linked same_place.
--
-- Rollback (the link cascades with the row):
--   DELETE FROM access_points WHERE id = '3e7a2875-8824-401f-90a2-1a4f417d2e1c';
