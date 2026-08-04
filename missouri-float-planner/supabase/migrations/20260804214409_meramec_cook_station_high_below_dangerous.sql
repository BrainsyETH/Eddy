-- 20260804214409_meramec_cook_station_high_below_dangerous.sql
--
-- NOT YET APPLIED. Run in the SQL editor, then record the version.
--
-- Clear the threshold_order finding on meramec / "Meramec River at Cook
-- Station, MO" (ft) by moving level_high, which is the line that is wrong.
--
-- ── The finding ─────────────────────────────────────────────────────────────
--
-- validate_river_data() -> threshold_order, severity error:
--   "thresholds not strictly increasing on gauge Meramec River at Cook
--    Station, MO (ft)"
--
-- Live ladder (river_gauges, threshold_unit 'ft', is_primary false):
--
--   too_low  low   optimal_min  optimal_max  high   dangerous
--   1.00     1.50  2.00         4.00         5.50   5.50
--
-- Exactly one of the rule's five comparisons fires, the last one:
-- `level_high >= level_dangerous` (5.50 >= 5.50). Every other pair is already
-- strictly increasing. This is the EQUAL case, not the INVERTED case, so
-- nothing is misgraded today — see "Why nothing is misgraded" below.
--
-- ── Which line is wrong ─────────────────────────────────────────────────────
--
-- Both lines read 5.50, so the ordering rule alone cannot say which to move.
-- The history does, and it is unambiguous:
--
--   00071_fix_meramec_gauge_associations.sql set this gauge's whole ladder by
--   scaling Sullivan/Eureka on drainage area (199 sq mi):
--       1.0 / 1.5 / 2.0 / 4.0 / high 5.5 / dangerous 8.0     <- valid, ordered
--
--   00165_backfill_nws_flood_stages.sql attached nws_lid CSNM7 and recorded
--   action_stage_ft = 5.5. NWPS publishes no flood stage for this site, which
--   is why flood_stage_ft is still null here (it is 11 at Sullivan, 19 at
--   Eureka, 12 at Steelville).
--
--   00177_recalibrate_cfs_flood_thresholds.sql, Part 3, pulled the danger line
--   down onto that action stage, and said why in its own header:
--       "Cook Station's (8 ft ~ 90x median flow) far over-permitted"
--       "NWS action stage 5.5 ft (MOHERP est flood ~ 4.45 ft) is the
--        defensible do-not-float"
--   It wrote level_dangerous = 5.5 and touched nothing else on the row.
--
-- So level_dangerous = 5.50 is the researched, sourced value and must not move.
-- level_high = 5.50 is a leftover from the ladder whose danger line was 8.0 --
-- 00177 lowered the ceiling onto the rung below it and left the rung there.
-- Raising level_dangerous to clear level_high would re-introduce precisely the
-- over-permissive danger line 00177 was written to remove.
--
-- ── Where the new value comes from ──────────────────────────────────────────
--
-- level_high 5.50 -> 4.01, i.e. one hundredth of a foot above level_optimal_max.
--
-- That is where "High" actually begins. classifyReading() computes
-- `highStart = levelOptimalMax ?? levelHigh` (shared/condition-ladder.ts:110),
-- buildZones() computes the same `highStart` for the band track
-- (shared/threshold-zones.ts:125), and FlowTrendChart's getZoneLabel() repeats
-- it. Any other value would put the chart's dashed "High" line somewhere the
-- app does not start grading High -- the bar-disagrees-with-badge defect that
-- condition-ladder.ts:107-109 exists to warn about.
--
-- The +0.01 rather than a flat 4.00 follows 00177's own convention for ft
-- ladders: it wrote high = optimal_max in cfs (964/964, 1000/1000, 2000/2000)
-- but high = optimal_max + 0.01 in every ft ladder it produced (4.53/4.54,
-- 3.26/3.27, 5.24/5.25), so a ft ladder reads strictly increasing at the
-- column's own numeric(10,2) precision. No gauge reports a hundredth of a foot
-- of difference and no reader can see one on a chart.
--
-- MOHERP's estimated flood onset (~4.45 ft, recorded in 00177's header) was
-- considered and rejected: 00177 maps MOHERP "est flood" to level_dangerous,
-- not to level_high, and it deliberately chose the 5.5 ft action stage over
-- that 4.45 for this gauge's danger line. Re-using 4.45 one rung down would
-- invent a band boundary nothing grades against.
--
-- ── Why nothing is misgraded today, and what does change ────────────────────
--
-- classifyReading() tests dangerous first with `>=`, so a reading of exactly
-- 5.50 returns "dangerous" before the High branch is reached, and the High
-- branch reads levelOptimalMax anyway. level_high is unread while optimal_max
-- is set: no reading has ever been graded wrong by this row. The equal pair is
-- a latent trap -- null out optimal_max and the ladder silently starts High at
-- the danger line -- which this closes.
--
-- Two surfaces DO read level_high raw, and both are corrected rather than
-- regressed by this:
--
--   FlowTrendChart draws one dashed line per threshold, so the orange "High"
--     line and the red "Flood" line sit on top of each other at 5.50 today.
--     After this they separate, and the "High" line lands on the edge of the
--     orange High shading, which the same file already starts at optimal_max.
--
--   remotion/src/components/GaugeBar.tsx positions its dashed high-water line
--     at levelHigh, and flips the compact bar's fill color at levelHigh. Both
--     sit 1.5 ft above where the classifier actually calls the water high --
--     the exact mismatch that file's own comment (lines 216-219) records
--     having caused a "high" reading to render inside the green GOOD zone on
--     Spring River @ Carthage. Its GOOD band top, min(optimal_max, level_high),
--     is 4.00 before and after. No fixture or test references this gauge.
--
-- No re-baseline is needed. Because level_high is unread, no reading
-- reclassifies, so last_condition_code is deliberately NOT nulled (00171/00177
-- null it only when a recalibration would otherwise fire spurious
-- easing/rising alerts from the gauge cron). threshold_updated_at is bumped
-- because a threshold value did change.
--
-- ── Deliberately NOT in this migration ──────────────────────────────────────
--
-- Two other gauges fail threshold_order right now. Each is its own finding with
-- its own ledger identity, and neither is the gauge this one names:
--
--   meramec / Meramec River near Sullivan, MO (ft) -- the identical defect from
--     the identical cause: 00177 Part 3 pulled dangerous 12.0 -> 9.0 onto a
--     level_high of 9.0 left over from 00071. Same reasoning would give
--     level_high = 7.01 against optimal_max 7.00.
--   jacks-fork / Jacks Fork near Mountain View, MO (cfs) -- a different rule
--     branch (level_low 100 >= level_optimal_min 100, from 00177's own VALUES
--     row) and a different judgment call.
--
-- Fixing them here would resolve findings nobody reviewed. They are named so
-- the next reviewer does not have to re-derive them.

