-- Follow-up to the owner's admin approvals, 2026-11-01. Applied to production
-- (ilefwfpvphadsbptiaur) with authorization ("make the necessary mile marker
-- updates or anything I might have missed").
--
-- The owner approved six pending records: Charity Access, Meramec State Park
-- (Lower Ramp), Highway 8 Bridge (Lower) and the three Elk campground beaches.
-- The owner deleted seven: huzzah-ca-highway-e-access, butts-low-water-bridge,
-- county-road-654-bridge-sugar-grove, county-road-bridge, lanagan-access,
-- us-71-bridge-i-49-access and noel-shadow-lake-access-hwy-59-bridge.
--
-- This block:
--   - meramec-state-park-lower-ramp: had no downstream mile. The owner moved
--     the pin; line 109.85 sits between Sappington Bridge (83.2, line 105.22)
--     and Meramec State Park (88.0, line 112.13), which gives 86.4.
--   - Meramec State Park (Lower Ramp) and Highway 8 Bridge (Lower): text
--     without em dashes or "at mile" notes. Both become float endpoints (a
--     launch, and a bridge put-in with roadside parking). Upstream miles are
--     left as the seed sets them.
--   - The three Elk beaches: their public descriptions were research notes
--     (bank directions, "confirm", "candidate", an owner-screenshot pin) and
--     are rewritten for floaters. Miles already fit the river (0.43, 6.55,
--     11.33 against 0.40, 6.67, 11.45 interpolated).
-- Charity Access is NOT changed here: its mile is the owner's decision (see
-- the session notes).
--
-- Compare-and-set on id, slug and updated_at; each update must match one row.

DO $$
DECLARE
  n int;
  r record;
BEGIN
  UPDATE access_points SET
         river_mile_downstream = 86.4,
         is_float_endpoint = true,
         description = 'Second boat launch in Meramec State Park, in the campground area on the left bank. A gravel launch that may be limited to registered campers. Watch for the rock dike on the left bank as you come in. Same park amenities as the upper ramp.',
         facilities = 'Gravel boat launch in the campground area. Park amenities include restrooms, seasonal showers, camping and a camp store. The lower launch may be limited to registered campers; check at the park office.'
   WHERE id = 'cb41f472-dc6e-4e45-ad8d-2548ad99d383' AND slug = 'meramec-state-park-lower-ramp' AND approved
     AND river_mile_downstream IS NULL AND updated_at = '2026-11-01 15:30:53.198813+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'meramec-state-park-lower-ramp: matched %', n; END IF;

  UPDATE access_points SET
         is_float_endpoint = true,
         description = 'State highway bridge. Dry Creek enters from the left just above the bridge, fed by James Spring (more than 1 million gallons a day), so water levels are reliable from here downstream. A private campground with river access is on the right before the bridge.',
         facilities = 'No public facilities at the bridge. A private campground is next door on the right (upstream side); ask there about access and fees.'
   WHERE id = '7f66e136-50d5-411b-bd1f-d6351a78733b' AND slug = 'highway-8-bridge-lower' AND approved
     AND updated_at = '2026-11-01 15:33:13.25615+00';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'highway-8-bridge-lower: matched %', n; END IF;

  FOR r IN SELECT * FROM (VALUES
    ('b35fc21f-cb90-4b24-b9f2-e43dd54fa380'::uuid, 'kozy-kamp-river-access', '2026-11-01 15:38:20.475483+00'::timestamptz,
     'Private campground on the north bank in Pineville, just west of the highway bridge. A campground track leads down to the water.'),
    ('1eba8b35-fb25-4eff-9ea3-9a499adc465d'::uuid, 'trestle-park-river-access', '2026-11-01 15:38:32.423777+00'::timestamptz,
     'Private campground beach on the northeast bank, just below the Elk Springs Road low-water crossing.'),
    ('b634dee8-718d-4c37-8845-9430945b656c'::uuid, 'wayside-campground-river-access', '2026-11-01 15:38:46.281078+00'::timestamptz,
     'Private campground beach on the southwest bank, near the office by the highway. Use the designated beach, not the peninsula tip, and stay above the campground''s no-watercraft boundary. Shadow Lake Dam is about 0.3 miles downstream.')
  ) AS t(id, slug, stamp, descr)
  LOOP
    UPDATE access_points SET description = r.descr
     WHERE id = r.id AND slug = r.slug AND approved AND updated_at = r.stamp;
    GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION '%: matched %', r.slug, n; END IF;
  END LOOP;
END $$;

-- Rollback: the previous text of each field is in the 2026-11-01 session record
-- and, for the Elk beaches, in git history of ../elk.json; the mile was NULL
-- and is_float_endpoint false on the two Huzzah/Meramec rows.
