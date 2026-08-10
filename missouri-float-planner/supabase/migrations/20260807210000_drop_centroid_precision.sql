-- Retire the `centroid` geocode precision. It was never written.
--
-- The tier existed for a geocoder falling back to a town centre when it could
-- not find the business, so the map could refuse to draw it. The backfill that
-- actually shipped works differently: every candidate coordinate is measured
-- against the river the service serves (service_rivers -> rivers.geom) and a
-- coordinate that cannot be corroborated is simply not written. "Present but
-- too coarse to draw" is therefore a state the data never entered — the count
-- was 0 on the day this ran — and keeping the value writable leaves a trap for
-- a future backfill to write rows the app no longer treats specially.
--
-- `mappableService` in eddy-ios/src/map/mappable.ts is now a plain
-- has-coordinates check; `geocode_precision` remains as provenance
-- ('exact' / 'approximate', null for rows that pre-date tracking).

ALTER TABLE nearby_services
  DROP CONSTRAINT nearby_services_geocode_precision_check;

ALTER TABLE nearby_services
  ADD CONSTRAINT nearby_services_geocode_precision_check
  CHECK (geocode_precision IN ('exact', 'approximate'));

COMMENT ON COLUMN nearby_services.geocode_precision IS
  'Provenance of the coordinates: exact = the place itself, corroborated; approximate = the right road or an adjacent landmark. NULL pre-dates tracking. Not a render-time filter — trust is enforced when a coordinate is written, corroborated against the service''s river.';
