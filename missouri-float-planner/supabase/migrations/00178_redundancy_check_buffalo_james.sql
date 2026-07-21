-- supabase/migrations/00178_redundancy_check_buffalo_james.sql
--
-- Redundancy pass on 00177: cross-match every recalibrated ladder against
-- sources INDEPENDENT of MOHERP. Two gauges needed correction; the rest
-- validated (see below).
--
-- BUFFALO @ ST. JOE (07056000): the NPS floating-levels chart (as published
-- by Wild Bill's Outfitter — Grinder's Ferry/Tyler Bend tier, which is the
-- St. Joe gauge) is the park's own operational guidance and outranks the
-- MOHERP statistical estimate 00177 used:
--   Very Low < 3.3 ft | Low-but-floatable 3.3-3.83 | Ample 3.83-7.94
--   | Experienced only 7.94-11.76 | River CLOSED > 11.76 ft
-- Converted via the USGS exsa rating: 162 / 324 / 3,261 / 8,582 cfs.
-- (Notably ~8,580 vindicates the pre-00177 editorial danger of 8,000.)
--
-- JAMES @ GALENA (07052500): James River Outfitters' posted policy —
-- "experienced floaters only between 7 and 8 ft; no boats above 8 ft, no
-- exceptions." Via the rating curve, 7 ft = 3,079 cfs and 8 ft = 4,410 cfs:
-- EXACTLY the pre-00177 level_high/level_dangerous, which turn out to have
-- encoded these outfitter tiers all along. 00177's MOHERP-observed 3,000
-- mislabeled the experienced-only onset as do-not-float; restore the
-- outfitter mapping (high/experienced band up to 4,410 = dangerous onset).
-- MOHERP-estimated early-caution onset (921 cfs) kept as optimal_max.
--
-- VALIDATED BY INDEPENDENT SOURCES (no change):
--   * Eleven Point: missouriscenicrivers/USFS — "3-3.5 ft optimal; 5 ft is
--     the highest an outfitter will put in and the Forest Service closes the
--     river" vs our optimal 2.78-3.40 ft, dangerous 4.78 ft.
--   * North Fork: trip reports — 422 cfs "low but floatable, some dragging"
--     (our low band 285-475), 531 runnable (our good band), 1,100 "wild and
--     fast" (our high band 1,000-2,200).
--   * Current/Akers/Jacks Fork: NPS Ozark Riverways closure practice (00177).
--   * Meramec @ Steelville: OzarkAnglers/MOHERP agreement + owner decision.
-- SINGLE-SOURCE (MOHERP only; no independent numbers found — flagged for
-- future local input): Black @ Annapolis & Poplar Bluff, Bourbeuse, Bryant,
-- Niangua, Spring @ Carthage.

UPDATE river_gauges rg SET
  level_too_low = v.tl, level_low = v.lo, level_optimal_min = v.omin,
  level_optimal_max = v.omax, level_high = v.hi, level_dangerous = v.dng,
  alt_level_too_low = v.atl, alt_level_low = v.alo, alt_level_optimal_min = v.aomin,
  alt_level_optimal_max = v.aomax, alt_level_high = v.ahi, alt_level_dangerous = v.adng,
  threshold_source_url = v.url,
  last_condition_code = NULL,
  threshold_updated_at = now()
FROM (VALUES
  -- Buffalo @ St. Joe: NPS chart tiers via USGS rating (ft: 3.3/3.83/7.94/11.76)
  ('07056000', 162, 324, 324, 3260, 3260, 8580, 3.3, 3.83, 3.84, 7.94, 7.95, 11.76,
   'https://www.wildbillsoutfitter.com/floating-levels-guides'),
  -- James @ Galena: outfitter tiers (7 ft = 3,079 experienced-only; 8 ft = 4,410 no boats)
  ('07052500', 97, 180, 358, 921, 3079, 4410, 3.6, 3.97, 4.45, 5.24, 7.0, 8.0,
   'https://jamesriveroutfitters.com/water-levels/')
) AS v(site_id, tl, lo, omin, omax, hi, dng, atl, alo, aomin, aomax, ahi, adng, url)
JOIN gauge_stations gs ON gs.usgs_site_id = v.site_id
WHERE rg.gauge_station_id = gs.id AND rg.threshold_unit = 'cfs';
