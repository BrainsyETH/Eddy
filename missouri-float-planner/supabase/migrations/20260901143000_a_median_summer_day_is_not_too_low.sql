-- 20260901143000_a_median_summer_day_is_not_too_low.sql
--
-- NOT YET APPLIED. Written for review; apply by hand against
-- EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur and then record it, per
-- scripts/ingestion/README.md guardrail #5. Nothing in this repo applies
-- migrations automatically.
--
-- Pull the FLOOR lines on two spring-stabilised reaches down onto the record
-- they are supposed to describe: Jacks Fork @ Eminence and Meramec @ Steelville.
--
-- REPORTED (owner, 2026-09-01):
--   * "Floats past Alley Spring are usually good to go" -- the Eminence gauge
--     disagrees.
--   * "The Steelville Meramec currently says Low-Scraping. Rafts take that
--     section all the time."
--
-- ── The defect ──────────────────────────────────────────────────────────────
--
-- The same one 20260803 found on the Current @ Doniphan and the Black @ Poplar
-- Bluff, on two gauges that migration did not reach: the floor lines sit at or
-- above the gauge's own median flow, so an ORDINARY day grades below "Good".
--
-- Measured against each site's day-of-year percentiles from
-- api.waterdata.usgs.gov (statistics/v0, the source
-- src/lib/flow-providers/usgs-statistics.ts already reads), pulled 2026-09-01.
-- Both are long records: Eminence 104 approved years, Steelville 104.
--
--   gauge                     Jul-Oct p50   line that fires    what it says
--   Jacks Fork @ Eminence        172 cfs    too_low  176       "wading only"
--   Meramec  @ Steelville        178 cfs    low      250       "scraping likely"
--
-- Read that first row again: at Eminence the TOO LOW line is ABOVE the median
-- flow for July through October. The median September day (169 cfs) and the
-- median October day (167 cfs) both render "Too Low - Not Recommended ...
-- Recommended for wading only" on the reach that Alley Spring feeds -- the one
-- stretch of the Jacks Fork that everybody agrees holds water.
--
-- On the Meramec the same line one rung up. Steelville read 204 cfs / 1.40 ft
-- on the morning this was written, which is ABOVE the median for the date
-- (Sep-1 p50 = 174), and the badge said "Low - Scraping Likely". A gauge that
-- calls an above-median day scraping has no way left to say scraping when the
-- river actually is.
--
-- ── Why the Jacks Fork is no longer deferred ────────────────────────────────
--
-- 20260803 deliberately held all three Jacks Fork ladders back, and asserted
-- that it had. Its reason was specific and it has now been checked, not
-- assumed:
--
--   "Recalibrating against a record the agency has flagged would bake
--    compensation for a sensor fault into the ladder, and the corrected record
--    will move the very percentiles the new floors are anchored on."
--
-- The second clause is the one that gates this migration, and it turns out not
-- to hold. USGS daily statistics are computed from APPROVED daily means only --
-- the service says so in its own header, and the rows prove it: every Eminence
-- day-of-year record returned on 2026-09-01 reads begin_yr 1922, end_yr 2025,
-- count 104. Water year 2026 -- the provisional stretch USGS flagged -- is not
-- in these percentiles at all and cannot move them. The anchors below are 104
-- approved years ending in 2025.
--
-- The first clause still stands, and nothing here compensates for it. The
-- mass-balance failure is NOT fixed; it was re-measured for this migration.
-- Eminence (07066000) minus Alley Spring (07065495), which is the implied Alley
-- Spring contribution because the upstream gauge sits above the spring inflow:
--
--   Jul 24-27    69.0  71.2  71.6  58.4
--   Jul 28-31    39.6  36.3  25.5  41.5     <- 20260803 saw this
--   Aug 1-3      66.8   9.9  16.7
--   Aug 20-31    42.6  40.7  37.7  40.1  46.3  45.6  46.0  41.8  44.6  43.7  47.6  43.2
--
-- So the whipsaw has stopped, but it settled onto a plateau near 43 cfs rather
-- than returning to the ~70 it left. Both series are still provisional. That is
-- a live-reading problem and it is recorded here as one; it is not a reason to
-- leave a 104-year ladder mis-anchored, and no line below is placed to make
-- today's suspect 87 cfs read differently than it does.
--
-- ── Where the new lines come from ───────────────────────────────────────────
--
-- Same policy as 20260803: level_too_low ~ p5 of low-season flow, level_low
-- ~ p25, and the optimal band placed on observed float ratings rather than on
-- percentiles. Low season is Jul-Oct, the months the complaints are about.
--
--   site        p05   p25   p50   p75   104-yr record min
--   07066000    102   137   172   225   67
--   07013000    106   145   178   246   76
--
-- Jacks Fork @ Eminence -- two independent observed anchors agree, and both sit
-- far above the old too_low line:
--   * missouriscenicrivers.com (already source #3 in 00177) publishes, for the
--     Eminence gauge, "average ~2.0 ft" and "below 2.0 ft you may drag your
--     canoe in spots, especially if fully loaded". Through the USGS exsa rating
--     curve 2.0 ft = 186 cfs. The outfitters' AVERAGE is 10 cfs above Eddy's
--     "wading only" line.
--   * MOHERP's OBSERVED Good onset here is 200 cfs (recorded in 00177's own
--     header). 00177 mapped it to level_low correctly; what it got wrong is
--     everything below it.
--   "May drag in spots, especially if fully loaded" is not the too_low copy
--   ("frequent dragging ... wading only"), it is almost word for word the good
--   copy ("floatable, some shallow spots possible"). So the good floor goes
--   just under the outfitter average, at 150 (p25 137 < 150 < 186), the low
--   band gets real width beneath it, and too_low drops to the p5.
--   level_optimal_min 313 came from MOHERP's ESTIMATED Low onset, which sits
--   ABOVE its own observed Good onset -- 20260803 named this and could not fix
--   it -- so "Flowing" could not begin until the river was well past good. It
--   moves to 250, clear of the outfitter average and ~p78 of the low season.
--
-- Meramec @ Steelville -- MOHERP is ESTIMATED end to end on this gauge (00177
-- recorded only its est high ~1,009 and est flood; the site's estimated Good
-- onset, ~543 cfs, is the ~p90 of a normal August and is exactly the kind of
-- number 20260803 was written to stop trusting). With no observed onset the
-- percentile anchors carry the floors on their own, which is the rule
-- 20260803 set for that case. level_optimal_min is deliberately LEFT at 300:
-- the one observed report available for this gauge puts "very little scraping"
-- at 330 cfs, so 300 is the right place for "Flowing" to start and only the
-- floors below it were ever wrong.
--
-- ft (alt) ladders are converted through each site's USGS exsa rating curve, so
-- the primary and alt ladders keep describing the same water, per 00177. Only
-- the rungs that move are re-converted. The rungs left alone have drifted about
-- 0.05 ft from today's curve (Eminence optimal_max 3.43 stored vs 3.48
-- computed; Steelville 2.75 vs 2.83) -- below anything a reader can see on a
-- chart, and re-syncing them would be a silent edit to lines this migration
-- says it is not touching.
--
-- ── What is NOT changed, and why ────────────────────────────────────────────
--
-- level_optimal_max / level_high / level_dangerous stay exactly where 00177 and
-- the owner decision put them on both gauges. This migration moves floors. The
-- safety side of the ladder is not part of the reported defect and nothing in
-- this investigation suggests it under-warns.
--
-- The other two Jacks Fork ladders stay put. Alley Spring (07065495) is the
-- other half of the unresolved mass-balance pair and carries a 33-year record
-- where Eminence has 104, so one bad water year is 3% of its history rather
-- than under 1%; Mountain View (07065200) is the upper river, which genuinely
-- does go unfloatable, and it additionally carries the open threshold_order
-- finding named in 20260804214409 (level_low 100 >= level_optimal_min 100).
-- Neither is what was reported. Both want their own migration.
--
-- North Fork @ Tecumseh (07057500) was measured alongside these two and shows
-- the same shape -- too_low 285 against a Jul-Oct p05 of 258 and p20 of 307, so
-- roughly one late-summer day in six reads "wading only" on a reach the owner
-- describes as floatable year-round below Rainbow Spring. It is left alone
-- here because it was not part of the reported defect and has not been checked
-- against an observed rating yet. Named so the next reviewer does not have to
-- re-derive it.
--
-- last_condition_code re-baseline: mirrors 00171/00177/20260803. Steelville
-- reclassifies low -> good at today's flow, which the gauge cron would
-- otherwise post as a spurious easing alert, so the stamp is NULLed and the
-- next pass re-baselines silently. Display is unaffected -- pages compute
-- condition live.

