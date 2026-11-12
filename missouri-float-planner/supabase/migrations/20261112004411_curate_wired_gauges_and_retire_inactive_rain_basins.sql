-- Two data repairs found while reviewing rainfall collection. Idempotent.
--
-- 1. Re-assert 00196's rule: "every station wired to a river is curated, by
--    definition". 00196 applied it once, to the links that existed that day.
--    Gasconade River near Rich Fountain (USGS 06934000) was wired to the
--    Gasconade afterwards and never flagged, so the gauge cron, which reads
--    curated and starred stations only, stopped storing its readings on
--    2026-07-27 while USGS kept publishing them. The trust check
--    gauge_wired_not_curated now reports any station that drifts this way.
update public.gauge_stations gs
   set curated = true
 where not gs.curated
   and exists (
        select 1 from public.river_gauges rg where rg.gauge_station_id = gs.id
      );

-- 2. A research basin on an inactive station can never have gauge readings to
--    compare with rain, and its absence marked every hourly rainfall collection
--    "partial". Big Piney River near Houston (USGS 06928900) is the one such
--    basin. Disabling keeps the stored basin version and its past captures.
update public.rainfall_research_basins b
   set enabled = false
  from public.gauge_stations gs
 where gs.id = b.gauge_id
   and b.enabled
   and not gs.active;
