-- 20260805171500_meramec_sullivan_high_below_dangerous.sql
--
-- APPLIED to production 2026-08-05 as 20260805171500, and recorded. Every
-- assertion below passed on the way in, including the last one: validate_river_data()
-- now returns threshold_order for jacks-fork only.
--
-- Clear the remaining threshold_order finding on meramec / "Meramec River near
-- Sullivan, MO" (ft) by moving level_high, which is the line that is wrong.
--
-- This is the sibling 20260804214409 named and deliberately left alone: same
-- defect, same cause, different gauge. That migration fixed Cook Station and
-- said in its header that fixing this one alongside it "would resolve findings
-- nobody reviewed". This is that review.
--
-- ── Why the finding did not clear yesterday ─────────────────────────────────
--
-- validate_river_data() emits threshold_order keyed on r.slug, not on the gauge
-- (20260804192753_validate_river_data_stable_gauge_key.sql). The ledger
-- fingerprints on check|entity_type|entity_key|rule_key, so every Meramec gauge
-- that fails this rule collapses into ONE finding on `meramec`. Cook Station
-- was genuinely repaired and stays repaired; the finding stayed open because
-- Sullivan still fails, and it reads as "returned 4x" only because it was
-- manually resolved three times while still true.
--
-- ── The finding ─────────────────────────────────────────────────────────────
--
-- validate_river_data() -> threshold_order, severity error:
--   "thresholds not strictly increasing on gauge Meramec River near
--    Sullivan, MO (ft)"
--
-- Live ladder (river_gauges, threshold_unit 'ft', is_primary false):
--
--   too_low  low   optimal_min  optimal_max  high   dangerous
--   2.00     3.00  4.00         7.00         9.00   9.00
--
-- Exactly one of the rule's five comparisons fires, the last one:
-- `level_high >= level_dangerous` (9.00 >= 9.00). Every other pair is already
-- strictly increasing. The EQUAL case, not the INVERTED case.
--
-- ── Which line is wrong ─────────────────────────────────────────────────────
--
-- Both read 9.00, so the ordering rule alone cannot say. The history can, and
-- it is the same two migrations that produced the Cook Station defect:
--
--   00071_fix_meramec_gauge_associations.sql set this gauge's whole ladder,
--   scaled on drainage area (1,475 sq mi):
--       2.0 / 3.0 / 4.0 / 7.0 / high 9.0 / dangerous 12.0    <- valid, ordered
--
--   00177_recalibrate_cfs_flood_thresholds.sql, Part 3, pulled the danger line
--   down onto the NWS action stage, and said why in its own header:
--       "Sullivan: danger 12 ft sat above the 11 ft NWS flood stage;
--        NWS action 9 ft."
--   It wrote level_dangerous = 9.0 and touched nothing else on the row.
--
-- So level_dangerous = 9.00 is the researched, sourced value and must not move.
-- level_high = 9.00 is a leftover from the ladder whose danger line was 12.0 --
-- 00177 lowered the ceiling onto the rung below it and left the rung there.
-- Raising level_dangerous to clear level_high would put the do-not-float line
-- back above the 11 ft NWS flood stage, which is precisely what 00177 removed.
--
-- ── Where the new value comes from ──────────────────────────────────────────
--
-- level_high 9.00 -> 7.01, i.e. one hundredth of a foot above level_optimal_max.
-- The value 20260804214409 predicted for this gauge, by the same derivation.
--
-- That is where "High" actually begins. classifyReading() computes
-- `highStart = levelOptimalMax ?? levelHigh` (shared/condition-ladder.ts:110),
-- buildZones() computes the same `highStart` for the band track
-- (shared/threshold-zones.ts:125), and FlowTrendChart's getZoneLabel() repeats
-- it. Any other value would put the chart's dashed "High" line somewhere the
-- app does not start grading High.
--
-- The +0.01 rather than a flat 7.00 follows 00177's own convention for ft
-- ladders: it wrote high = optimal_max in cfs (964/964, 1000/1000, 2000/2000)
-- but high = optimal_max + 0.01 in every ft ladder it produced (4.53/4.54,
-- 3.26/3.27, 5.24/5.25), so a ft ladder reads strictly increasing at the
-- column's own numeric(10,2) precision.
--
-- ── Why nothing is misgraded today, and what does change ────────────────────
--
-- classifyReading() tests dangerous first with `>=`, so a reading of exactly
-- 9.00 returns "dangerous" before the High branch is reached, and the High
-- branch reads levelOptimalMax anyway. level_high is unread while optimal_max
-- is set: no reading has ever been graded wrong by this row. The equal pair is
-- a latent trap -- null out optimal_max and the ladder silently starts High at
-- the danger line -- which this closes.
--
-- The two surfaces that DO read level_high raw are both corrected rather than
-- regressed, exactly as at Cook Station: FlowTrendChart's orange "High" dashed
-- line and the red "Flood" line currently sit on top of each other at 9.00 and
-- will separate, and remotion/src/components/GaugeBar.tsx stops positioning its
-- high-water line 2 ft above where the classifier calls the water high. That
-- file's GOOD band top, min(optimal_max, level_high), is 7.00 before and after.
--
-- No re-baseline is needed. Because level_high is unread, no reading
-- reclassifies, so last_condition_code is deliberately NOT nulled (00171/00177
-- null it only when a recalibration would otherwise fire spurious
-- easing/rising alerts from the gauge cron). threshold_updated_at is bumped
-- because a threshold value did change.
--
-- ── What this does and does not close ───────────────────────────────────────
--
-- Meramec's other three gauges already pass the rule (Cook Station 4.00/5.50
-- after 20260804214409, Eureka 6.00/8.00/12.00, Steelville 900/2300/5000), so
-- this clears the `meramec` threshold_order finding outright.
--
-- jacks-fork / "Jacks Fork near Mountain View, MO" (cfs) is still open and is
-- NOT touched here. It is a different rule branch -- level_low 100 >=
-- level_optimal_min 100, from 00177's own VALUES row -- and a different
-- judgment call about which of the two rungs is the wrong one.

