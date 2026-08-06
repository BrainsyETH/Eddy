-- Let a booking facility point at an access point.
--
-- ── The gap this closes ────────────────────────────────────────────────────
--
-- Meramec, Montauk, Onondaga Cave and Red Bluff all exist in Eddy TWICE: once
-- in access_points (tagged 'campground', which is what draws their map pin and
-- earns them a Camping tab) and once in nearby_services (which is what
-- campsite_facilities links to). Nothing joined the two.
--
-- So the app opened Meramec's Camping tab and rendered static Fact rows while
-- this database held 68 of its 197 sites open. getAccessPointDetail resolves
-- availability through access_points.nps_campground_id, and a state park has no
-- nps_campgrounds row at all — the very case the app's tab registry describes.
--
-- ── Why the column goes HERE and not on access_points ──────────────────────
--
-- campsite_facilities already owns this question. It carries nps_campground_id
-- and nearby_service_id for exactly one purpose: naming which Eddy place this
-- booking facility IS. A third nullable FK is symmetric with the two, keeps all
-- of that knowledge in one table, and makes a fourth place type later a
-- one-table change.
--
-- Putting nearby_service_id on access_points instead would have been the same
-- number of characters and would have split the linkage across two tables, so
-- the next person would have to know to look in both.
--
-- ── The root cause this does NOT fix ───────────────────────────────────────
--
-- Eddy stores the same physical campground in more than one place table with no
-- link between those rows. That duplication is the actual defect; this column
-- makes the facility the one row that knows they are the same place, which is
-- the smallest honest fix and does not foreclose reconciling the place tables
-- properly later.

ALTER TABLE public.campsite_facilities
  ADD COLUMN IF NOT EXISTS access_point_id UUID
    REFERENCES public.access_points(id) ON DELETE SET NULL;

-- The read path indexes availability by every id a caller might hold, so this
-- is looked up the same way the other two are.
CREATE INDEX IF NOT EXISTS campsite_facilities_access_point_idx
  ON public.campsite_facilities (access_point_id)
  WHERE access_point_id IS NOT NULL;

-- One facility per access point. Two facilities claiming one place would make
-- "which number does this pin show" a question with no answer, and the loop
-- rows that share a source_facility_id are precisely the case that must NOT
-- both point at the same access point.
CREATE UNIQUE INDEX IF NOT EXISTS campsite_facilities_access_point_unique
  ON public.campsite_facilities (access_point_id)
  WHERE access_point_id IS NOT NULL;

COMMENT ON COLUMN public.campsite_facilities.access_point_id IS
  'The access point that IS this campground, when Eddy also lists it as one. Read before nps_campground_id: it is the row the map pin came from.';

-- ── The four that are the same place under two names ──────────────────────
--
-- Matched by exact display name against access points TAGGED 'campground', and
-- verified one at a time rather than by pattern. A boat ramp sharing a park's
-- name is not the campground, which is why the type tag is part of the match:
-- 'Boat ramp - Meramec State Park on left' and 'Meramec State Park (Lower
-- Ramp)' both exist and neither is somewhere you sleep.
--
-- Named rather than keyed by uuid so this migration reads as a claim about
-- places that can be checked, and so it is a no-op on any database where those
-- rows do not exist.

UPDATE public.campsite_facilities f
SET access_point_id = a.id
FROM public.access_points a
WHERE a.types @> ARRAY['campground']::text[]
  AND f.access_point_id IS NULL
  AND f.nps_campground_id IS NULL
  AND (
    (f.display_name = 'Meramec State Park'       AND a.name = 'Meramec State Park')
    OR (f.display_name = 'Montauk State Park'       AND a.name = 'Montauk State Park')
    OR (f.display_name = 'Onondaga Cave State Park' AND a.name = 'Onondaga Cave State Park')
    -- The one place the two names genuinely differ: the USFS facility is the
    -- campground inside the recreation area that Eddy lists as the access.
    OR (f.display_name = 'Red Bluff Campground'     AND a.name = 'Red Bluff Recreation Area')
  );