-- ─────────────────────────────────────────────────────────────────────────────
-- The fix
-- ─────────────────────────────────────────────────────────────────────────────
--
--   Jacks Fork @ Eminence   too_low 176 -> 100   low 200 -> 150   optimal_min 313 -> 250
--   Meramec  @ Steelville   too_low 130 -> 105   low 250 -> 145   optimal_min 300 (held)
--
-- Steelville's optimal_min is restated in the VALUES row at its current value
-- so both gauges go through one statement; it is a no-op on that column.
--
UPDATE river_gauges rg SET
  level_too_low     = v.tl,
  level_low         = v.lo,
  level_optimal_min = v.omin,
  alt_level_too_low     = v.atl,
  alt_level_low         = v.alo,
  alt_level_optimal_min = v.aomin,
  threshold_source = 'editorial',
  last_condition_code = NULL,
  threshold_updated_at = now()
FROM (VALUES
  -- site      river          cfs: tl  lo  omin | ft: atl  alo  aomin
  ('07066000', 'jacks-fork', 100, 150, 250, 1.69, 1.88, 2.19),
  ('07013000', 'meramec',    105, 145, 300, 1.20, 1.32, 1.63)
) AS v(site_id, river_slug, tl, lo, omin, atl, alo, aomin)
JOIN gauge_stations gs ON gs.usgs_site_id = v.site_id
JOIN rivers r ON r.slug = v.river_slug
WHERE rg.gauge_station_id = gs.id
  AND rg.river_id = r.id
  AND rg.threshold_unit = 'cfs';

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants
-- ─────────────────────────────────────────────────────────────────────────────
-- Every check asserts a POSITIVE row count before it asserts a property, per
-- 20260803: a guard written only as "no bad rows found" also passes when a
-- mistyped site id made the UPDATE match nothing.
DO $$
DECLARE
    lad RECORD;
    v_count INT;