-- ── The fix ─────────────────────────────────────────────────────────────────
-- WAS: level_high = 9.00 (scaled by 00071 under a level_dangerous of 12.0)
UPDATE river_gauges rg
SET level_high = 7.01,
    threshold_updated_at = now()
FROM gauge_stations gs, rivers r
WHERE gs.id = rg.gauge_station_id
  AND r.id = rg.river_id
  AND gs.usgs_site_id = '07014500'
  AND r.slug = 'meramec'
  AND rg.threshold_unit = 'ft';

-- ── Assertions ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  tl numeric; lo numeric; omin numeric; omax numeric; hi numeric; dng numeric;
  offenders int;
BEGIN
  SELECT rg.level_too_low, rg.level_low, rg.level_optimal_min,
         rg.level_optimal_max, rg.level_high, rg.level_dangerous
    INTO tl, lo, omin, omax, hi, dng
  FROM river_gauges rg
  JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
  JOIN rivers r ON r.id = rg.river_id
  WHERE gs.usgs_site_id = '07014500' AND r.slug = 'meramec' AND rg.threshold_unit = 'ft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sullivan ft ladder not found — nothing was updated';
  END IF;

  -- The sourced line must be exactly where 00177 put it.
  IF dng IS DISTINCT FROM 9.00 THEN
    RAISE EXCEPTION 'level_dangerous moved off the 9 ft NWS action stage: %', dng;
  END IF;

  -- The whole ladder, strictly increasing, every rung.
  IF NOT (tl < lo AND lo < omin AND omin < omax AND omax < hi AND hi < dng) THEN
    RAISE EXCEPTION 'Sullivan ladder not strictly increasing: % % % % % %',
      tl, lo, omin, omax, hi, dng;
  END IF;

  -- And the rule no longer fires anywhere on this river, which is what the
  -- ledger keys on. Asserting only on Sullivan would let the finding stay open
  -- while this migration reported success.
  SELECT count(*) INTO offenders
  FROM validate_river_data()
  WHERE check_name = 'threshold_order'
    AND river_slug = 'meramec';
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'threshold_order still fires on meramec (% rows)', offenders;
  END IF;
END $$;
