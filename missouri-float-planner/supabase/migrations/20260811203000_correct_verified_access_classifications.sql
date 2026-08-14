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
-- ── The coordinates are already live; the SEED was the stale copy ─────────
--
-- Checked against production before this was written: Montauk and Mother
-- Nature's both already carry the coordinates this branch adds to
-- supabase/seed/access_points.sql, identical to seven decimal places, 0.0 m
-- apart. The pins were corrected in the database at some point and the seed
-- never caught up, so the seed edit is a back-port TO the seed, not a fix
-- heading for production.
--
-- The two `location_orig` writes below are therefore no-ops against today's
-- production, and they stay anyway: they make this file say what the row must
-- be rather than what it happened to be, and a from-scratch build gets the
-- same pin without depending on the seed. `access_points_auto_snap` (00003,
-- function last rewritten in 00121) recomputes `location_snap` and
-- `snap_distance_m` on any write to `location_orig`, and leaves
-- `river_mile_downstream` alone — mile markers are hand-maintained.
--
-- Whistle Bridge is the one coordinate that genuinely disagrees: the seed sits
-- 3.7 km from the live pin. The live pin is the one that has been serving, so
-- the seed is corrected to match it and nothing here moves the row.
--
-- ── Production slugs are not the seed's slugs ─────────────────────────────
--
-- Two of these four records answer to a different slug in production than the
-- migration that created them:
--
--   00076 / the seed              production
--   mother-natures-retreat        mother-nature-s-riverfront-retreat
--   ha-ha-tonka                   ha-ha-tonka-state-park
--
-- This file originally matched those two on `name` for exactly that reason, and
-- that was correct. A review talked it into matching on `slug` — the identity
-- half of UNIQUE(river_id, slug), and the obviously right key — which would
-- have matched nothing in production and corrected nothing, silently, because
-- an UPDATE whose WHERE matches nothing SUCCEEDS. So each statement now matches
-- the slugs BOTH environments use: production's, and the one 00076 inserts,
-- which is still what a `supabase db reset` produces.
--
-- The wider divergence is nineteen rows across six rivers and is NOT addressed
-- here. Reconciling it means migrating rows the old migrations create and
-- proving it with a reset test; see branch claude/access-slug-reconciliation
-- and the header of supabase/seed/access_points.sql.
--
-- ── And why every statement is checked ────────────────────────────────────
--
-- An UPDATE whose WHERE matches nothing SUCCEEDS. A one-shot data correction
-- that silently corrects nothing is the failure mode worth guarding, so the
-- block at the bottom refuses to commit unless all four corrections are
-- actually present afterwards. It is what caught the slug drift above.

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
-- The pin is restated, not moved: production already sits at this coordinate,
-- and only the seed still carried the old one ~19 km southeast, out near
-- Salem. `river_mile_downstream` is left at its live 0.10 — the trigger will
-- not touch a hand-maintained mile, and a headwaters park record that is not
-- an endpoint has nothing ordering a float by it.
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
-- The pin is restated, not moved — production already carries it, 0.0 m from
-- the value the seed now shows. It sits about 2.0 km EAST-NORTHEAST of Whistle
-- Bridge, with Ha Ha Tonka the next point downstream, which is what the Tunnel
-- Dam meander looks like from above. `river_mile_downstream` stays at the
-- hand-set 70.0.
--
-- This read "2.5 km WEST" until it was checked. That was measured against the
-- OLD Whistle seed coordinate (-92.8343, 37.9410) — the one this same round of
-- corrections replaced as 3.7 km off what production serves, in the block
-- above. Against the corrected pin the bearing reverses. A stale bearing is
-- worse here than no bearing: the next person to sanity-check these pins on a
-- map finds them on the wrong side of the note and "fixes" a correct
-- coordinate, which is the loop this whole chain of migrations exists to end.
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
   AND ap.slug IN ('mother-nature-s-riverfront-retreat', 'mother-natures-retreat');

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
   AND ap.slug IN ('ha-ha-tonka-state-park', 'ha-ha-tonka');

