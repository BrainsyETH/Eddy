-- 37 services located by hand research, plus the corrections that research
-- surfaced. Directory coverage 101 -> 138 of 155 (one phantom row deleted).
--
-- Coordinates were researched by the operator (business sites, county listings,
-- agency pages, aggregator map pins) and every one was validated in PostGIS
-- against the river the service serves before being written — all 37 land
-- within 10 miles of their linked river, 26 of them within half a mile.
-- Three researched pins were EXCLUDED because distance cannot prove identity:
-- Song Dog Shuttles (the pin resolves to a different business), Arapaho
-- Campground (name and phone both differ), Driftwood Vacation Rentals (name
-- differs). They stay NULL until the identity question is answered.
--
-- The research also corrected the record, applied below the coordinates:
--   * Cave Country Canoes (Van Buren MO) DOES NOT EXIST — the real business is
--     in Milltown, Indiana, on the Blue River. Row deleted.
--   * Eminence Canoe Rental: no business by this name found; Eminence's real
--     outfitters are all separately listed. Marked permanently_closed.
--   * 3 Bridges Raft Rental and Three Rivers Outfitters: both verified ACTIVE
--     (59 and 75 recent reviews) — the unverified flag was wrong. Three Rivers
--     is actually named "Three River Outfitters".
--   * Silver Arrow: active NPS concessioner since 1968, at Pulltite/Salem —
--     never Van Buren.
--   * Ruby's Landing is on the GASCONADE at Waynesville, not the Big Piney at
--     Jerome; River Ridge Cabins is on the Current at Van Buren, not the Jacks
--     Fork at Eminence. Both river links corrected. BSC Outdoors sits at the
--     Big Piney/Gasconade confluence and floats both; Gasconade link added.
--   * Six businesses were filed under the wrong town (Stay Current River, OA
--     Rental, River Ridge, RiverTime -> Van Buren; Cherokee Landing -> Bonne
--     Terre; BSC -> Dixon; also Glenwood/Norman/Hindsville/Bourbon/Devils
--     Elbow corrections). City rows updated with the coordinates.
--
-- Coordinate UPDATEs are guarded on latitude IS NULL; discovered address/phone
-- details fill only empty columns (coalesce), never overwrite.

-- Richard's Canoe Rental — 1.72 mi from Eleven Point; new operator since 2022
UPDATE nearby_services SET latitude = 36.7717987,
  longitude = -91.3495112,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '22833 MO-19')
 WHERE id = 'fa38f759-7d05-4fa5-8d91-a880a6475bd9' AND latitude IS NULL;

-- Camp River Campground — 5.52 mi from Eleven Point; also runs shuttles
UPDATE nearby_services SET latitude = 36.7138901,
  longitude = -91.3757529,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '682 Co Rd AA'),
  phone = coalesce(phone, '417-372-0839')
 WHERE id = 'b8838d22-09b6-42f0-ad83-b43e4daaffd6' AND latitude IS NULL;

-- Eleven Point Cottages — in Alton town, 6.54 mi from the river
UPDATE nearby_services SET latitude = 36.69136,
  longitude = -91.3984963,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '503 Andrews St'),
  phone = coalesce(phone, '417-270-2497')
 WHERE id = '527cc7f1-b4ac-46dc-9846-52454412b19c' AND latitude IS NULL;

-- Hufstedler's Canoe Rental & Campground — at Riverton Access, 0.26 mi; new owner 2024
UPDATE nearby_services SET latitude = 36.6479209,
  longitude = -91.1959435,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '33200 US-160')
 WHERE id = '84c956e7-84aa-42be-8d71-ed654454183e' AND latitude IS NULL;

-- Briarwood Cabins — no street number; 3.22 mi from Eleven Point
UPDATE nearby_services SET latitude = 36.7106794,
  longitude = -91.2883248,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, 'Co Rd AA'),
  phone = coalesce(phone, '417-778-7305')
 WHERE id = '4c6796c6-56c1-4180-b23d-a86ea88b2de7' AND latitude IS NULL;

-- Caddo River Access RV Park — 0.11 mi from the Caddo
UPDATE nearby_services SET latitude = 34.3205129,
  longitude = -93.5483685,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '56 US-70 E'),
  city = 'Glenwood'
 WHERE id = 'da09028e-0814-4a76-8e67-87e535b60ea7' AND latitude IS NULL;

-- Caddo River Cabins — trades as Sundancer Caddo River Cabin Rental; phone matches
UPDATE nearby_services SET latitude = 34.3136189,
  longitude = -93.5187653,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '80 Peach Tree Ln'),
  city = 'Glenwood'
 WHERE id = 'b9d89c89-3410-489a-a964-311076d9d3d7' AND latitude IS NULL;

