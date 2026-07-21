-- supabase/migrations/00179_revert_buffalo_james_conservative.sql
--
-- Owner decision: revert Buffalo @ St. Joe and James @ Galena to the
-- conservative MOHERP-based ladders from 00177, undoing 00178's switch to
-- the NPS-chart / outfitter operational tiers.
--
-- Rationale: the 00178 lines (Buffalo closed > 11.76 ft = 8,580 cfs; James
-- no-boats > 8 ft = 4,410 cfs) are operational limits for outfitters running
-- experienced customers — not the level where a casual floater should stay
-- off the water. Eddy's "Dangerous — Do Not Float" is aimed at the general
-- floating public, so the earlier, lower MOHERP-derived onsets are the right
-- fit (James observed flood onset 3,000 cfs; Buffalo estimated flood 4,300).
-- The outfitter/NPS tiers remain documented in 00178's comments for
-- reference: on the James, 3,079-4,410 cfs (7-8 ft) is "experienced only"
-- per James River Outfitters, which our "High" band's upper reaches now
-- conservatively cover as dangerous.

UPDATE river_gauges rg SET
  level_too_low = v.tl, level_low = v.lo, level_optimal_min = v.omin,
  level_optimal_max = v.omax, level_high = v.hi, level_dangerous = v.dng,
  alt_level_too_low = v.atl, alt_level_low = v.alo, alt_level_optimal_min = v.aomin,
  alt_level_optimal_max = v.aomax, alt_level_high = v.ahi, alt_level_dangerous = v.adng,
  threshold_source_url = 'https://rivers.moherp.org/gauge/?gauge=' || v.site_id,
  last_condition_code = NULL,
  threshold_updated_at = now()
FROM (VALUES
  -- Buffalo @ St. Joe: MOHERP observed Low 120 / High 2,000; est flood 4,313
  ('07056000', 32, 127, 356, 2000, 2000, 4300, 2.65, 3.18, 3.92, 6.61, 6.62, 8.86),
  -- James @ Galena: MOHERP observed Good 180 / observed Flood 3,000
  ('07052500', 97, 180, 358, 921, 921, 3000, 3.6, 3.97, 4.45, 5.24, 5.25, 6.95)
) AS v(site_id, tl, lo, omin, omax, hi, dng, atl, alo, aomin, aomax, ahi, adng)
JOIN gauge_stations gs ON gs.usgs_site_id = v.site_id
WHERE rg.gauge_station_id = gs.id AND rg.threshold_unit = 'cfs';