BEGIN
    -- 1. The UPDATE landed on exactly the two rows it names.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN rivers r ON r.id = rg.river_id
    JOIN (VALUES ('07066000', 'jacks-fork', 100, 150, 250),
                 ('07013000', 'meramec',    105, 145, 300)) AS e(site_id, river_slug, tl, lo, omin)
      ON e.site_id = gs.usgs_site_id AND e.river_slug = r.slug
    WHERE rg.threshold_unit = 'cfs'
      AND (rg.level_too_low, rg.level_low, rg.level_optimal_min) = (e.tl, e.lo, e.omin);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'floors: expected 2 recalibrated ladders, found %', v_count;
    END IF;

    -- 2. The point of the change: on BOTH gauges a median low-season day must
    --    now grade at least "Good". classifyReading()'s good floor is level_low
    --    (shared/condition-ladder.ts), so that is the line to test. These are
    --    the Jul-Oct p50 values read from USGS statistics/v0 on 2026-09-01,
    --    asserted rather than recomputed so the check stays deterministic and
    --    offline.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07066000', 172), ('07013000', 178)) AS m(site_id, median)
      ON m.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs' AND rg.level_low > m.median;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'floors: % gauge(s) still grade their median Jul-Oct flow below Good', v_count;
    END IF;

    -- 3. And no floor may sit at or below the 104-year record minimum, which is
    --    the other way to get this wrong: a ladder that can never say too_low.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07066000', 67), ('07013000', 76)) AS n(site_id, record_min)
      ON n.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs' AND rg.level_too_low <= n.record_min;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'floors: % gauge(s) put too_low at or under the record minimum', v_count;
    END IF;

    -- 4. The safety side is untouched. Asserted as equality on the stored
    --    values, not as "nothing changed", so a future edit that moves them has
    --    to come here and say so.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07066000', 900, 900, 1700),
                 ('07013000', 900, 2300, 5000)) AS s(site_id, omax, hi, dng)
      ON s.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs'
      AND (rg.level_optimal_max, rg.level_high, rg.level_dangerous) = (s.omax, s.hi, s.dng);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'floors: expected 2 untouched safety ladders, found %', v_count;
    END IF;

    -- 5. Both ladders, both units, strictly increasing on every rung the
    --    validator tests. An out-of-order ladder does not error at read time --
    --    classifyReading just skips a band -- so it has to be caught on write.
    FOR lad IN
        SELECT gs.name,
               rg.level_too_low t, rg.level_low l, rg.level_optimal_min omin,
               rg.level_optimal_max omax, rg.level_high hi, rg.level_dangerous dng,
               rg.alt_level_too_low at, rg.alt_level_low al, rg.alt_level_optimal_min aomin,
               rg.alt_level_optimal_max aomax, rg.alt_level_high ahi, rg.alt_level_dangerous adng
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE gs.usgs_site_id IN ('07066000', '07013000')
          AND rg.threshold_unit = 'cfs'
    LOOP
        IF NOT (lad.t < lad.l AND lad.l < lad.omin AND lad.omin < lad.omax
                AND lad.omax < lad.dng AND lad.hi < lad.dng) THEN
            RAISE EXCEPTION 'floors: % cfs ladder is not ordered (% % % % % %)',
                lad.name, lad.t, lad.l, lad.omin, lad.omax, lad.hi, lad.dng;
        END IF;
        IF NOT (lad.at < lad.al AND lad.al < lad.aomin AND lad.aomin < lad.aomax
                AND lad.aomax < lad.adng AND lad.ahi < lad.adng) THEN
            RAISE EXCEPTION 'floors: % ft ladder is not ordered (% % % % % %)',
                lad.name, lad.at, lad.al, lad.aomin, lad.aomax, lad.ahi, lad.adng;
        END IF;
    END LOOP;

    -- 6. The validator itself must be clean for these two gauges afterwards.
    SELECT count(*) INTO v_count
    FROM validate_river_data()
    WHERE check_name = 'threshold_order'
      AND (detail LIKE '%Jacks Fork at Eminence%' OR detail LIKE '%Meramec River near Steelville%');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'floors: threshold_order still fires on a recalibrated gauge';
    END IF;

    -- 7. The two Jacks Fork ladders this migration does NOT touch must still be
    --    sitting at 00177's values. If this fires, someone widened the change
    --    without redoing the percentile work for them.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07065200', 30, 100, 100), ('07065495', 76, 100, 159)) AS j(site_id, tl, lo, omin)
      ON j.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs'
      AND (rg.level_too_low, rg.level_low, rg.level_optimal_min) = (j.tl, j.lo, j.omin);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'floors: expected 2 untouched Jacks Fork ladders at 00177 values, found %', v_count;
    END IF;
END $$;
