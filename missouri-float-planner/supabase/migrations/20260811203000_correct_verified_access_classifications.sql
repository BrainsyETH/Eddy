-- Correct four access records after an owner review and primary-source check.
--
-- Sources checked 2026-08-11:
--   Montauk State Park:
--     https://mostateparks.com/page/montauk-state-park/park-history-montauk
--     https://www.nps.gov/ozar/learn/management/ozar-superintendent-s-compendium.htm
--   Ha Ha Tonka:
--     https://mostateparks.com/park/ha-ha-tonka/boating
--   Lower Big Niangua access notes:
--     https://lakeoftheozarks.missourimn.org/assets/OutreachEducation/bnrt/bnrt_poi.php
--   Mother Nature's Riverfront Retreat:
--     https://www.mothernaturesriverfrontretreat.com/index.html
--
-- No gauge or threshold data is changed here. Jacks Fork is awaiting upstream
-- USGS work, and Roselle/ROZM7 was confirmed live before this migration was
-- written (the 2026-08-11 reading is present in gauge_readings).

-- Montauk State Park is a park/campground near the Current headwaters, not a
-- river landing. Missouri State Parks puts canoe access outside the park's
-- southeast boundary; NPS designates Tan Vat, which Eddy already carries as a
-- separate approved access. Unapproving this duplicate removes a false launch
-- without removing the real Tan Vat endpoint or the nearby-services park row.
UPDATE public.access_points ap
   SET approved = FALSE,
       type = 'park',
       types = ARRAY['park', 'campground']::text[],
       fee_required = FALSE,
       fee_notes = 'No river launch at the state park. Use the designated Tan Vat landing outside the southeast boundary; private vessels float free within Ozark National Scenic Riverways.',
       description = 'State park and campground at the Current River headwaters. This record is not a put-in or take-out; designated canoe access is outside the park at Tan Vat.',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'montauk-state-park';

-- Whistle Bridge is a real low-water-crossing access, but not public land with
-- parking. The county crossing is surrounded by private property. Keep it as a
-- manually selectable private endpoint while removing it from public/social
-- route generation and removing the false parking claim.
UPDATE public.access_points ap
   SET is_public = FALSE,
       ownership = 'County road crossing; adjacent land is private',
       amenities = ARRAY[]::text[],
       parking_info = 'No public parking. Drop-off or pickup only where lawful; do not park on or cross adjacent private property.',
       parking_capacity = NULL,
       description = 'Low-water concrete crossing at Whistle Road and Tunnel Dam Road. It can serve as a river access, but there is no public parking and the surrounding land is private. Use only for a lawful drop-off/pickup and do not enter adjacent property.',
       facilities = 'Low-water crossing only. No public parking or other amenities.',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'niangua'
   AND ap.slug = 'whistle-bridge';

-- The existing Mother Nature's point is the private Family Side: the beach,
-- ramp, campground and return point about two river miles below Whistle Bridge.
-- The operator also describes a distinct Wild Side take-out farther downstream,
-- but no source publishes a verified coordinate for it, so this migration does
-- not invent a second pin.
UPDATE public.access_points ap
   SET type = 'campground',
       types = ARRAY['campground', 'access', 'boat_ramp', 'gravel_bar']::text[],
       is_public = FALSE,
       ownership = 'private',
       amenities = ARRAY['parking', 'restrooms', 'camping', 'boat_ramp']::text[],
       parking_info = 'Private campground parking at the Family Side access. Parking, beach access and shuttles may require a fee; arrange access with the operator.',
       description = 'Mother Nature''s private Family Side access, about two river miles below Whistle Bridge. The riverfront campground has a gravel beach, boat ramp, primitive camping, electric/RV sites, rentals and shuttle service. This is separate from the operator''s Wild Side take-out farther downstream.',
       facilities = 'Gravel beach and boat ramp; primitive campsites; electric and full-hookup RV sites; shower house; rentals and shuttle service.',
       fee_required = TRUE,
       fee_notes = 'Private access. Camping, parking, beach access, rentals and shuttle fees may apply; call ahead.',
       official_site_url = 'https://www.mothernaturesriverfrontretreat.com/',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'niangua'
   AND ap.name = 'Mother Nature''s Riverfront Retreat';

-- Ha Ha Tonka provides free stone kayak-launch steps and a launch rail at the
-- lake/river-trail terminus. It does not provide a boat ramp. Keep it selectable
-- as a carry-in paddle access and make the lake character explicit.
UPDATE public.access_points ap
   SET type = 'park',
       types = ARRAY['park', 'access']::text[],
       fee_required = FALSE,
       fee_notes = 'No launch fee.',
       description = 'Free carry-in kayak access at the Lake of the Ozarks/Big Niangua River Trail terminus. The park provides stone kayak-launch steps and a launch rail, not a boat ramp; the first portion upstream is lake paddling.',
       facilities = 'Stone kayak-launch steps and launch rail; courtesy docks (24-foot limit); restrooms, picnic areas and trails. No boat ramp and no camping.',
       official_site_url = 'https://mostateparks.com/park/ha-ha-tonka/boating',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'niangua'
   AND ap.name = 'Ha Ha Tonka State Park';