-- Caddo River Ranch — 0.20 mi from the Caddo
UPDATE nearby_services SET latitude = 34.4291191,
  longitude = -93.635504,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '1985 AR-8'),
  city = 'Norman'
 WHERE id = '0abd7e82-7eb1-425d-bd99-f3d5c2afe44e' AND latitude IS NULL;

-- Fancy Hill Cabins & RV Park — on Jack Creek, 5.67 mi from the Caddo — within bound
UPDATE nearby_services SET latitude = 34.3671975,
  longitude = -93.7662992,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '96 Peace Valley Rd')
 WHERE id = '1baa41b9-c5b2-45c6-b7cb-57f484662d88' AND latitude IS NULL;

-- Caddo River Motel & Cabin Rentals — 0.22 mi from the Caddo
UPDATE nearby_services SET latitude = 34.3209814,
  longitude = -93.5563259,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '109 US-70'),
  city = 'Glenwood'
 WHERE id = '7b79aa1d-4355-4425-b2ae-1cda15cbc149' AND latitude IS NULL;

-- Crystal Creek Ranch — 2.03 mi from Jacks Fork
UPDATE nearby_services SET latitude = 37.127619,
  longitude = -91.4019781,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '16660 Crystal Creek Rd'),
  phone = coalesce(phone, '573-226-2222')
 WHERE id = '8c8f36ca-328b-481b-ab97-9a2fef156b56' AND latitude IS NULL;

-- Riverside Motel & River Cabins — 0.18 mi, by the Jacks Fork bridge
UPDATE nearby_services SET latitude = 37.1574431,
  longitude = -91.3588121,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '19159 MO-19')
 WHERE id = '0c56615a-6771-400f-8cf3-8461c440c27d' AND latitude IS NULL;

-- Stay Current River — filed under Eminence, is in Van Buren; 0.13 mi from the Current
UPDATE nearby_services SET latitude = 37.0167831,
  longitude = -91.0332222,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '604 Deer Run'),
  city = 'Van Buren'
 WHERE id = 'd3f58b00-69ee-4b75-98f2-9de171a28394' AND latitude IS NULL;

-- Hidden Ridge Cabins — pin is the cabins; Google driving route known wrong. Active per reviews
UPDATE nearby_services SET latitude = 37.1215659,
  longitude = -91.3328944,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now()
 WHERE id = '0fad6ba9-80bd-4fb4-83ff-d7d6ca2c4144' AND latitude IS NULL;

-- OA Rental Properties — filed under Eminence, is in Van Buren
UPDATE nearby_services SET latitude = 37.0070266,
  longitude = -91.0453414,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '2309 Carter Route M'),
  city = 'Van Buren',
  phone = coalesce(phone, '573-996-8980')
 WHERE id = '21a3888d-9708-426f-b46b-ac0c5ced15b8' AND latitude IS NULL;

-- River Ridge Cabins — filed under Eminence, is in Van Buren adjacent to OA Rental; river link corrected below
UPDATE nearby_services SET latitude = 37.0053188,
  longitude = -91.0462344,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '2031 Carter Hwy M'),
  city = 'Van Buren'
 WHERE id = '67790bb6-7c3e-4c4d-ba74-34c03acae1e1' AND latitude IS NULL;

-- RiverTime RV — filed under Eminence, is in Van Buren; 1.11 mi from the Current
UPDATE nearby_services SET latitude = 37.0116246,
  longitude = -90.9990322,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '1802 Gossett Ln'),
  city = 'Van Buren'
 WHERE id = 'f8a53adb-b767-4426-aefa-cd591570e8c9' AND latitude IS NULL;

-- Shawnee Creek Cottages — MO-106 ~2 mi E of Eminence; no street number
UPDATE nearby_services SET latitude = 37.1484249,
  longitude = -91.3357815,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now()
 WHERE id = 'ff6a7a66-252c-4197-a9f6-fa682531847e' AND latitude IS NULL;

-- Story's Creek Campground — trades as Story’s Creek Horse & UTV Campground
UPDATE nearby_services SET latitude = 37.162439,
  longitude = -91.3755898,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '19133 CR 305')
 WHERE id = '0889c522-d39f-487f-9696-82e3173a15eb' AND latitude IS NULL;

-- Crooked Creek Adventures — 9.57 mi from Crooked Creek, 2.17 from the Buffalo — base is south of Yellville; river link kept, worth reviewing
UPDATE nearby_services SET latitude = 36.0893739,
  longitude = -92.6067263,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '12758 AR-14')
 WHERE id = '1a8422f6-9d3f-47b0-a2a5-2740cb2e7d87' AND latitude IS NULL;

