-- 20260803170000_recalibrate_ozark_float_ladders.sql
--
-- APPLIED BY HAND 2026-08-03 and RECORDED 2026-08-04 by repair, not by replay.
--
-- The data changes below were run in the SQL editor and the recording step was
-- missed, so schema_migrations had no row for this version while every one of
-- its effects sat in production. That is invisible from the app and invisible
-- from the console; it surfaced only when the drift gate's assertion was run
-- (`npm run db:check-migrations`, which is still not wired into CI or `make
-- check` — see docs/TRUST_LEDGER_V1_PLAN.md).
--
-- The SQL was NOT re-run. Every value was verified present first, to the
-- decimal, including both alt (ft) ladders, the nulled section description, and
-- all four of this file's own DO-block assertions — among them the one that
-- requires the three Jacks Fork ladders to still be sitting at 00177's values.
-- Replaying would only have bumped threshold_updated_at off its real 2026-08-03
-- calibration date and re-nulled last_condition_code for no gain.
--
-- The row therefore carries no `statements`, matching what
-- `supabase migration repair --status applied` writes. Claiming it executed
-- here would be a false record.
--
-- Recalibrate the float ladders on the lower Current and the Black, and give
-- Clearwater's release a ladder of its own.
--
-- REPORTED: the Current at Doniphan read "Low" through a normal summer; the
-- three Jacks Fork gauges disagreed with each other; the Black at Poplar Bluff
-- read "High Water" for most of July.
--
-- ── The defect ──────────────────────────────────────────────────────────────
--
-- 00177 rebuilt these ladders from MOHERP and was right to. What it could not
-- see is that MOHERP publishes TWO ratings per gauge -- "Observed" (from real
-- trip reports) and "Estimated" (formula) -- and that on these gauges the
-- estimated numbers sit far above what the river actually floats at. 00177's
-- own policy says observed wins; the mapping it wrote reached for the estimated
-- "Poor" line for level_too_low on every gauge here, including the ones whose
-- observed "Good" onset contradicts it.
--
-- The symptom is only visible by comparing each ladder line to that site's OWN
-- day-of-year percentiles (api.waterdata.usgs.gov/statistics/v0, the same
-- source src/lib/flow-providers/usgs-statistics.ts already reads). Measured at
-- Aug 3, against each gauge's full period of record:
--
--   gauge                     Aug-3 median   old line that fired    percentile
--   Current @ Doniphan          1,660 cfs    optimal_min 2,350         ~p87
--   Black @ Poplar Bluff          562 cfs    level_low   650           ~p60
--
-- A median summer day landing in "Too Low" or "Low" is the bug. On the lower
-- Current the ladder could not reach "Flowing" at all below the 87th percentile
-- -- on the largest-volume spring river in the Ozarks, which Big Spring alone
-- feeds ~470 cfs. Doniphan was reading "Low" at the 76th percentile of flow.
--
-- ── The Jacks Fork is DELIBERATELY not in this migration ────────────────────
--
-- All three Jacks Fork gauges carry the same defect (Alley: too_low 76 against
-- an August median of 81, ~p40; Eminence: too_low 176 against a median of 185,
-- ~p47; both took optimal_min from MOHERP's ESTIMATED "Low" onset, which sits
-- ABOVE their OBSERVED "Good" onset of 100 and 200, so "Flowing" could not
-- begin until the river was already past good).
--
-- They are held back because USGS has confirmed a problem with the gauge
-- record itself, which showed up here as a mass-balance failure. Subtracting
-- the Alley Spring gauge (07065495, which sits ABOVE the spring inflow) from
-- Eminence (07066000) gives the implied Alley Spring contribution:
--
--   Jul 24-27    69.0  71.2  71.6  58.4
--   Jul 28-31    39.6  36.3  25.5  41.5     <- halves, then doubles back
--   Aug 1        66.8
--
-- while the upstream gauge fell smoothly (69.0 -> 58.0 -> 61.2) and no rain
-- fell. A karst spring of Alley's size cannot do that. Recalibrating against a
-- record the agency has flagged would bake compensation for a sensor fault into
-- the ladder, and the corrected record will move the very percentiles the new
-- floors are anchored on. Redo the percentile pull and re-derive the three
-- ladders once USGS publishes the revised record; the analysis above holds, the
-- numbers may not.
--
-- ── What is NOT changed, and why ────────────────────────────────────────────
--
-- level_optimal_max / level_high / level_dangerous stay exactly where 00177 put
-- them on every gauge. Those are the safety side of the ladder, MOHERP's High
-- and Flood lines are the only ground truth available for them, and nothing in
-- this investigation suggests they over- or under-warn. This migration moves
-- only the three lines below the optimal band.
--
-- ── Sources ────────────────────────────────────────────────────────────────
--   1. MOHERP per-gauge Observed ratings (rivers.moherp.org/gauge/?gauge=<id>),
--      re-read 2026-08-02. Neither gauge here has an observed onset -- both
--      ladders are MOHERP ESTIMATES end to end, which is the point.
--   2. USGS day-of-year percentiles, full period of record (105 yr Doniphan,
--      87 yr Poplar Bluff). Used ONLY to place the floor lines, never to define
--      the optimal band: level_too_low ~ p5 of summer flow, level_low ~ p25.
--   3. USGS exsa rating curves for every cfs -> ft conversion, so the primary
--      (cfs) and alt (ft) ladders keep describing the same water, per 00177.
--
-- last_condition_code re-baseline: mirrors 00171/00177. Reclassification would
-- otherwise make the gauge cron post spurious easing/rising alerts, so the
-- stamp is NULLed and the next pass re-baselines silently. Display is
-- unaffected -- pages compute condition live.

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1 -- the two USGS ladders
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Current @ Doniphan. MOHERP has ZERO observed trips here -- its whole ladder
  -- is estimated, and its estimated Good onset (2,354) is the ~87th percentile
  -- for early August. Floors moved to the percentile anchors: p5 ~ 1,036,
  -- p25 ~ 1,350, p50 ~ 1,660. Today's 1,940 cfs (p76) now reads Flowing rather
  -- than Low; late-July's 1,400 (p30) reads Good. High/Flood untouched.
  -- 00177 left this gauge alone as "MOHERP curated" -- it is MOHERP ESTIMATED.
  -- Doniphan also had no ft ladder at all; filled from the rating curve so the
  -- two units agree, as they do on every other cfs-primary gauge.
  ('07068000', 950, 1250, 1600, 3350, 3350, 7800, -0.99, -0.6, -0.19, 1.39, 1.4, 3.99),

  -- Black @ Poplar Bluff. Also MOHERP-estimated throughout. level_low 650 sat
  -- above the August median of 562, so ordinary conservation-release water read
  -- "Low". Floors to p5/p25 (309 / 410), optimal_min just under the median.
  -- The High line (2,060) is deliberately UNCHANGED: July's 3,100-3,600 cfs
  -- really was high water (see Part 2), and the badge was right about it.
  ('07063000', 280, 400, 550, 2060, 2060, 4100, -0.47, -0.09, 0.36, 4.79, 4.8, 10.37)
) AS v(site_id, tl, lo, omin, omax, hi, dng, atl, alo, aomin, aomax, ahi, adng)
JOIN gauge_stations gs ON gs.usgs_site_id = v.site_id
WHERE rg.gauge_station_id = gs.id AND rg.threshold_unit = 'cfs';

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2 -- Clearwater's release gets a ladder
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The "Black River below Clearwater Dam" station (provider usace, external id
-- swl-clearwater-dam) carries live readings -- it is the total release, and the
-- reach below the dam runs at whatever the Corps lets out -- but every
-- threshold column on it is NULL. hasLadder() therefore reports it unrated and
-- every display renders it "unknown": the one number that actually controls the
-- tailwater is the one number Eddy will not grade.
--
-- ANSWERING THE QUESTION THIS MIGRATION CAME FROM: no, 3,800 cfs is not normal
-- outflow. Sampled from CDA across 154 summer days in 2025-2026
-- (Clearwater_Dam.Flow-Res Out.Ave.1Hour.1Hour.Regi-Comp):
--
--     p5   p25   p50   p75   p90    p95    max
--    323   394   509   784  1,818  2,973  3,715
--
-- 77% of summer days fall between 200 and 800 cfs. The 3,700-3,800 cfs the dam
-- held from Jul 11-30 2026 was a flood-pool evacuation after the late-June
-- rain, in the top ~2% of summer releases and about 8x the median. The Poplar
-- Bluff badge reading "High Water" through that stretch was correct.
--
-- The band edges below are EDITORIAL and deliberately conservative. There is no
-- MOHERP rating for a release figure, so rather than guess at a float ladder
-- these are anchored on two things that are measurable: the release
-- distribution above, and the fact that release and the Poplar Bluff gauge
-- track within ~5% once the dam is running hard (3,561 released vs 3,380
-- gauged, 2026-07-27 -- see the tailwater comment in usace-registry.ts). So the
-- high and dangerous lines are held at Poplar Bluff's, and the floors come off
-- the release percentiles. Confirm against local knowledge before treating
-- these as settled.
UPDATE river_gauges rg SET
  threshold_unit = 'cfs',
  level_too_low = 150,      -- below the 1st percentile: the dam is shut
  level_low = 300,          -- ~p5 of summer release
  level_optimal_min = 400,  -- ~p25; the conservation-pool release regime
  level_optimal_max = 2000, -- held at Poplar Bluff's high line (2,060)
  level_high = 2000,
  level_dangerous = 4000,   -- held at Poplar Bluff's danger line (4,100)
  threshold_source = 'editorial',
  threshold_source_url = 'https://water.usace.army.mil/',
  last_condition_code = NULL,
  threshold_updated_at = now()
