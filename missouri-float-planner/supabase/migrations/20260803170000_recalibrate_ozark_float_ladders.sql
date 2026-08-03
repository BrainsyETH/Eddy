-- 20260803170000_recalibrate_ozark_float_ladders.sql
--
-- Recalibrate the float ladders on the lower Current, the Jacks Fork and the
-- Black, and give Clearwater's release a ladder of its own.
--
-- REPORTED: the Current at Doniphan read "Low" through a normal summer; the
-- three Jacks Fork gauges disagreed with each other; the Black at Poplar Bluff
-- read "High Water" for most of July.
--
-- ── The defect ──────────────────────────────────────────────────────────────
--
-- 00177 rebuilt these ladders from MOHERP and was right to. What it could not
-- see is that MOHERP publishes TWO ratings per gauge -- "Observed" (from real
-- trip reports) and "Estimated" (formula) -- and that on these five gauges the
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
--   Jacks Fork @ Eminence         185 cfs    too_low     176           ~p47
--   Jacks Fork @ Alley            81 cfs     too_low      76           ~p40
--   Black @ Poplar Bluff          562 cfs    level_low   650           ~p60
--
-- A median summer day landing in "Too Low" or "Low" is the bug. On the lower
-- Current the ladder could not reach "Flowing" at all below the 87th percentile
-- -- on the largest-volume spring river in the Ozarks, which Big Spring alone
-- feeds ~470 cfs. Doniphan was reading "Low" at the 76th percentile of flow.
--
-- ── What is NOT changed, and why ────────────────────────────────────────────
--
-- level_optimal_max / level_high / level_dangerous stay exactly where 00177 put
-- them on every gauge. Those are the safety side of the ladder, MOHERP's High
-- and Flood lines are the only ground truth available for them, and nothing in
-- this investigation suggests they over- or under-warn. This migration moves
-- only the three lines below the optimal band.
--
-- Jacks Fork near Mountain View keeps its floor at 30 cfs (MOHERP OBSERVED Low)
-- and its optimal_min at 100 (MOHERP OBSERVED Good). Its median August flow of
-- 40 cfs reading "Low" is CORRECT and must not be "fixed": the upper Jacks Fork
-- above Alley is a genuinely seasonal float that is bony all summer. The only
-- change is level_low 100 -> 85, because 00177 set level_low and optimal_min to
-- the same number, leaving the "Good" band empty so the gauge jumped from Low
-- straight to Flowing.
--
-- ── Sources ────────────────────────────────────────────────────────────────
--   1. MOHERP per-gauge Observed ratings (rivers.moherp.org/gauge/?gauge=<id>),
--      re-read 2026-08-02. Observed onsets used verbatim where they exist:
--      Alley Good 100, Eminence Good 200, Mountain View Low 30 / Good 100.
--   2. USGS day-of-year percentiles, full period of record (105 yr Doniphan,
--      104 yr Eminence, 87 yr Poplar Bluff, 33 yr Alley, 24 yr Mountain View).
--      Used ONLY to place the floor lines, never to define the optimal band:
--      level_too_low ~ p5 of summer flow, level_low ~ p25.
--   3. USGS exsa rating curves for every cfs -> ft conversion, so the primary
--      (cfs) and alt (ft) ladders keep describing the same water, per 00177.
--
-- last_condition_code re-baseline: mirrors 00171/00177. Reclassification would
-- otherwise make the gauge cron post spurious easing/rising alerts, so the
-- stamp is NULLed and the next pass re-baselines silently. Display is
-- unaffected -- pages compute condition live.

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1 -- the four USGS ladders
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

  -- Jacks Fork near Mountain View (upper river, DA 185). Observed anchors kept;
  -- only the empty Good band is fixed (level_low 100 -> 85, MOHERP est Low).
  ('07065200', 30, 85, 100, 490, 490, 1200, 0.28, 0.82, 0.93, 2.49, 2.5, 4.06),

  -- Jacks Fork at Alley Spring (DA 298). optimal_min was 159 -- MOHERP's
  -- ESTIMATED Low onset -- which sits ABOVE its OBSERVED Good onset of 100, so
  -- "Flowing" could not start until the river was already past good. Floors to
  -- p5/p25 (39 / 62); optimal_min to the observed 100.
  --
  -- NOTE for whoever tunes this next: this gauge sits ABOVE the Alley Spring
  -- inflow. The spring adds roughly 60-125 cfs to the reach immediately below
  -- it, so this gauge systematically UNDER-reads the Alley-to-Two-Rivers float
  -- that most people actually run. Erring low here is the wrong direction.
  ('07065495', 40, 62, 100, 637, 637, 1000, 0.98, 1.21, 1.49, 3.32, 3.33, 3.96),

  -- Jacks Fork at Eminence (DA 398). Worst of the three: too_low sat at 176
  -- against an August median of 185, so roughly half of all normal early-August
  -- days on the most-floated reach of the Jacks Fork reported "Too Low".
  -- optimal_min was again the estimated Low onset (313) rather than the
  -- OBSERVED Good onset (200). Floors to p5/p25 (96 / 143).
  ('07066000', 95, 145, 200, 900, 900, 1700, 1.6, 1.8, 1.98, 3.43, 3.44, 4.51),

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
DO $$
DECLARE
    r RECORD;
    v_count INT;