-- Fred Berry Conservation Education Center on Crooked Creek — AGFC facility, 0.16 mi from Crooked Creek
UPDATE nearby_services SET latitude = 36.2354922,
  longitude = -92.7126501,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '851 Conservation Ln')
 WHERE id = '33b2dc6b-2b9c-4fc5-85b2-6fd0fd7ef34e' AND latitude IS NULL;

-- 4J Vacation Rentals — 0.11 mi from the Meramec
UPDATE nearby_services SET latitude = 37.9882184,
  longitude = -91.3981817,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '1651 State Hwy T')
 WHERE id = 'cbcd486c-2747-4265-98eb-d637993a13ac' AND latitude IS NULL;

-- Kick'n K Farmhouse — trades as Kick’n K Vacation Rentals
UPDATE nearby_services SET latitude = 37.9938138,
  longitude = -91.4037699,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '3 Farm House Ln')
 WHERE id = '4be61ad2-31d8-400c-b226-7d359a0c29ca' AND latitude IS NULL;

-- Current River Canoe Rental — at Pulltite; phone matches
UPDATE nearby_services SET latitude = 37.333538,
  longitude = -91.4768218,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '31104 County Rd EE-356')
 WHERE id = '2ccb0efd-c586-484f-9bf7-075598dffd27' AND latitude IS NULL;

-- Running River Canoe Rental — phone matches
UPDATE nearby_services SET latitude = 37.3444736,
  longitude = -91.4261993,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '37515 MO-19')
 WHERE id = '80fd805e-5693-43aa-80e9-07b02460c790' AND latitude IS NULL;

-- KC's On The Current — 0.29 mi from the Current at Doniphan
UPDATE nearby_services SET latitude = 36.617164,
  longitude = -90.829729,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '206 Jefferson St')
 WHERE id = '00811924-48cb-4236-aa41-52993b56b448' AND latitude IS NULL;

-- BSC Outdoors — Boiling Spring Campground at the Big Piney/Gasconade confluence; floats both — Gasconade link added below
UPDATE nearby_services SET latitude = 37.88858,
  longitude = -92.042458,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '18700 Cliff Rd'),
  city = 'Dixon'
 WHERE id = '7f2bbae5-5c20-4352-846f-ab8866af4f23' AND latitude IS NULL;

-- Rt 66 Canoe Rental — Route 66 Canoe Rental at Devil’s Elbow, 0.05 mi from the Big Piney; operating but reviews describe it as shaky
UPDATE nearby_services SET latitude = 37.8653984,
  longitude = -92.0615921,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '20105 Trophy Ln'),
  city = 'Devils Elbow'
 WHERE id = 'eadb2654-fdc5-4e85-abcd-a7113aefaf8e' AND latitude IS NULL;

-- Ruby's Landing — on the GASCONADE off Hwy 17, not the Big Piney at Jerome — river link corrected below
UPDATE nearby_services SET latitude = 37.872034,
  longitude = -92.253898,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '22474 Restful Ln'),
  city = 'Waynesville'
 WHERE id = 'fa11c49e-62ab-42f4-926e-c7c1902d1760' AND latitude IS NULL;

-- Twin Bridges Canoe & Campground — 0.06 mi from the North Fork at the Hwy 14/181 junction, matching the business’s own location description; an aggregator phone mismatch is unresolved
UPDATE nearby_services SET latitude = 36.8103509,
  longitude = -92.1484557,
  geocode_precision = 'approximate',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '49912 E State Highway 14')
 WHERE id = '7d176104-97f2-44ed-af42-bfb462fd297e' AND latitude IS NULL;

-- Cherokee Landing — filed under De Soto, is in Bonne Terre; 0.09 mi from Big River
UPDATE nearby_services SET latitude = 37.953935,
  longitude = -90.552859,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '8344 Berry Rd'),
  city = 'Bonne Terre'
 WHERE id = 'eb209b40-1cef-4372-baff-771322e5191f' AND latitude IS NULL;

-- OAR War Eagle Kayak & Campground — phone matches
UPDATE nearby_services SET latitude = 36.147354,
  longitude = -93.7386504,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '191 Madison 8568')
 WHERE id = '07be2236-7986-4778-8958-1c6fd8109c78' AND latitude IS NULL;

-- War Eagle Canoeing & Camping (War Eagle R.V. Resort) — filed under Huntsville, is in Hindsville; phone matches
UPDATE nearby_services SET latitude = 36.2067513,
  longitude = -93.863238,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, 'Madison 8340'),
  city = 'Hindsville'
 WHERE id = '6600fe14-3022-4a95-85ea-9a488cc02d79' AND latitude IS NULL;