FROM gauge_stations gs
WHERE rg.gauge_station_id = gs.id
  AND gs.provider = 'usace'
  AND gs.site_id_external = 'swl-clearwater-dam';

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 3 -- drop the plumbing note from the Black's tailwater reach
-- ─────────────────────────────────────────────────────────────────────────────
--
-- river_sections.description renders verbatim to paddlers in the Reaches panel
-- on the river hub (RiverReaches.tsx). The lower Black's copy explained which
-- gauge Eddy substitutes and why -- discontinued site numbers, river miles,
-- relative drainage area. That is a true and useful note for whoever wires the
-- reach up, and it is the wrong thing to put in front of someone deciding
-- whether to float on Saturday. It is preserved here in the migration log and
-- in the section description on the gauge itself; the panel gets nothing.
--
-- Deliberately set to NULL rather than reworded: RiverReaches renders the
-- description only when present, so the reach keeps its name, its own condition
-- badge, its own Eddy report and its own gauge line. The reach's safety framing
-- already lives where it belongs -- low_water_meaning / rising_water_hazards
-- from 00205, which feed the Eddy report for this section.
UPDATE river_sections rs
SET description = NULL
WHERE rs.section_slug = 'lower-markham-hammer'
  AND rs.river_id = (SELECT id FROM rivers WHERE slug = 'black');

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants
-- ─────────────────────────────────────────────────────────────────────────────
-- Every check below asserts a POSITIVE row count before it asserts a property.
-- A guard written only as "no bad rows found" passes when it finds no rows at
-- all, which is precisely the case worth catching: rename a slug or mistype a
-- site id and the UPDATE silently matches nothing while the check that was
-- supposed to notice matches nothing either. Ask first "did I touch what I
-- meant to", then "is it right".
DO $$
DECLARE
    lad RECORD;
    v_count INT;
