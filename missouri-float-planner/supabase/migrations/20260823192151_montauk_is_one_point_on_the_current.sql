-- Montauk State Park is ONE point on the Current, and it is the first put-in.
--
-- APPLIED to production 2026-08-23 as 20260823192151.
--
-- Corrects 20260811203000, on the owner's determination. That migration read
-- Missouri State Parks' "designated canoe access outside the park boundary" and
-- NPS's designation of Tan Vat as meaning the park is not a launch. It is: the
-- park is where the upper Current is put on, and the camping, cabins and dining
-- are part of the same place you drive to, not neighbours of it.
--
-- Three separate corrections, all of them consequences of that one fact:
--
--   1. approved            the record is public again — page, pin, sitemap,
--                          export, offline bundle
--   2. is_float_endpoint   it is a put-in, so it belongs in the picker
--                          (WITHDRAWN AGAIN by 20260823200007 — not because the
--                          classification changed, but because Eddy's Current
--                          geometry stops ~1.8 mi below it and the drawn route
--                          would start in the wrong place. Measurements there.)
--   3. same_place          the campground and lodge rows collapse INTO this
--                          marker instead of drawing beside it
--
-- On (3): `same_place` is the relationship that says "one arrival point", and
-- it is the only one accessLayers.ts consumes — /api/services sets accessPointId
-- from it (IDENTITY_RELATIONSHIP, route.ts:177), which suppresses the proximity
-- radius and folds the service's marks into the access point. Under `located_at`
-- these two rows drew their own pins, 1 571 m away and stacked on each other,
-- which is what a reader saw instead of this record while it was unapproved.
-- Both rows already carry the verified_at that
-- access_point_services_same_place_is_verified requires.
--
-- Booking and availability are unaffected: campsite_facilities '4' carries both
-- access_point_id and nearby_service_id and has 21 live availability rows. The
-- relationship governs the MARKER, not the booking path.
--
-- ── The 2 236 m snap distance is a geometry gap, not a bad pin ────────────
--
-- Left alone here, and worth naming because it will keep surfacing:
-- st_closestpoint(current.geom, this pin) EQUALS st_startpoint(current.geom),
-- both at 2 235.65 m. Eddy's Current line simply begins 2.2 km below the park.
-- If this is the first put-in, the line is truncated and should be extended
-- upstream to it — that is a geometry import, not a data correction, and until
-- it happens validate_river_data() will report access_point_not_snapped here
-- (severity: warning) alongside Ha Ha Tonka, Whistle Bridge and Mother
-- Nature's. river_mile_downstream stays at its hand-maintained 0.10.

UPDATE public.access_points ap
   SET approved = TRUE,
       approved_at = NOW(),
       is_float_endpoint = TRUE,
       type = 'access',
       types = ARRAY['access', 'campground', 'park']::text[],
       fee_required = TRUE,
       fee_notes = 'No launch fee. Camping, cabins, lodge rooms and dining are paid — see mostateparks.com for current rates. A Missouri trout permit is required to fish.',
       description = 'The first put-in on the Current River, at the headwaters where Montauk Spring rises. The park is the launch and the base camp both: campground, cabins, lodge and dining are all here. Below the hatchery this is Missouri Blue Ribbon trout water — a trout permit is required, and the stretch down to Cedargrove is fly-and-artificial-only. Tan Vat (mile 0.9) and Baptist Camp (mile 2.1) are the next accesses downstream.',
       updated_at = NOW()
  FROM public.rivers r
 WHERE ap.river_id = r.id
   AND r.slug = 'current'
   AND ap.slug = 'montauk-state-park';

-- One arrival point. Both directory rows fold into the marker above.
UPDATE public.access_point_services aps
   SET relationship = 'same_place',
       source = 'audit',
       verified_at = COALESCE(aps.verified_at, NOW()),
       updated_at = NOW()
  FROM public.access_points ap
 WHERE aps.access_point_id = ap.id
   AND ap.slug = 'montauk-state-park';

DO $$
DECLARE
  m         record;
  collapsed bigint;
  leftover  bigint;
  populated boolean;
BEGIN
  -- `supabase db reset` applies every migration to an EMPTY database and loads
  -- supabase/seed/ afterwards, so on a from-scratch build there is no Montauk
  -- row here and nothing to assert about. Asserting anyway would fail every
  -- reset and every recovery rebuild — the failure mode 20260823190713 already
  -- had to guard against, and this file did not carry the guard over.
  --
  -- The seed reproduces this migration's end state itself: the Montauk row is
  -- inserted approved with the access role, and the same_place links are
  -- upserted at the end of seed/access_points.sql where the directory rows
  -- exist to link to.
  SELECT EXISTS (SELECT 1 FROM public.access_points) INTO populated;

  SELECT ap.approved, ap.is_float_endpoint, ap.type, ap.types
    INTO m
    FROM public.access_points ap
    JOIN public.rivers r ON r.id = ap.river_id
   WHERE r.slug = 'current' AND ap.slug = 'montauk-state-park';

  IF m IS NULL THEN
    IF populated THEN
      RAISE EXCEPTION
        'montauk-state-park not found on the current river, in a database that already holds access points; the slug has drifted.';
    END IF;
    RAISE NOTICE
      'montauk correction ran against an empty access_points table (a from-scratch build); seed/access_points.sql carries the same end state.';
    RETURN;
  END IF;

  IF NOT m.approved OR NOT m.is_float_endpoint THEN
    RAISE EXCEPTION
      'montauk-state-park is approved=% is_float_endpoint=%. It is the first put-in on the Current and must be both.',
      m.approved, m.is_float_endpoint;
  END IF;

  IF NOT (m.types @> ARRAY['access']::text[]) THEN
    RAISE EXCEPTION 'montauk-state-park does not carry the access role, so nothing downstream will read it as a launch.';
  END IF;

  SELECT count(*) INTO collapsed
    FROM public.access_point_services aps
    JOIN public.access_points ap ON ap.id = aps.access_point_id
   WHERE ap.slug = 'montauk-state-park' AND aps.relationship = 'same_place';

  SELECT count(*) INTO leftover
    FROM public.access_point_services aps
    JOIN public.access_points ap ON ap.id = aps.access_point_id
   WHERE ap.slug = 'montauk-state-park' AND aps.relationship <> 'same_place';

  -- The directory rows live in nearby_services, which the seed does NOT create.
  -- So a from-scratch build legitimately has no links to collapse, and zero is
  -- only an error where links exist to be got wrong. What must never happen is
  -- a row left OUTSIDE same_place: that one draws its own pin.
  IF leftover > 0 THEN
    RAISE EXCEPTION
      'Montauk has % directory row(s) not marked same_place. Any row left behind draws its own pin beside this one.',
      leftover;
  END IF;

  IF collapsed = 0 THEN
    RAISE NOTICE
      'Montauk has no directory links to collapse. Expected on a build whose nearby_services table is empty; investigate if this is production.';
  ELSIF collapsed <> 2 THEN
    RAISE WARNING
      'Montauk has % same_place link(s); production carries 2 (campground and lodge).',
      collapsed;
  END IF;

  RAISE NOTICE
    'montauk-state-park: approved, a float endpoint, and one marker — % directory rows collapsed into it.',
    collapsed;
END $$;