-- Meramec Park Concessions — the concession building inside Meramec State Park, not the park centroid
UPDATE nearby_services SET latitude = 38.2169428,
  longitude = -91.0915645,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '670 Fisher Cave Dr')
 WHERE id = '687339a2-6559-4101-b1c9-f1288956ed9f' AND latitude IS NULL;

-- 3 Bridges Raft Rental — status corrected below: verified active, 59 reviews
UPDATE nearby_services SET latitude = 38.1610374,
  longitude = -91.1224365,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '2370 Sappington Bridge Rd'),
  city = 'Bourbon',
  phone = coalesce(phone, '573-468-7238')
 WHERE id = '9d894e4b-888d-4e26-8c30-a0a242ee92d1' AND latitude IS NULL;

-- Three Rivers Outfitters — status + name corrected below: verified active, 75 reviews
UPDATE nearby_services SET latitude = 36.3175686,
  longitude = -91.4854438,
  geocode_precision = 'exact',
  geocode_source = 'hand_research',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '400 Church St'),
  phone = coalesce(phone, '870-856-4945')
 WHERE id = '384e4cd7-0de5-49b7-8fbb-72ac58a9ea6a' AND latitude IS NULL;

-- Silver Arrow Canoe Rental — NPS concessioner since 1968; filed under Van Buren, is 14 mi S of Salem on Hwy 19; 5.45 mi from the Current
UPDATE nearby_services SET latitude = 37.438981871295,
  longitude = -91.4661129545,
  geocode_precision = 'exact',
  geocode_source = 'census',
  geocoded_at = now(),
  address_line1 = coalesce(address_line1, '17685 S Highway 19'),
  city = 'Salem',
  phone = coalesce(phone, '573-323-4657')
 WHERE id = 'b43fd737-7174-49d0-be2e-ca6609ea339e' AND latitude IS NULL;


-- ── Corrections ───────────────────────────────────────────────────────────

-- Cave Country Canoes (Van Buren MO) does not exist; remove the phantom row.
DELETE FROM service_rivers WHERE service_id = 'dcb23890-00d1-4c6a-a330-76cc89ecd3e7';
DELETE FROM nearby_services WHERE id = 'dcb23890-00d1-4c6a-a330-76cc89ecd3e7';

-- Eminence Canoe Rental: no such business found; likely defunct or renamed.
UPDATE nearby_services SET status = 'permanently_closed'
 WHERE id = '92124047-cc83-4658-9bab-4637d85698ad';

-- Verified still operating; the unverified flag was stale.
UPDATE nearby_services SET status = 'active'
 WHERE id IN ('9d894e4b-888d-4e26-8c30-a0a242ee92d1',  -- 3 Bridges Raft Rental
              '384e4cd7-0de5-49b7-8fbb-72ac58a9ea6a',  -- Three River Outfitters
              'b43fd737-7174-49d0-be2e-ca6609ea339e',  -- Silver Arrow
              '0fad6ba9-80bd-4fb4-83ff-d7d6ca2c4144'); -- Hidden Ridge Cabins

-- The business's actual name is singular.
UPDATE nearby_services SET name = 'Three River Outfitters'
 WHERE id = '384e4cd7-0de5-49b7-8fbb-72ac58a9ea6a';

-- Ruby's Landing serves the Gasconade, not the Big Piney.
UPDATE service_rivers
   SET river_id = (SELECT id FROM rivers WHERE name = 'Gasconade River')
 WHERE service_id = 'fa11c49e-62ab-42f4-926e-c7c1902d1760'
   AND river_id = (SELECT id FROM rivers WHERE name = 'Big Piney River');

-- River Ridge Cabins is on the Current at Van Buren, not the Jacks Fork.
UPDATE service_rivers
   SET river_id = (SELECT id FROM rivers WHERE name = 'Current River')
 WHERE service_id = '67790bb6-7c3e-4c4d-ba74-34c03acae1e1'
   AND river_id = (SELECT id FROM rivers WHERE name = 'Jacks Fork River');

-- BSC Outdoors floats the Gasconade as well as the Big Piney.
INSERT INTO service_rivers (service_id, river_id)
SELECT '7f2bbae5-5c20-4352-846f-ab8866af4f23', r.id
  FROM rivers r
 WHERE r.name = 'Gasconade River'
   AND NOT EXISTS (SELECT 1 FROM service_rivers sr
                    WHERE sr.service_id = '7f2bbae5-5c20-4352-846f-ab8866af4f23'
                      AND sr.river_id = r.id);
