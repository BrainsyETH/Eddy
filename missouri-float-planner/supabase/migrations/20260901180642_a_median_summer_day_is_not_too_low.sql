-- 20260901180642_a_median_summer_day_is_not_too_low.sql
--
-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-09-01 18:06:42 UTC on owner
-- authorization, and RECORDED in the same transaction. All nine assertions
-- below passed against the live rows; threshold_updated_at on both gauges reads
-- 2026-09-01 18:06:42.946003+00.
--
-- The file was authored as 20260901143000 and RENAMED to the version the
-- recording actually assigned. Migrations here are applied through the Supabase
-- API, which stamps its own timestamp rather than honouring the filename, so
-- the two disagree unless the file is renamed afterwards. Three earlier
-- migrations were not renamed and were drifted when this was written; they
-- were renamed on 2026-09-02, and the record of applied versions now lives in
-- supabase/production-migrations.txt, checked by scripts/migration-ledger.test.ts.
-- Rename after applying; the filename and the ledger are the only places the
-- version is checkable from the repo.
--
-- Nothing in this repo applies migrations automatically.
--
-- Pull one FLOOR line on each of two reaches that float later into the season
-- than their ladders allow: Jacks Fork @ Eminence and Meramec @ Steelville.
-- (They get there differently -- Alley Spring carries the Jacks Fork reach,
-- while the Meramec is rain-fed and among the flashiest rivers in the Ozarks.
-- Only the symptom is shared.)
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
-- Bluff, on two gauges that migration did not reach: a floor line sitting at or
-- above the gauge's own median flow, so an ORDINARY day grades below "Good".
--
--   gauge                     Jul-Oct p50   line that fired    what it said
--   Jacks Fork @ Eminence        172 cfs    too_low  176       "wading only"
--   Meramec  @ Steelville        178 cfs    low      250       "scraping likely"
--
-- Read that first row again: at Eminence the TOO LOW line was ABOVE the median
-- flow for July through October, and above the 186 cfs that the outfitters call
-- this gauge's AVERAGE (see sources). The median September and October day
-- rendered "Too Low - Not Recommended ... Recommended for wading only" on the
-- reach Alley Spring feeds -- the one stretch of the Jacks Fork everybody
-- agrees holds water.
--
-- Steelville read 204 cfs / 1.40 ft on the morning this was reported, which is
-- ABOVE the median for the date (Sep-1 p50 = 174), and the badge said "Low -
-- Scraping Likely" on water the Steelville outfitters raft all season.
--
-- ── Where each new line comes from, and what it is NOT ──────────────────────
--
-- scripts/ingestion/README.md guardrail #2 is categorical and load-bearing:
-- "moherp OBSERVED = trusted (accuracy-approved). moherp ESTIMATED + USGS
-- percentiles = REJECTED as thresholds." Flow frequency is not channel
-- navigability, and this repo has been burned in both directions by pretending
-- otherwise. So percentiles appear below in exactly ONE role -- as evidence
-- that an existing line CONTRADICTS the reach -- and never as the derivation of
-- a replacement.
--
-- That reductio is conditional, not general. "A gauge whose median day reads
-- wading-only is broken" holds only where independent evidence already
-- establishes the reach as ordinarily floatable in that season; on a reach that
-- genuinely dries up, a median summer day SHOULD read too_low. The upper Jacks
-- Fork at Mountain View (07065200) is the counterexample sitting in this same
-- river, and nothing here licenses touching it. Both gauges below clear that
-- bar independently of any percentile: Eminence on the outfitter average and
-- MOHERP's observed onset, Steelville on the owner's report of routine rafting.
--
-- Every value that MOVES is observed, outfitter-published, or owner-approved:
--
--   07066000 too_low  = 100  OWNER-APPROVED (2026-09-01), asked and answered
--                            directly. Corroborated only in the weak sense that
--                            it sits clear of the outfitter drag line above and
--                            above the 104-yr record low of 67.
--   07066000 low      = 200  UNCHANGED. MOHERP OBSERVED "Good" onset, recorded
--                            in 00177's header. 00177 mapped it correctly and
--                            there is no observed reason to move it. An earlier
--                            draft of this migration lowered it to 150 to make
--                            a median summer day read "Good"; that number had
--                            no anchor and is withdrawn. A median Jul-Oct day
--                            now reads `low` -- "Floatable but expect occasional
--                            scraping. Lighter boats recommended." -- which is
--                            both honest and what the outfitter guidance
--                            literally says.
--   07013000 low      = 145  OWNER-APPROVED (2026-09-01). The owner reported
--                            this section as routinely rafted while the gauge
--                            read 204 cfs, and on being asked how far below 204
--                            that holds, set the good floor here.
-- This migration therefore moves exactly ONE line per gauge. Everything else on
-- both rows is held, including two lines that are arguably wrong:
--
-- HELD, 07013000 level_too_low = 130. An earlier draft lowered it to 105 off
-- the Jul-Oct p5. Nobody reported it, no observed or owner anchor exists, and
-- guardrail #2 forbids the percentile. The cost is accepted knowingly: `low` is
-- only 15 cfs wide here (130-145), so the Meramec steps from "Good" to "wading
-- only" across a narrow band. That wants an observed anchor, not a guess.
--
-- HELD, 07066000 level_optimal_min = 313. Its PROVENANCE is bad -- it is
-- MOHERP's ESTIMATED "Low" onset, which guardrail #2 rejects as a threshold
-- source. An earlier draft replaced it with 250 and argued the old value was
-- structurally wrong because "Flowing could not begin until the river was
-- already past Good". That argument is void: every correctly ordered ladder
-- goes Good then Flowing -- level_low < level_optimal_min is exactly what
-- validate_river_data() requires -- so position above the 200 observed onset is
-- not evidence of anything. 20260803 used the same framing and it was loose
-- there too.
--
-- Stripped of that, 250 was an unsourced number replacing an unsourced number,
-- on a line nobody reported, changing what paddlers see (272 cfs would have
-- flipped Good -> Flowing) on no evidence at all. So 313 stays until an
-- observed, outfitter, or owner anchor exists for this rung. Flagged, not
-- fixed -- the same treatment as the Steelville floor above and the North Fork
-- below. Being sourced from a rejected source makes a line unsourced; it does
-- not make any particular replacement correct.
--
-- ── Why the Jacks Fork is no longer deferred ────────────────────────────────
--
-- 20260803 deliberately held all three Jacks Fork ladders back, and asserted
-- that it had. Its reason was specific and has been checked, not assumed:
--
--   "Recalibrating against a record the agency has flagged would bake
--    compensation for a sensor fault into the ladder, and the corrected record
--    will move the very percentiles the new floors are anchored on."
--
-- Neither clause blocks this migration, for different reasons.
--
-- The second does not hold on the facts. USGS daily statistics are computed
-- from APPROVED daily means only -- the service says so in its own header, and
-- the rows prove it: every Eminence day-of-year record returned on 2026-09-01
-- reads begin_yr 1922, end_yr 2025, count 104. Water year 2026, the provisional
-- stretch USGS flagged, is not in those percentiles and cannot move them.
--
-- The first does not apply because no line below is anchored on a percentile at
-- all -- see the block above. The mass-balance failure is NOT fixed; it was
-- re-measured for this migration. Eminence (07066000) minus Alley Spring
-- (07065495), which is the implied Alley Spring contribution because the
-- upstream gauge sits above the spring inflow:
--
--   Jul 24-27    69.0  71.2  71.6  58.4
--   Jul 28-31    39.6  36.3  25.5  41.5     <- 20260803 saw this
--   Aug 1-3      66.8   9.9  16.7
--   Aug 20-31    42.6  40.7  37.7  40.1  46.3  45.6  46.0  41.8  44.6  43.7  47.6  43.2
--
-- The whipsaw has stopped, but it settled onto a plateau near 43 cfs rather
-- than returning to the ~70 it left, and both series are still provisional.
-- That is a live-reading problem, recorded here as one. No line below is placed
-- to make today's suspect 87 cfs grade differently than it does -- it reads
-- `too_low` before this migration and after it.
--
-- ── Sources ────────────────────────────────────────────────────────────────
--   1. Owner local knowledge, 2026-09-01, for the two floors named above.
--      Guardrail #2's trusted tier is observed ratings; the owner is the same
--      kind of source and is recorded here by date and by value.
--   2. missouriscenicrivers.com Jacks Fork levels page (already source #3 in
--      00177): for the Eminence gauge, "average ~2.0 ft", "below 2.0 ft you may
--      drag your canoe in spots, especially if fully loaded", closure 4.0 ft.
--      2.0 ft = 186 cfs through the USGS exsa rating curve.
--   3. MOHERP OBSERVED ratings as recorded in 00177's header (Eminence observed
--      Good 200). MOHERP is ESTIMATED end to end on 07013000, which is why no
--      MOHERP number is used there.
--   4. USGS day-of-year percentiles, approved record, 104 years each -- used
--      ONLY to demonstrate the defect, never to place a line.
--   5. USGS exsa rating curves for every cfs -> ft conversion, per 00177.
--
-- ft (alt) ladders are re-converted only on the rungs that move. Rungs left
-- alone have drifted ~0.05 ft from today's curve (Eminence optimal_max 3.43
-- stored vs 3.48 computed; Steelville 2.75 vs 2.83), and Steelville's stored
-- alt_too_low of 1.20 corresponds to ~105 cfs rather than to its 130 cfs
-- primary. Both are pre-existing and left alone: re-syncing them would be a
-- silent edit to lines this migration says it is not touching.
--
-- ── What is NOT changed, and why ────────────────────────────────────────────
--
-- level_optimal_max / level_high / level_dangerous stay exactly where 00177 and
-- the owner decision put them on both gauges. This migration moves floors.
--
-- The other two Jacks Fork ladders stay put. Alley Spring (07065495) is the
-- other half of the unresolved mass-balance pair and carries a 33-year record
-- where Eminence has 104; Mountain View (07065200) is the upper river, which
-- genuinely does go unfloatable, and carries the open threshold_order finding
-- named in 20260804214409 (level_low 100 >= level_optimal_min 100).
--
-- North Fork @ Tecumseh (07057500) shows the same shape -- too_low 285 against
-- a Jul-Oct p05 of 258 -- so roughly one late-summer day in six reads "wading
-- only" on a reach the owner describes as floatable year-round below Rainbow
-- Spring. Left alone: it was not part of the reported defect and has no
-- observed or owner anchor yet. Named so the next reviewer does not re-derive it.
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
--   Jacks Fork @ Eminence   too_low 176 -> 100   low 200 (held)
--   Meramec  @ Steelville   too_low 130 (held)   low 250 -> 145
--
-- level_optimal_min and its alt are NOT in the SET list at all, so the held
-- values cannot be disturbed by a typo in a VALUES row. The two rungs that are
-- held within the SET list are restated at their current values so both gauges
-- go through one statement; they are no-ops on those columns.
--
UPDATE river_gauges rg SET
  level_too_low     = v.tl,
  level_low         = v.lo,
  alt_level_too_low = v.atl,
  alt_level_low     = v.alo,
  threshold_source = 'editorial',
  last_condition_code = NULL,
  threshold_updated_at = now()