BEGIN
    -- Part 1 and Part 2 must have landed on exactly the rows they name.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07068000', 950, 1250, 1600), ('07063000', 280, 400, 550)) AS e(site_id, tl, lo, omin)
      ON e.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs'
      AND (rg.level_too_low, rg.level_low, rg.level_optimal_min) = (e.tl, e.lo, e.omin);
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'recalibrate: expected 2 recalibrated USGS ladders, found %', v_count;
    END IF;

    -- Every ladder touched here must stay monotonic. An out-of-order ladder
    -- does not error at read time -- classifyReading just silently skips a
    -- band -- so it has to be caught at write time.
    FOR lad IN
        SELECT gs.name, rg.level_too_low t, rg.level_low l, rg.level_optimal_min omin,
               rg.level_optimal_max omax, rg.level_dangerous dng
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE gs.usgs_site_id IN ('07068000','07063000')
           OR gs.site_id_external = 'swl-clearwater-dam'
    LOOP
        IF lad.t IS NULL OR lad.l IS NULL OR lad.omin IS NULL OR lad.omax IS NULL OR lad.dng IS NULL THEN
            RAISE EXCEPTION 'recalibrate: % has a NULL ladder line', lad.name;
        END IF;
        IF NOT (lad.t < lad.l AND lad.l < lad.omin AND lad.omin < lad.omax AND lad.omax < lad.dng) THEN
            RAISE EXCEPTION 'recalibrate: % ladder is not monotonic (% % % % %)',
                lad.name, lad.t, lad.l, lad.omin, lad.omax, lad.dng;
        END IF;
    END LOOP;

    -- The whole point of the change: a median early-August day must no longer
    -- grade below "good" on either year-round float. These are the p50 values
    -- read from USGS statistics/v0 on 2026-08-03, asserted against level_low
    -- (the floor of "good") rather than recomputed, so the check stays
    -- deterministic and offline.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07068000', 1660), ('07063000', 562)) AS m(site_id, median)
      ON m.site_id = gs.usgs_site_id
    WHERE rg.level_low > m.median;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'recalibrate: % gauge(s) still grade their median August flow below Good', v_count;
    END IF;

    -- The Jacks Fork must come out of this migration UNTOUCHED. USGS has an
    -- open issue with the record; these are 00177's values, and they stay until
    -- the agency publishes a revised one. If this fires, someone re-added the
    -- Jacks Fork to Part 1 without redoing the percentile work.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07065200', 30, 100, 100), ('07065495', 76, 100, 159),
                 ('07066000', 176, 200, 313)) AS j(site_id, tl, lo, omin)
      ON j.site_id = gs.usgs_site_id
    WHERE rg.threshold_unit = 'cfs'
      AND (rg.level_too_low, rg.level_low, rg.level_optimal_min) = (j.tl, j.lo, j.omin);
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'recalibrate: expected 3 untouched Jacks Fork ladders at 00177 values, found % -- they are deferred pending the USGS record fix', v_count;
    END IF;

    -- The dam release must be rated now, or the tailwater is still ungraded.
    PERFORM 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE gs.site_id_external = 'swl-clearwater-dam' AND rg.level_optimal_min IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'recalibrate: Clearwater release still has no ladder';
    END IF;

    -- And the plumbing note must be gone from the paddler-facing panel. Asserted
    -- as "exactly one such section exists AND its description is null", not as
    -- "no section with a description was found" -- the latter also passes when
    -- the river slug or the section slug has moved and Part 3 updated nothing.
    SELECT count(*) INTO v_count
    FROM river_sections rs
    JOIN rivers riv ON riv.id = rs.river_id
    WHERE riv.slug = 'black' AND rs.section_slug = 'lower-markham-hammer'
      AND rs.description IS NULL;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'recalibrate: expected 1 lower-Black section with no description, found %', v_count;
    END IF;
END $$;