-- ── The fix ─────────────────────────────────────────────────────────────────
-- WAS: level_high = 5.50 (scaled by 00071 under a level_dangerous of 8.0)
UPDATE river_gauges rg
SET level_high = 4.01,
    threshold_updated_at = now()
FROM gauge_stations gs, rivers r
WHERE gs.id = rg.gauge_station_id
  AND r.id = rg.river_id
  AND gs.usgs_site_id = '07010350'
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
  WHERE gs.usgs_site_id = '07010350' AND r.slug = 'meramec' AND rg.threshold_unit = 'ft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cook Station ft ladder not found — nothing was updated';
  END IF;

  -- The sourced line must be exactly where 00177 put it.
  IF dng IS DISTINCT FROM 5.50 THEN
    RAISE EXCEPTION 'level_dangerous moved off the 5.5 ft NWS action stage: %', dng;
  END IF;

  -- The whole ladder, strictly increasing, every rung.
  IF NOT (tl < lo AND lo < omin AND omin < omax AND omax < hi AND hi < dng) THEN
    RAISE EXCEPTION 'Cook Station ladder not strictly increasing: % % % % % %',
      tl, lo, omin, omax, hi, dng;
  END IF;

  -- And the rule itself no longer fires for this gauge.
  SELECT count(*) INTO offenders
  FROM validate_river_data()
  WHERE check_name = 'threshold_order'
    AND detail LIKE '%Cook Station%';
  IF offenders <> 0 THEN
    RAISE EXCEPTION 'threshold_order still fires on Cook Station';
  END IF;
END $$;