FROM (VALUES
  -- site      river          cfs: tl  lo | ft: atl  alo
  ('07066000', 'jacks-fork', 100, 200, 1.69, 1.98),
  ('07013000', 'meramec',    130, 145, 1.20, 1.32)
) AS v(site_id, river_slug, tl, lo, atl, alo)
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
    -- optimal_min is included at its HELD value: the row's whole lower ladder
    -- is pinned, so a future edit that moves the rung this migration argued
    -- itself out of moving has to come here and say so.
    JOIN (VALUES ('07066000', 'jacks-fork', 100, 200, 313),
                 ('07013000', 'meramec',    130, 145, 300)) AS e(site_id, river_slug, tl, lo, omin)
      ON e.site_id = gs.usgs_site_id AND e.river_slug = r.slug
    WHERE rg.threshold_unit = 'cfs'
      AND (rg.level_too_low, rg.level_low, rg.level_optimal_min) = (e.tl, e.lo, e.omin);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'floors: expected 2 recalibrated ladders, found %', v_count;
    END IF;

    -- 2. The reported defect, stated as the thing that must not be true again:
    --    neither gauge may call its own median low-season flow "too low". These
    --    are the Jul-Oct p50 values read from USGS statistics/v0 on 2026-09-01,
    --    asserted rather than recomputed so the check stays deterministic and
    --    offline. Note this tests level_too_low, not level_low -- Eminence
    --    deliberately still grades a median summer day `low`, because the only
    --    observed anchor on that gauge says it should.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07066000', 172), ('07013000', 178)) AS m(site_id, median)
      ON m.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs' AND rg.level_too_low >= m.median;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'floors: % gauge(s) still call their median Jul-Oct flow too low', v_count;
    END IF;

    -- 3. Steelville's good floor must sit at or below the flow the owner
    --    reported as routinely rafted (204 cfs, 2026-09-01). This is the
    --    observation the whole Meramec half of the migration rests on.
    PERFORM 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE gs.usgs_site_id = '07013000' AND rg.threshold_unit = 'cfs'
       AND rg.level_low <= 204;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'floors: Steelville still grades the owner-reported raftable flow below Good';
    END IF;

    -- 4. And no floor may sit at or below the 104-year record minimum, which is
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

    -- 5. Eminence keeps its OBSERVED anchor. level_low here is MOHERP's
    --    observed Good onset, and an earlier draft moved it off that with no
    --    source. If this fires, someone did it again.
    PERFORM 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE gs.usgs_site_id = '07066000' AND rg.threshold_unit = 'cfs'
       AND rg.level_low = 200;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'floors: Eminence level_low is off its MOHERP observed Good onset of 200';
    END IF;

    -- 6. The safety side is untouched. Asserted as equality on the stored
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

    -- 7. Both ladders, both units, complete and strictly increasing.
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
        -- Completeness BEFORE order, per 20260803. A NULL rung makes every
        -- comparison touching it NULL, and `IF NOT (NULL)` does not enter the
        -- branch -- so an ordering check on its own reports success on exactly
        -- the ladder that is missing a rung. Both units, all six rungs.
        IF lad.t IS NULL OR lad.l IS NULL OR lad.omin IS NULL
           OR lad.omax IS NULL OR lad.hi IS NULL OR lad.dng IS NULL THEN
            RAISE EXCEPTION 'floors: % has a NULL rung in its cfs ladder (% % % % % %)',
                lad.name, lad.t, lad.l, lad.omin, lad.omax, lad.hi, lad.dng;
        END IF;
        IF lad.at IS NULL OR lad.al IS NULL OR lad.aomin IS NULL
           OR lad.aomax IS NULL OR lad.ahi IS NULL OR lad.adng IS NULL THEN
            RAISE EXCEPTION 'floors: % has a NULL rung in its ft ladder (% % % % % %)',
                lad.name, lad.at, lad.al, lad.aomin, lad.aomax, lad.ahi, lad.adng;
        END IF;

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

    -- 8. The validator itself must be clean for these two gauges afterwards.
    SELECT count(*) INTO v_count
    FROM validate_river_data()
    WHERE check_name = 'threshold_order'
      AND (detail LIKE '%Jacks Fork at Eminence%' OR detail LIKE '%Meramec River near Steelville%');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'floors: threshold_order still fires on a recalibrated gauge';
    END IF;

    -- 9. The two Jacks Fork ladders this migration does NOT touch must still be
    --    sitting at 00177's values.
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