-- ── The migration proves its own claims before it commits ─────────────────
--
-- Four rows had to change. That is not something a plain UPDATE reports, and it
-- is what a later reader will assume happened because this file exists. This
-- block is what caught the slug problem described in the header.
--
-- On `supabase db reset` the table is PARTLY populated by the time this runs,
-- and the difference decides which of these four assertions is live:
--
--   * Niangua — 00076 inserts Whistle Bridge, Mother Nature's and Ha Ha Tonka
--     under their original slugs, so those three rows exist and are checked.
--     (00055, 00056, 00068 and 00074 seed Huzzah, Eleven Point and Meramec —
--     other rivers, listed here only because they are the neighbouring access
--     migrations. 00145 inserts river_characteristics and no access points at
--     all; an earlier version of this note claimed otherwise.)
--
--   * Current — NOTHING inserts Montauk. The only migration that could,
--     00046, selects from `nps_campgrounds`, which no migration or seed file
--     populates, so it inserts zero rows on a reset. The Current river
--     therefore carries no access points when this runs, the EXISTS guard
--     below skips the Montauk assertion entirely, and only production proves
--     that row.
--
-- That is safe today — supabase/seed/access_points.sql lands afterwards and
-- inserts Montauk already approved = false, which is the state this migration
-- wants. It is worth writing down because it is not obvious and it is load
-- bearing: anyone who changes the seed's Montauk row on the strength of "the
-- check is live in both environments" will find that on the reset path it is
-- not live at all.
--
-- The guard on the river having any access points is what makes that skip
-- rather than a failure, and it is also there for the genuinely degenerate
-- case: a database where these rivers carry no accesses has nothing for this
-- migration to correct, and failing there would block a bootstrap rather than
-- catch a mistake.
DO $$
DECLARE
  wrong TEXT;
  offline TEXT;
BEGIN
  -- Each row is checked on the value its statement exists to set, so this
  -- catches a WHERE that matched nothing AND a correction that did not stick.
  -- `slugs` is an array because production and the seed disagree on two of
  -- them; see the header.
  SELECT string_agg(want.label || ' (expected ' || want.expected || ')', ', ' ORDER BY want.label)
    INTO wrong
    FROM (VALUES
      ('current', 'montauk',     ARRAY['montauk-state-park'],                                        'approved false'),
      ('niangua', 'whistle',     ARRAY['whistle-bridge'],                                            'ownership ''county'', is_public false'),
      ('niangua', 'mothernature',ARRAY['mother-nature-s-riverfront-retreat','mother-natures-retreat'],'''boat_ramp'' in types'),
      ('niangua', 'hahatonka',   ARRAY['ha-ha-tonka-state-park','ha-ha-tonka'],                       'fee_notes ''No launch fee.''')
    ) AS want(river_slug, label, slugs, expected)
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
        AND ap.slug = ANY(want.slugs)
        AND CASE want.label
              WHEN 'montauk'      THEN ap.approved IS FALSE
              WHEN 'whistle'      THEN ap.ownership = 'county' AND ap.is_public IS FALSE
              WHEN 'mothernature' THEN 'boat_ramp' = ANY(ap.types)
              WHEN 'hahatonka'    THEN ap.fee_notes = 'No launch fee.'
            END
   );

  IF wrong IS NOT NULL THEN
    RAISE EXCEPTION
      'access correction did not land for: %. Each statement is keyed on the slugs production and the seed use; a slug that has drifted again must be reconciled before this migration means anything.',
      wrong;
  END IF;

  -- ── Reported, never enforced ────────────────────────────────────────────
  --
  -- auto_snap_access_point stores the distance in `snap_distance_m` ALWAYS and
  -- clears `location_snap` past 1500 m, so `location_snap IS NULL` — not a null
  -- distance — is the trigger's way of saying it refused to snap.
  --
  -- All four of these rows were already past 1500 m before this migration, and
  -- they are the only unsnapped approved points in the dataset: Montauk 2236 m
  -- at the Current headwaters, Ha Ha Tonka 7765 m out on the lake arm, and
  -- Whistle Bridge 1769 m / Mother Nature's 1525 m around the Tunnel Dam
  -- meander. Every other river's worst point is comfortably inside the
  -- threshold. That is a river-geometry gap at four honest locations, it
  -- predates this correction, and nothing here moves any of them — so it is
  -- surfaced at apply time and never allowed to block a text fix.
  SELECT string_agg(ap.slug || ' ' || round(ap.snap_distance_m) || ' m', ', ' ORDER BY ap.slug)
    INTO offline
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug IN ('current', 'niangua')
     AND ap.slug IN ('montauk-state-park', 'whistle-bridge', 'ha-ha-tonka-state-park',
                     'ha-ha-tonka', 'mother-nature-s-riverfront-retreat', 'mother-natures-retreat')
     AND ap.location_snap IS NULL;

  IF offline IS NOT NULL THEN
    RAISE WARNING
      'Still off the river line and unsnapped (pre-existing, not moved here): %. validate_river_data() reports access_point_not_snapped for the approved ones.',
      offline;
  END IF;
END $$;
