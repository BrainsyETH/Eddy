-- supabase/migrations/00177_recalibrate_cfs_flood_thresholds.sql
--
-- Ground-truth recalibration of float-condition ladders to FLOATABILITY
-- (paddler "can I float this?"), replacing percentile formulas and flood-gauge
-- hydrology. Also widens the primary threshold columns.
--
-- BUG (reported on the Meramec @ Steelville, USGS 07013000):
--   The live report showed "FLOOD / Dangerous — do not float" at 3.11 ft /
--   1,150 cfs. 00167 had flipped the MVP rivers to CFS with bands set to
--   percentiles of mid-July flow (p10..p90) and level_dangerous = "~2x p90".
--   Percentiles of summer flow have no relationship to what a paddler can
--   float, so "dangerous" fired at ~3 ft on a river floatable to ~7 ft, and
--   the cfs ladder contradicted the ft ladder. Related defects found in the
--   full audit:
--     * Flood-flow-anchored danger lines that UNDER-warn: North Fork
--       (8,440 cfs on a river locals call high at ~1,000), James (4,410 vs
--       observed flood onset 3,000), Black @ Poplar Bluff (7,057).
--     * level_* columns were numeric(6,2), capping any cfs threshold at
--       9,999.99 (alt_level_* were already numeric(10,2) via 00049).
--     * Meramec @ Sullivan's dangerous (12 ft) sat ABOVE its NWS flood stage
--       (11 ft); Cook Station's (8 ft ~ 90x median flow) far over-permitted.
--
-- GROUND TRUTH SOURCES (per-gauge, no formulas):
--   1. MOHERP (rivers.moherp.org) per-gauge float ratings — "Observed" onsets
--      come from actual trip reports (real local ground truth); "Estimated"
--      used as fallback where no observation exists. MOHERP is already a
--      trusted source in this repo (Doniphan's curated ladder).
--   2. NPS Ozark Riverways closure practice (upper Current/Jacks Fork close to
--      vessels ~2 ft above normal; Akers closure 4.0 ft = ~2,810 cfs via the
--      USGS rating; Alley-era closure ~= 4 ft ~ 1,000 cfs kept as JF danger).
--   3. Outfitter guidance (missouriscenicrivers.com: Van Buren general
--      floating below 4.5 ft, high/dangerous ~5 ft = ~3,450 cfs; OzarkAnglers/
--      MOHERP for the Meramec: 500-900 "high but floatable").
--   4. USGS exsa rating curves for every ft<->cfs conversion, so the cfs
--      (primary) and ft (alt) ladders always describe the same water.
--   Danger for the Meramec @ Steelville set to 5,000 cfs (~7.2 ft) per owner
--   decision (between MOHERP est flood 2,121 and the 9 ft curated line).
--
-- UNCHANGED (coherent existing ladders or no ground truth available — flagged
-- rather than guessed): Gasconade (matches MOHERP observed; editorial danger
-- 3,000 between observed-high 1,000 and est flood 4,809), Big Piney (equals
-- MOHERP estimates), Doniphan (MOHERP curated), Huzzah/Courtois (no MOHERP/NWS
-- data; rating-converted curated ft ladder), Niangua @ Tunnel Dam, Big River
-- (both gauges; not on MOHERP), Spring @ Hardy AR, Buffalo AR whitewater
-- secondaries (Boxley/Ponca/Harriet, AW-style ladders), Elk (ft ladder checked
-- coherent: danger 6 ft = ~2,434 cfs vs MOHERP est flood 3,569 = 6.9 ft),
-- St. Francis @ Roselle, Caddo, Mulberry, Kings, War Eagle, Crooked (AR
-- editorial ladders), Meramec @ Eureka (no local source; danger 12 ft is
-- below its 19 ft flood stage).
--
-- last_condition_code re-baseline (mirrors 00171): reclassification would
-- otherwise make the gauge cron post spurious easing/rising alerts; NULL the
-- stamp so the next pass re-baselines silently. Display is unaffected (pages
-- compute condition live).

-- Part 1 — widen primary threshold columns to match alt_level_* (00049).
ALTER TABLE river_gauges
  ALTER COLUMN level_too_low     TYPE numeric(10,2),
  ALTER COLUMN level_low         TYPE numeric(10,2),
  ALTER COLUMN level_optimal_min TYPE numeric(10,2),
  ALTER COLUMN level_optimal_max TYPE numeric(10,2),
  ALTER COLUMN level_high        TYPE numeric(10,2),
  ALTER COLUMN level_dangerous   TYPE numeric(10,2);

-- Part 2 — cfs-primary gauges: full ladders in BOTH units (cfs primary,
-- ft alt via each gauge's USGS rating curve).
--   cfs: tl lo omin omax hi dng | ft: atl alo aomin aomax ahi adng
UPDATE river_gauges rg SET
  level_too_low = v.tl, level_low = v.lo, level_optimal_min = v.omin,
  level_optimal_max = v.omax, level_high = v.hi, level_dangerous = v.dng,
  alt_level_too_low = v.atl, alt_level_low = v.alo, alt_level_optimal_min = v.aomin,
  alt_level_optimal_max = v.aomax, alt_level_high = v.ahi, alt_level_dangerous = v.adng,
  threshold_source = 'editorial',
  threshold_source_url = 'https://rivers.moherp.org/gauge/?gauge=' || v.site_id,
  last_condition_code = NULL,
  threshold_updated_at = now()
FROM (VALUES
  -- Niangua @ Windyville: observed Good 100 / High 400; est flood 2,020
  ('06923250', 23, 95, 100, 400, 400, 2000, 0.86, 1.42, 1.45, 2.51, 2.52, 5.01),
  -- Meramec @ Steelville: MOHERP est high ~1,009 ~ optimal_max 900; dng 5,000 (owner)
  ('07013000', 130, 250, 300, 900, 2300, 5000, 1.2, 1.51, 1.63, 2.75, 4.49, 7.22),
  -- Bourbeuse @ Union: MOHERP estimates (no observed); was over-warning at 1,000
  ('07016500', 70, 215, 359, 964, 964, 3300, 3.08, 3.5, 3.76, 4.53, 4.54, 7.16),
  -- James @ Galena: observed Good 180 / FLOOD 3,000 (was 4,410)
  ('07052500', 97, 180, 358, 921, 921, 3000, 3.6, 3.97, 4.45, 5.24, 5.25, 6.95),
  -- Buffalo @ St. Joe: observed Low 120 / High 2,000; est flood 4,313
  ('07056000', 32, 127, 356, 2000, 2000, 4300, 2.65, 3.18, 3.92, 6.61, 6.62, 8.86),
  -- North Fork @ Tecumseh: observed High 1,000; est flood 2,233 (was 8,440!)
  ('07057500', 285, 475, 628, 1000, 1000, 2200, 2.19, 2.54, 2.77, 3.26, 3.27, 4.41),
  -- Bryant Creek: observed Good 300; est high 1,051 / flood 1,932
  ('07058000', 189, 300, 356, 1050, 1050, 1930, 3.63, 3.97, 4.11, 5.48, 5.49, 6.71),
  -- Black @ Annapolis: observed Good 180; est high 956 / flood 2,013
  ('07061500', 153, 180, 286, 956, 956, 2000, 3.67, 3.77, 4.09, 5.34, 5.35, 6.55),
  -- Black @ Poplar Bluff: MOHERP estimates (was flood-anchored 7,057)
  ('07063000', 340, 650, 990, 2060, 2060, 4100, -0.28, 0.66, 1.66, 4.79, 4.8, 10.37),
  -- Current above Akers: observed Good 150; danger = NPS closure 4.0 ft = 2,810
  ('07064533', 110, 150, 420, 1150, 1150, 2800, 0.59, 0.71, 1.3, 2.37, 2.38, 3.99),
  -- Jacks Fork @ Mtn View: observed Low 30 / Good 100; est high 490 / flood 1,200
  ('07065200', 30, 100, 100, 490, 490, 1200, 0.28, 0.93, 0.94, 2.49, 2.5, 4.06),
  -- Jacks Fork @ Alley: observed Good 100; est high 637; danger ~4 ft NPS-era ~ 1,000
  ('07065495', 76, 100, 159, 637, 637, 1000, 1.32, 1.49, 1.82, 3.32, 3.33, 3.96),
  -- Jacks Fork @ Eminence: observed Good 200; est high 904 / flood 1,693
  ('07066000', 176, 200, 313, 900, 900, 1700, 1.91, 1.98, 2.3, 3.43, 3.44, 4.51),
  -- Current @ Van Buren: observed Good 700; outfitter float < 4.5 ft, danger 5 ft
  ('07067000', 645, 700, 1190, 2700, 3000, 3450, 2.34, 2.44, 3.14, 4.52, 4.72, 5.0),
  -- Eleven Point @ Bardley: observed Good 300; est high 1,013 / flood 2,203
  ('07071500', 257, 300, 577, 970, 970, 2200, 2.07, 2.19, 2.78, 3.4, 3.41, 4.78),
  -- Spring @ Carthage: MOHERP estimates (was unsourced 800 danger)
  ('07185765', 47, 202, 356, 477, 477, 1770, 2.83, 3.46, 3.81, 4.03, 4.04, 5.72)
) AS v(site_id, tl, lo, omin, omax, hi, dng, atl, alo, aomin, aomax, ahi, adng)
JOIN gauge_stations gs ON gs.usgs_site_id = v.site_id
WHERE rg.gauge_station_id = gs.id AND rg.threshold_unit = 'cfs';

-- Part 3 — ft-primary Meramec secondaries.
-- Cook Station: danger 8 ft (~2,327 cfs, ~90x median) under-warned; NWS action
-- stage 5.5 ft (MOHERP est flood ~ 4.45 ft) is the defensible do-not-float.
-- Sullivan: danger 12 ft sat above the 11 ft NWS flood stage; NWS action 9 ft.
UPDATE river_gauges rg SET level_dangerous = v.dng, last_condition_code = NULL, threshold_updated_at = now()
FROM (VALUES ('07010350', 5.5), ('07014500', 9.0)) AS v(site_id, dng)
JOIN gauge_stations gs ON gs.usgs_site_id = v.site_id
WHERE rg.gauge_station_id = gs.id AND rg.threshold_unit = 'ft';
