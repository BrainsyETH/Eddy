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
--
-- ── Why the coordinates are HERE and not only in the seed ─────────────────
--
-- Two of these records carry a wrong pin, and `supabase/seed/access_points.sql`
-- cannot fix a live one: every insert there ends
-- `ON CONFLICT (river_id, slug) DO UPDATE SET approved = EXCLUDED.approved`,
-- so re-seeding a populated database syncs approval and nothing else. A
-- coordinate that lives only in the seed is a coordinate that only a database
-- built from scratch will ever see. The seed and this file now carry the same
-- two points, and this is the copy production gets.
--
-- Moving `location_orig` is enough: `access_points_auto_snap` (00003, function
-- last rewritten in 00121) fires BEFORE UPDATE OF location_orig and recomputes
-- `location_snap` + `snap_distance_m`, snapping only within 1500 m and leaving
-- `location_snap` NULL beyond it. `river_mile_downstream` is deliberately NOT
-- touched by that trigger — mile markers stay hand-maintained — so the miles
-- these rows already carry survive the move.
--
-- ── And why every statement is checked ────────────────────────────────────
--
-- An UPDATE whose WHERE matches nothing SUCCEEDS. A one-shot data correction
-- that silently corrects nothing is the failure mode worth guarding, so each
-- row is matched on `slug` — the half of `UNIQUE(river_id, slug)` that is the
-- identity — and the block at the bottom refuses to commit unless all four
-- landed and the two moved pins actually reached the river.

-- Montauk State Park is a park/campground near the Current headwaters, not a
-- river landing. Missouri State Parks puts canoe access outside the park's
-- southeast boundary; NPS designates Tan Vat, which Eddy already carries as a
-- separate approved access. Unapproving this duplicate removes a false launch
-- without removing the real Tan Vat endpoint or the nearby-services park row.
--
-- What unapproving costs, said plainly: the public access page 404s
-- (src/lib/access-points/detail.ts filters approved = true), the row leaves
-- /api/export/rivers.json and the offline bundle, and the two `located_at`
-- links added by 20260811150000 stop being read. Montauk's CAMPING is not lost
-- with it — campsite_facilities '4' also carries nearby_service_id pointing at
-- `montauk-state-park-campground` (20260803140000), and /api/rivers/[slug]/
-- services resolves availability by that id, so the campground keeps its own
-- marker, its nights and its booking link.
--
-- `approved` is the admin-review flag, not a "this is not a launch" flag; the
-- honest lever is the roles axis of ADR 0008, which is why `types` drops
-- `access` below. But the web planner offers every approved point as an
-- endpoint regardless of roles (src/app/plan/PlanPageClient.tsx reads types
-- only for a label; the API filters on `approved` alone), so roles alone will
-- not take it out of the picker today. Teaching the planner to respect the
-- role is the follow-up that lets this row come back approved.
--
-- The pin also moves. The old coordinate sits about 19 km southeast of the
-- park, out near Salem; the park's own directory row (00073) is at
-- 37.4407, -91.6739, nowhere near it. Whatever `river_mile_downstream` this
-- row carries was derived from that wrong pin and survives the move, because
-- the trigger will not touch a hand-maintained mile. It is left alone
-- knowingly: an unapproved park record is not an endpoint, nothing orders a
-- float by it, and validate_river_data() skips unapproved rows. If this row is
-- ever approved again, its mile has to be re-derived first.
UPDATE public.access_points ap
   SET approved = FALSE,
       type = 'park',
       types = ARRAY['park', 'campground']::text[],
       location_orig = ST_SetSRID(ST_MakePoint(-91.6866657, 37.4505347), 4326),
       fee_required = TRUE,
       fee_notes = 'No launch fee — there is no river launch here. Camping and lodging are paid; see mostateparks.com for current rates.',
       description = 'State park and campground at the Current River headwaters. This record is not a put-in or take-out: Missouri State Parks puts designated canoe access outside the park''s southeast boundary, and NPS designates Tan Vat, which Eddy carries as a separate access. Private vessels float free within Ozark National Scenic Riverways.',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'montauk-state-park';

