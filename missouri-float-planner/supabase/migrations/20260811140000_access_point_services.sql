-- Say how an access point and a directory service are related, in one place.
--
-- ── The gap this closes ────────────────────────────────────────────────────
--
-- The map decides "one place or two" with a ~222 m proximity box
-- (SAME_PLACE_DEGREES in eddy-ios/src/map/accessLayers.ts). That is a
-- presentation rule, documented as evidence rather than proof, and ADR 0008 is
-- explicit that it may never drive a record merge. It also cannot reach the
-- cases that most need reaching — Meramec State Park's two rows are 2 956 m
-- apart, Montauk's 1 571 m, Onondaga Cave's 1 036 m, and all three draw two pins
-- today.
--
-- Widening the radius until it covered 3 km is the alternative, and it is worse:
-- it would swallow genuinely distinct neighbours — Wilderness Ridge Resort and
-- Peck's Last Resort are 74 m apart and are two businesses.
--
-- ── WHY THE RELATIONSHIP IS THE POINT, AND NOT A FORMALITY ────────────────
--
-- There is a real difference between two claims that a bare pair of ids would
-- flatten:
--
--   "this campground's availability belongs on that access point's sheet"
--   "this campground and that access point are ONE PLACE YOU DRIVE TO"
--
-- campsite_facilities.access_point_id proves the first. It does NOT prove the
-- second, and at Meramec's 2 956 m the second is false: the campground and the
-- river access are one park and two destinations. Collapsing them into one
-- marker would not merely merge two pins — it would REMOVE the campground's
-- true location from the map and point anybody looking for it at a boat ramp
-- 3 km away. That is worse than the duplicate it fixes, because a duplicate at
-- least draws the campground where the campground is.
--
--   same_place   same arrival point. Collapses the marker. Verified by a human.
--   located_at   same parent facility, different arrival point. Routes
--                availability and booking. Draws BOTH markers.
--   nearby       close enough to be worth knowing. Draws both, routes nothing.
--
-- Only `same_place` ever reaches the app — see /api/services, which filters on
-- this column precisely so the other two cannot collapse a marker.
--
-- ── Why a table rather than a fourth FK on campsite_facilities ─────────────
--
-- campsite_facilities is keyed (source, source_facility_id) — a row exists only
-- where a BOOKING PROVIDER has a facility. Of the same-place candidates the
-- audit finds, several have no facility row at all (Patrick Bridge, Meramec
-- Caverns) because nobody sells their sites through recreation.gov or the state
-- park system. Identity is not a property of having a reservation feed, so it
-- cannot live in the table that is.
--
-- This mirrors service_rivers exactly, which is the same schema doing the same
-- job for the service↔river relationship, and is horizon 2c of
-- docs/MAPS_SHEET_SERVICE_MODEL_PLAN.md, referenced from accessLayers.ts and
-- ADR 0008 as the thing the radius is standing in for.

CREATE TABLE IF NOT EXISTS public.access_point_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_point_id UUID NOT NULL REFERENCES public.access_points(id) ON DELETE CASCADE,
  nearby_service_id UUID NOT NULL REFERENCES public.nearby_services(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL
    CHECK (relationship IN ('same_place', 'located_at', 'nearby')),
  -- Where the claim came from — 'campsite_facilities', 'audit', an operator's
  -- name. Provenance, so a wrong link can be traced to the run that made it
  -- rather than argued about.
  source TEXT,
  -- When a HUMAN confirmed it. NULL means derived and unconfirmed, which is not
  -- the same as false. A `same_place` row with a null verified_at is exactly the
  -- thing this schema exists to make impossible to create by accident, and the
  -- audit reports any that appear.
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (access_point_id, nearby_service_id)
);

COMMENT ON TABLE public.access_point_services IS
  'How an access point and a directory service are related. Only same_place collapses a map marker, and only after a human has confirmed the two share one arrival point. See accessLayers.ts and ADR 0008.';

COMMENT ON COLUMN public.access_point_services.relationship IS
  'same_place = one arrival point, collapses the marker. located_at = same facility, different arrival point, routes data only. nearby = neither.';

-- ── One IDENTITY per service, enforced ─────────────────────────────────────
--
-- The resolver treats a same_place link as the last word and stops consulting
-- geometry once it finds one. That is only safe if a service cannot be the same
-- place as two access points — otherwise "which pin absorbs it" becomes a
-- question with two answers and the map would pick by row order.
--
-- Partial on same_place ALONE, deliberately. A service may be `located_at` more
-- than one access point — a state park with two landings is a real shape — and
-- `nearby` is unbounded by construction.
CREATE UNIQUE INDEX IF NOT EXISTS access_point_services_one_identity_per_service
  ON public.access_point_services (nearby_service_id)
  WHERE relationship = 'same_place';

CREATE INDEX IF NOT EXISTS access_point_services_access_point_idx
  ON public.access_point_services (access_point_id);

-- ── RLS: readable by anyone, writable by admins ────────────────────────────
-- Mirrors service_rivers. The map reads this with the anon key, and a link is no
-- more sensitive than the two public rows it joins.
ALTER TABLE public.access_point_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_point_services_select ON public.access_point_services;
CREATE POLICY access_point_services_select ON public.access_point_services
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS access_point_services_insert ON public.access_point_services;
CREATE POLICY access_point_services_insert ON public.access_point_services
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS access_point_services_update ON public.access_point_services;
CREATE POLICY access_point_services_update ON public.access_point_services
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS access_point_services_delete ON public.access_point_services;
CREATE POLICY access_point_services_delete ON public.access_point_services
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Seed: `located_at`, which is what the evidence actually supports ───────
--
-- Every row below is derived from a link Eddy already holds — campsite_facilities
-- rows carrying access_point_id and nearby_service_id together. That association
-- was created to route availability, and routing availability is exactly what it
-- proves. It is recorded as `located_at` for that reason and no other.
--
-- NOTHING IS SEEDED AS same_place, so this migration changes not one pin. Three
-- of these four places are drawing two markers right now and will continue to
-- until somebody confirms that their campground and their river access share an
-- arrival point — which for Meramec, 2 956 m apart, is a claim that looks false
-- and would do real harm if wrong.
--
-- Promoting one is a one-row update once verified:
--
--   UPDATE access_point_services
--      SET relationship = 'same_place', source = 'audit', verified_at = NOW()
--    WHERE access_point_id = '…' AND nearby_service_id = '…';
--
-- `npm run db:check-services` lists the candidates, prints how far apart each
-- pair's coordinates are, and flags any same_place row that was never verified.
--
-- Idempotent: ON CONFLICT DO NOTHING against the pair, so re-running is a no-op
-- and a relationship a human has since promoted is never demoted back.
INSERT INTO public.access_point_services
  (access_point_id, nearby_service_id, relationship, source)
SELECT
  cf.access_point_id,
  cf.nearby_service_id,
  'located_at',
  'campsite_facilities'
FROM public.campsite_facilities cf
WHERE cf.access_point_id IS NOT NULL
  AND cf.nearby_service_id IS NOT NULL
ON CONFLICT (access_point_id, nearby_service_id) DO NOTHING;