BEGIN
    -- Every ladder touched here must stay monotonic. An out-of-order ladder
    -- does not error at read time -- classifyReading just silently skips a
    -- band -- so it has to be caught at write time.
    FOR r IN
        SELECT gs.name, rg.level_too_low t, rg.level_low l, rg.level_optimal_min omin,
               rg.level_optimal_max omax, rg.level_dangerous dng
        FROM river_gauges rg
        JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
        WHERE gs.usgs_site_id IN ('07068000','07065200','07065495','07066000','07063000')
           OR gs.site_id_external = 'swl-clearwater-dam'
    LOOP
        IF r.t IS NULL OR r.l IS NULL OR r.omin IS NULL OR r.omax IS NULL OR r.dng IS NULL THEN
            RAISE EXCEPTION 'recalibrate: % has a NULL ladder line', r.name;
        END IF;
        IF NOT (r.t < r.l AND r.l < r.omin AND r.omin < r.omax AND r.omax < r.dng) THEN
            RAISE EXCEPTION 'recalibrate: % ladder is not monotonic (% % % % %)',
                r.name, r.t, r.l, r.omin, r.omax, r.dng;
        END IF;
    END LOOP;

    -- The whole point of the change: a median early-August day must no longer
    -- grade below "good" on the three year-round floats. These are the p50
    -- values read from USGS statistics/v0 on 2026-08-03, asserted against
    -- level_low (the floor of "good") rather than recomputed, so the check
    -- stays deterministic and offline.
    SELECT count(*) INTO v_count
    FROM river_gauges rg
    JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
    JOIN (VALUES ('07068000', 1660), ('07066000', 185), ('07063000', 562)) AS m(site_id, median)
      ON m.site_id = gs.usgs_site_id
    WHERE rg.level_low > m.median;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'recalibrate: % gauge(s) still grade their median August flow below Good', v_count;
    END IF;

    -- Mountain View is the deliberate exception -- the upper Jacks Fork really
    -- is a seasonal float, and its observed anchors must survive intact.
    PERFORM 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE gs.usgs_site_id = '07065200'
       AND rg.level_too_low = 30 AND rg.level_optimal_min = 100;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'recalibrate: Mountain View lost its MOHERP observed anchors';
    END IF;

    -- The dam release must be rated now, or the tailwater is still ungraded.
    PERFORM 1 FROM river_gauges rg
      JOIN gauge_stations gs ON gs.id = rg.gauge_station_id
     WHERE gs.site_id_external = 'swl-clearwater-dam' AND rg.level_optimal_min IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'recalibrate: Clearwater release still has no ladder';
    END IF;

    -- And the plumbing note must be gone from the paddler-facing panel.
    PERFORM 1 FROM river_sections rs
      JOIN rivers r ON r.id = rs.river_id
     WHERE r.slug = 'black' AND rs.section_slug = 'lower-markham-hammer'
       AND rs.description IS NOT NULL;
    IF FOUND THEN
        RAISE EXCEPTION 'recalibrate: the lower Black still carries a reach description';
    END IF;
END $$;
