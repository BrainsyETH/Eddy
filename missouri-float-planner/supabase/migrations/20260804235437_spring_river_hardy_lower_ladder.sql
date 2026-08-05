-- APPLIED to production 2026-08-04 as 20260804235437.
--
-- Recalibrate the bottom of the Spring River ladder at Hardy, AR (07069305).
-- Closes `no_too_low_anchor` for river `spring-river`.
--
-- ── Why setting only level_too_low was not possible ─────────────────────
--
-- The finding asks for one value. This gauge could not take one, because the
-- ladder above it was already in the way:
--
--   level_too_low        NULL          <- the finding
--   level_low            NULL
--   level_optimal_min     206
--   level_optimal_max     694
--   level_high          1,000
--   level_dangerous     1,800
--
-- Measured from usgs_daily_percentiles for site 07069305 (parameter 00060) over
-- day-of-year 152-258, June 1 to September 15, across 24 years of record:
--
--   p05   286.2 cfs
--   p10   342.3
--   p25   474.9
--   p50   640.5
--   p75   893.4
--
-- optimal_min was 206 — BELOW the 5th percentile of summer flow. "Flowing/ideal"
-- therefore began under almost every day the river has on record, so the badge
-- had nowhere below it to go and effectively could not report anything but a
-- floatable river. Anchoring level_too_low at p05 the way the method prescribes
-- would have put it at 286, ABOVE that optimal_min, and produced a ladder that
-- says "Too Low" and "ideal" about the same flow.
--
-- That is the same defect class 20260803170000 corrected on the lower Current
-- and the Black, in the opposite direction: there the floor sat above the
-- median August day, here the ideal band's floor sits below the 5th percentile.
--
-- ── The lower ladder, anchored to this gauge's own record ───────────────
--
--   level_too_low       200   the driest day-of-year p05 in the record is 199.5,
--                             so this fires in genuinely dry years and not in an
--                             ordinary summer. Mammoth Spring holds the baseflow
--                             up; this river does not often get unfloatable, and
--                             a floor that pretends otherwise is a false alarm
--                             on the one badge people act on.
--   level_low           286   summer p05
--   level_optimal_min   475   summer p25
--
-- ── What is deliberately unchanged ──────────────────────────────────────
--
-- optimal_max (694), level_high (1,000) and level_dangerous (1,800) are the
-- upper half and no finding reports them. 694 still sits sensibly above the new
-- optimal_min — the ideal band becomes roughly p25 to p55 of summer flow — and
-- the high-water lines are a safety call with a different provenance from the
-- percentile method used here. Changing them would be a separate decision with
-- separate evidence.
--
-- Only the primary gauge is touched. Imboden (07069500) is secondary and
-- carries no thresholds at all; the rule only asserts against is_primary.

UPDATE river_gauges rg
   SET level_too_low = 200,
       level_low = 286,
       level_optimal_min = 475,
       threshold_updated_at = now()
  FROM rivers r, gauge_stations gs
 WHERE rg.river_id = r.id
   AND rg.gauge_station_id = gs.id
   AND r.slug = 'spring-river'
   AND gs.usgs_site_id = '07069305'
   AND rg.is_primary = true;

-- ---------------------------------------------------------------------------
-- Assert the whole ladder is strictly increasing, not just the rung this
-- migration was asked for. threshold_order is an ERROR-severity rule and
-- trading one finding for another would not be a fix.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v record;
BEGIN
    SELECT rg.level_too_low AS too_low, rg.level_low AS low,
           rg.level_optimal_min AS opt_min, rg.level_optimal_max AS opt_max,
           rg.level_high AS high, rg.level_dangerous AS dangerous
      INTO v
      FROM river_gauges rg
      JOIN rivers r ON r.id = rg.river_id
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE r.slug = 'spring-river' AND gs.usgs_site_id = '07069305' AND rg.is_primary = true;

    IF v.too_low IS NULL THEN
        RAISE EXCEPTION 'spring-river primary gauge still has no level_too_low';
    END IF;
    IF NOT (v.too_low < v.low AND v.low < v.opt_min AND v.opt_min < v.opt_max
            AND v.opt_max < v.dangerous AND v.high < v.dangerous) THEN
        RAISE EXCEPTION 'spring-river ladder not strictly increasing: % % % % % %',
            v.too_low, v.low, v.opt_min, v.opt_max, v.high, v.dangerous;
    END IF;
END $$;

-- Confirmed on production after applying, rather than trusted from this file:
--   select * from public.validate_river_data()
--    where river_slug = 'spring-river' and check_name in ('no_too_low_anchor','threshold_order');
-- returned no rows. The stored ladder reads 200 / 286 / 475 / 694 / 1000 / 1800.
