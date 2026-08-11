-- Make the row that can delete a place from the map impossible to create by
-- accident, and stop the column comment claiming something that does not ship.
--
-- ── The gap ────────────────────────────────────────────────────────────────
--
-- 20260811140000 said `same_place` requires a human's verified_at, and then
-- enforced it nowhere. The check in `db:check-services` reports an unverified
-- link AFTER the fact; by then `/api/services` has already shipped it and the
-- app has already collapsed two markers into one. A guard that runs on a cron
-- is a guard against a mistake somebody already made.
--
-- `same_place` is the one relationship that REMOVES a record's location from the
-- map. That is worth a constraint rather than a convention.

ALTER TABLE public.access_point_services
  DROP CONSTRAINT IF EXISTS access_point_services_same_place_is_verified;

ALTER TABLE public.access_point_services
  ADD CONSTRAINT access_point_services_same_place_is_verified
  CHECK (relationship <> 'same_place' OR verified_at IS NOT NULL);

COMMENT ON CONSTRAINT access_point_services_same_place_is_verified
  ON public.access_point_services IS
  'same_place collapses a marker and removes the losing record''s location from the map, so it may only exist once a person has confirmed the two share one arrival point.';

-- ── And the comment stops overstating what `located_at` does ──────────────
--
-- It said `located_at` "routes data only". Nothing reads it. `/api/services`
-- filters to `same_place`; access-point availability and booking still resolve
-- through `campsite_facilities`, and the sheet's service content still comes
-- from the embedded `access_points.nearby_services` JSONB. So the eight
-- `located_at` rows record a relationship and route nothing yet.
--
-- The distinction they draw is real and worth recording now — it is what keeps
-- Meramec's campground pin on the map — but a comment that describes intent as
-- behaviour is how the next reader comes to trust a path that does not exist.
-- A PR description dies with its PR; this outlives it.
COMMENT ON COLUMN public.access_point_services.relationship IS
  'same_place = one arrival point; the app collapses the two into one marker. located_at = same facility, different arrival point; both keep their marker. nearby = neither. ONLY same_place is read by the app today — located_at and nearby are recorded for the audit and for future routing of availability and booking, which still resolve through campsite_facilities.';

COMMENT ON TABLE public.access_point_services IS
  'How an access point and a directory service are related. Only same_place is consumed by the app, and only with a verified_at — see the constraint. See accessLayers.ts and ADR 0008.';
