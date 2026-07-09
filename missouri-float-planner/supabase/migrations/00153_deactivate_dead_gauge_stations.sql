-- File: supabase/migrations/00153_deactivate_dead_gauge_stations.sql
-- Deactivate gauge stations with dead telemetry: none of these 23 has EVER
-- produced a row in gauge_readings, and the USGS APIs return nothing for
-- them — both the modern latest-continuous endpoint and the legacy IV
-- fallback (verified per-site 2026-07-09). They add fetch weight to every
-- update-gauges run for zero data.
--
-- Note: 06928900 (Big Piney below Success) is wired to big-piney in
-- river_gauges as a NON-primary gauge; it has never reported a reading, so
-- nothing user-facing changes when it goes inactive.
--
-- If USGS revives a site, reactivate it with:
--   UPDATE gauge_stations SET active = true WHERE usgs_site_id = '<site>';

UPDATE gauge_stations
SET active = false
WHERE usgs_site_id IN (
  '05497485', '05499200', '05499900', '05506193', '06815530', '06819025',
  '06893060', '06895192', '06896370', '06897507', '06898800', '06903190',
  '06907300', '06928900', '06930450', '07014100', '07014200', '07050545',
  '07053450', '07055820', '07057000', '07061260', '07071750'
) AND active = true;
