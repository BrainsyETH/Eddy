-- supabase/migrations/00165_backfill_nws_flood_stages.sql
--
-- Backfill OFFICIAL NWS flood/action stages (feet) onto the curated float gauges
-- (audit F4: replace editorial guesses at the safety line with real hydrology).
--
-- Source: National Water Prediction Service (NWPS) per-gauge flood categories,
-- fetched 2026-07-12. Each LID was accepted only after its NWPS-reported usgsId
-- matched ours (same cross-check as scripts/fetch-nws-flood-stages.ts). NWPS
-- publishes these thresholds in FEET only (category flow = -9999), so they anchor
-- "Dangerous"/"High" via the stored gauge_height_ft — see the unit-independent
-- flood override, which lets them keep working after a gauge moves to CFS.
--
-- We layer these alongside the editorial level_* ladder (00114 rule: add official
-- stages, do not overwrite curated judgement); threshold_source is left as-is.
-- Huzzah/Courtois (07014000, LID HZHM7) has no NWPS flood category defined and is
-- intentionally omitted here — it keeps an editorial danger anchor.

UPDATE gauge_stations SET nws_lid = 'VNBM7' WHERE usgs_site_id = '07067000';
UPDATE river_gauges SET flood_stage_ft = 20, action_stage_ft = 10
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07067000');

UPDATE gauge_stations SET nws_lid = 'AKFM7' WHERE usgs_site_id = '07064533';
UPDATE river_gauges SET flood_stage_ft = 7, action_stage_ft = 4
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07064533');

UPDATE gauge_stations SET nws_lid = 'DNZM7' WHERE usgs_site_id = '07068000';
UPDATE river_gauges SET flood_stage_ft = 13, action_stage_ft = 10
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07068000');

UPDATE gauge_stations SET nws_lid = 'MSPM7' WHERE usgs_site_id = '07064440';
UPDATE river_gauges SET flood_stage_ft = 7, action_stage_ft = 5
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07064440');

UPDATE gauge_stations SET nws_lid = 'PWDM7' WHERE usgs_site_id = '07066510';
UPDATE river_gauges SET flood_stage_ft = 8, action_stage_ft = 6
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07066510');

UPDATE gauge_stations SET nws_lid = 'EPGM7' WHERE usgs_site_id = '07071500';
UPDATE river_gauges SET flood_stage_ft = 10, action_stage_ft = 8
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07071500');

UPDATE gauge_stations SET nws_lid = 'ALYM7' WHERE usgs_site_id = '07065495';
UPDATE river_gauges SET flood_stage_ft = 9, action_stage_ft = 5.3
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07065495');

UPDATE gauge_stations SET nws_lid = 'JKFM7' WHERE usgs_site_id = '07065200';
UPDATE river_gauges SET flood_stage_ft = 11, action_stage_ft = 4
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07065200');

UPDATE gauge_stations SET nws_lid = 'EMCM7' WHERE usgs_site_id = '07066000';
UPDATE river_gauges SET flood_stage_ft = 12, action_stage_ft = 6.4
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07066000');

UPDATE gauge_stations SET nws_lid = 'WNYM7' WHERE usgs_site_id = '06923250';
UPDATE river_gauges SET flood_stage_ft = 12, action_stage_ft = 10
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '06923250');

UPDATE gauge_stations SET nws_lid = 'TUDM7' WHERE usgs_site_id = '06923950';
UPDATE river_gauges SET flood_stage_ft = 11, action_stage_ft = 10
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '06923950');

UPDATE gauge_stations SET nws_lid = 'PINM7' WHERE usgs_site_id = '06930000';
UPDATE river_gauges SET flood_stage_ft = 8.5, action_stage_ft = 4.5
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '06930000');

UPDATE gauge_stations SET nws_lid = 'SEEM7' WHERE usgs_site_id = '07013000';
UPDATE river_gauges SET flood_stage_ft = 12, action_stage_ft = 10
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07013000');

UPDATE gauge_stations SET nws_lid = 'ERKM7' WHERE usgs_site_id = '07019000';
UPDATE river_gauges SET flood_stage_ft = 19, action_stage_ft = 17
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07019000');

UPDATE gauge_stations SET nws_lid = 'SLLM7' WHERE usgs_site_id = '07014500';
UPDATE river_gauges SET flood_stage_ft = 11, action_stage_ft = 9
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07014500');

UPDATE gauge_stations SET nws_lid = 'CSNM7' WHERE usgs_site_id = '07010350';
UPDATE river_gauges SET action_stage_ft = 5.5
  WHERE gauge_station_id = (SELECT id FROM gauge_stations WHERE usgs_site_id = '07010350');