-- Whistle Bridge is a real low-water-crossing access, but not public land with
-- parking. The county crossing is surrounded by private property. Keep it as a
-- manually selectable private endpoint while removing it from public/social
-- route generation and removing the false parking claim.
--
-- `ownership` stays the token 'county'. It is a short vocabulary — 00002 names
-- it as 'MDC', 'NPS', 'private', 'county', 'city', 'state_park' — and
-- rail.tsx renders it as an uppercase letter-spaced eyebrow above the place
-- name, where a sentence becomes COUNTY ROAD CROSSING; ADJACENT LAND IS
-- PRIVATE · ACCESS. The private-land fact belongs in the prose fields, where
-- all three of them now carry it, and `is_public = FALSE` is the half a query
-- can read.
--
-- The dry-channel warning is restored. Tunnel Dam diverts the Niangua, and
-- whether the channel below it is carrying water decides whether this access
-- is an access at all — dropping it for a parking note lost the fact that
-- decides the trip.
UPDATE public.access_points ap
   SET is_public = FALSE,
       ownership = 'county',
       amenities = ARRAY[]::text[],
       parking_info = 'No public parking. Drop-off or pickup only where lawful; do not park on or cross adjacent private property.',
       parking_capacity = NULL,
       description = 'Low-water concrete crossing at Whistle Road and Tunnel Dam Road. Usable only when the channel below Tunnel Dam is carrying water. It can serve as a river access, but there is no public parking and the surrounding land is private. Use only for a lawful drop-off/pickup and do not enter adjacent property.',
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
--
-- Matched on slug, not name: `name` carries an apostrophe, is not unique, and
-- is not the identity — and a WHERE that misses would have corrected nothing
-- while reporting success.
--
-- The pin moves about 2.5 km WEST of Whistle Bridge while Ha Ha Tonka, the next
-- point downstream, lies east of both. That is what the Tunnel Dam meander
-- looks like from above, and it is also what a wrong pin looks like, so the
-- block at the bottom makes the river geometry settle it rather than this
-- comment. `river_mile_downstream` stays at the hand-set 70.0.
UPDATE public.access_points ap
   SET type = 'campground',
       types = ARRAY['campground', 'access', 'boat_ramp', 'gravel_bar']::text[],
       location_orig = ST_SetSRID(ST_MakePoint(-92.8622596, 37.9520605), 4326),
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
   AND ap.slug = 'mother-natures-retreat';

-- Ha Ha Tonka provides free stone kayak-launch steps and a launch rail at the
-- lake/river-trail terminus. It does not provide a boat ramp. Keep it selectable
-- as a carry-in paddle access and make the lake character explicit.
--
-- The castle ruins and spring are back in the description. They are why a
-- reader recognises the place, and the rewrite that made the launch honest
-- dropped them for no gain.
UPDATE public.access_points ap
   SET type = 'park',
       types = ARRAY['park', 'access']::text[],
       fee_required = FALSE,
       fee_notes = 'No launch fee.',
       description = 'Free carry-in kayak access at the spring, the Lake of the Ozarks/Big Niangua River Trail terminus and 13.3 miles downstream of Whistle Bridge. The park provides stone kayak-launch steps and a launch rail, not a boat ramp; the first portion upstream is lake paddling. The castle ruins, spring and geology are the park''s draw.',
       facilities = 'Stone kayak-launch steps and launch rail; courtesy docks (24-foot limit); restrooms, picnic areas and trails. No boat ramp and no camping.',
       official_site_url = 'https://mostateparks.com/park/ha-ha-tonka/boating',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'niangua'
   AND ap.slug = 'ha-ha-tonka';

