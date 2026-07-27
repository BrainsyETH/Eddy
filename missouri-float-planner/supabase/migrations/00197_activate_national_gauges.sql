-- 00197_activate_national_gauges.sql
-- Make the national gauge tier visible to the map it was imported for.
--
-- 00196 added ~14,000 USGS reference stations and the gauges_in_bbox RPC that
-- serves them to the phone. The RPC filters `where gs.active`, and the import
-- landed every one of those rows with active = false — so the "Other USGS
-- gauges" layer drew nothing outside Missouri and about a third of what was
-- there inside it. Measured before this migration:
--
--   gauges_in_bbox over Colorado      ->     0 rows
--   gauges_in_bbox over Missouri      ->   253 rows (41 curated)
--   the same box ignoring `active`    ->   580 rows
--
-- scripts/import-usgs-gauges.ts:195 sets `active: true` on every row it builds
-- and has since the file was created, so this is NOT the importer's steady-state
-- behaviour — something either ran an older variant or bulk-updated the rows
-- afterwards. Recorded here rather than silently repaired, because if it
-- recurs the next import will need the cause found rather than this re-run.
--
-- ── Why activating 14,000 stations is safe ──────────────────────────────────
-- `active` is not the gate that keeps the national tier out of the curated
-- machinery; `curated` is. Every consumer that would be expensive or wrong at
-- this scale filters on curated as well, and was checked before this ran:
--
--   /api/gauges                  .eq('active').eq('curated')   unaffected
--   /api/export/rivers.json      .eq('active').eq('curated')   unaffected
--   /api/mcp                     .eq('active').eq('curated')   unaffected
--   /api/cron/update-gauges      .eq('active') + curated OR starred
--                                                              unaffected
--
-- So no reference gauge starts writing gauge_readings history, firing alerts,
-- or regenerating Eddy prose — the three things 00196's header is emphatic
-- about keeping it away from. /api/cron/sync-gauge-latest DOES widen, from ~258
-- stations to ~14,262, which is the design: gauge_latest is one row per station
-- overwritten in place, and it already holds 14,259 of them.
--
-- The one behaviour that genuinely changes is /api/search, which filters
-- `active` with no curated filter. It now orders curated-first so the rated
-- gauges are not buried under un-rated stations that sort earlier — shipped in
-- the same change as this migration, and the reason the two belong together.
--
-- ── Scope of the predicate ─────────────────────────────────────────────────
-- Deliberately narrow. Only rows this importer wrote (first_seen_at is its
-- signature), only usgs provider, only ones with a location to draw and a live
-- reading row to draw from. It cannot touch the single deliberately-deactivated
-- curated station from 00153, which has no first_seen_at.
--
-- Reversible in one statement:
--   update public.gauge_stations set active = false
--    where not curated and first_seen_at is not null and provider = 'usgs';

update public.gauge_stations gs
   set active = true
  from public.gauge_latest gl
 where gl.gauge_station_id = gs.id
   and not gs.active
   -- Never flip a curated row. 00153 deactivated one on purpose, and a station
   -- Eddy rates is not this migration's business either way.
   and not gs.curated
   and gs.provider = 'usgs'
   -- Written by scripts/import-usgs-gauges.ts, which is the only thing that
   -- sets these. A row without them predates the national import and is left
   -- exactly as an operator left it.
   and gs.first_seen_at is not null
   -- A gauge with no coordinates cannot be drawn, and gauges_in_bbox would
   -- filter it out anyway.
   and gs.location is not null;