-- ── The migration proves its own claims before it commits ─────────────────
--
-- Four rows had to change and two pins had to land on a river. Neither is
-- something a plain UPDATE reports, and both are things a later reader will
-- assume happened because this file exists.
-- Conditional on the river already having access points, because "matched
-- nothing" is the CORRECT outcome on a from-scratch rebuild: `supabase db
-- reset` runs every migration against an empty access_points table and lands
-- supabase/seed/access_points.sql afterwards. So this is a hard check against a
-- populated database and a no-op against an empty one — which is also why the
-- seed has to carry these same values itself, and now does.
DO $$
DECLARE
  wrong TEXT;
  mn_found BOOLEAN;
  mn_snap NUMERIC;
  montauk_snap NUMERIC;
BEGIN
  -- Each row is checked on the value its statement exists to set, so this
  -- catches a WHERE that matched nothing AND a correction that did not stick.
  SELECT string_agg(want.slug || ' (expected ' || want.expected || ')', ', ' ORDER BY want.slug)
    INTO wrong
    FROM (VALUES
      ('current', 'montauk-state-park',     'approved false'),
      ('niangua', 'whistle-bridge',         'ownership ''county'', is_public false'),
      ('niangua', 'mother-natures-retreat', '''boat_ramp'' in types'),
      ('niangua', 'ha-ha-tonka',            'fee_notes ''No launch fee.''')
    ) AS want(river_slug, slug, expected)
   WHERE EXISTS (
     SELECT 1
       FROM public.access_points ap
       JOIN public.rivers r ON r.id = ap.river_id
      WHERE r.slug = want.river_slug
   )
     AND NOT EXISTS (
     SELECT 1
       FROM public.access_points ap
       JOIN public.rivers r ON r.id = ap.river_id
      WHERE r.slug = want.river_slug
        AND ap.slug = want.slug
        AND CASE want.slug
              WHEN 'montauk-state-park'     THEN ap.approved IS FALSE
              WHEN 'whistle-bridge'         THEN ap.ownership = 'county' AND ap.is_public IS FALSE
              WHEN 'mother-natures-retreat' THEN 'boat_ramp' = ANY(ap.types)
              WHEN 'ha-ha-tonka'            THEN ap.fee_notes = 'No launch fee.'
            END
   );

  IF wrong IS NOT NULL THEN
    RAISE EXCEPTION
      'access correction did not land for: %. Every statement here is keyed on (rivers.slug, access_points.slug); a slug that has drifted must be reconciled before this migration means anything.',
      wrong;
  END IF;

  -- snap_distance_m is written by access_points_auto_snap on the UPDATE above.
  -- NULL means the trigger refused to snap — the point is more than 1500 m from
  -- its river's geometry, which for a river access is a wrong coordinate rather
  -- than an unusual one.
  SELECT TRUE, ap.snap_distance_m INTO mn_found, mn_snap
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'niangua' AND ap.slug = 'mother-natures-retreat';

  IF COALESCE(mn_found, FALSE) THEN
    IF mn_snap IS NULL THEN
      RAISE EXCEPTION
        'Mother Nature''s new coordinate (-92.8622596, 37.9520605) is more than 1500 m from the Niangua geometry, so auto_snap_access_point left location_snap NULL. The pin is wrong, or rivers.geom does not cover this reach — resolve before correcting the record.';
    END IF;

    -- 500 m is what validate_river_data() reports as access_point_offline.
    -- Worth saying out loud at apply time; not worth refusing the correction over.
    IF mn_snap > 500 THEN
      RAISE WARNING
        'Mother Nature''s is % m from the Niangua line — validate_river_data() will report access_point_offline. Confirm the pin against the channel.',
        round(mn_snap);
    END IF;
  END IF;

  -- Montauk is a headwaters park record rather than a landing, and is left
  -- unapproved, so validate_river_data() will not look at it. Reported, not
  -- enforced: a park's buildings legitimately sit off the mapped line.
  SELECT ap.snap_distance_m INTO montauk_snap
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.slug = 'montauk-state-park';

  IF FOUND THEN
    RAISE NOTICE 'Montauk corrected pin is % m from the Current geometry (was ~19 km southeast of the park).',
      COALESCE(round(montauk_snap)::text, 'more than 1500');
  END IF;
END $$;
