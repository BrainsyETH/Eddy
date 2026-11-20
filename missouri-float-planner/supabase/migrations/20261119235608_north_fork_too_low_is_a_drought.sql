-- 20261119235608_north_fork_too_low_is_a_drought.sql
--
-- Applied to production 2026-11-19 as 20261119235608, on the owner's word.
-- All five assertions below passed against the live rows; read back
-- afterwards, the ladder is 200 / 475 / 628-1000 / 1000 / 2200 with
-- threshold_updated_at 2026-11-19 23:56:08 UTC and a NULL last_condition_code,
-- and neither piece of stored prose quotes 285. Written as 20261119233500 and
-- renamed to the version production recorded. The statements production holds
-- are the ones below under a shorter comment.
--
-- Moves one floor line on one gauge: North Fork River near Tecumseh
-- (07057500), level_too_low 285 -> 200 cfs. The stored prose that quoted 285
-- moves with it. Nothing above the floor changes.
--
-- REPORTED. 20260901180642 named this and left it: "too_low 285 against a
-- Jul-Oct p05 of 258 ... on a reach the owner describes as floatable
-- year-round below Rainbow Spring. Left alone: it was not part of the reported
-- defect and has no observed or owner anchor yet." It came back on 2026-11-19
-- as a Read that contradicted itself: the gauge read 261 cfs, the badge said
-- Too Low, and the Read, following the river's own notes, told people to put
-- in below Rainbow Spring. The gauge sits below Rainbow Spring. It was already
-- reading that water.
--
-- ── The defect ──────────────────────────────────────────────────────────────
--
-- Three things Eddy held about the same water did not agree:
--
--   the ladder         below 285 cfs: Too Low ("not worth floating")
--   the river's note   "below ~285 cfs the riffles get scrapy"
--   EDDY_KNOWLEDGE.md  "Below the spring the river floats every month of the
--                      year ... When the gauge reads thin, that is a reason to
--                      put in below Rainbow Spring, not a reason to skip the
--                      river."
--
-- Scrapy riffles are what Low means everywhere else in Eddy: floatable, with
-- some dragging. 285 was MOHERP's observed onset of exactly that, mapped one
-- rung too far down in 00177.
--
-- ── The record, as evidence that the line contradicts the reach ─────────────
--
-- USGS daily mean discharge at 07057500, 1944-10-01 to 2026-11-18 (29,999
-- days), read from waterservices.usgs.gov on 2026-11-19:
--
--   below 285 cfs   2,133 days (7.1%), in 38 of 83 years; 14-15% of all
--                   September, October and November days
--   below 250 cfs     784 days (2.6%), in 16 years
--   below 200 cfs      62 days (0.2%), in 1954 and 1956 only
--   record low        187 cfs, 15-17 September 1954
--
-- So the old line called about one fall day in seven "not worth floating" on
-- the reach Rainbow Spring carries. scripts/ingestion/README.md guardrail #2
-- stands: percentiles are evidence that a line contradicts a reach, never the
-- derivation of its replacement. The count above is here in that one role.
--
-- ── Where the new line comes from ───────────────────────────────────────────
--
--   07057500 too_low = 200  OWNER-APPROVED (2026-11-19), asked and answered
--                           directly, with 230 and "keep 285 and fix the
--                           notes" offered beside it. It leaves Too Low for a
--                           drought like 1954 or 1956, and it sits above the
--                           record low of 187, so the ladder can still say it.
--   07057500 low     = 475  UNCHANGED. MOHERP observed.
--
-- No trip is logged at this gauge in community_reports or float_archive, so
-- there is no Eddy observation on either side of the line.
--
-- alt_level_too_low (the same line in feet, for the gauge page's second unit)
-- becomes 1.95. That is EXTRAPOLATED, and is the one number here that is: the
-- USGS rating table could not be fetched on 2026-11-19, and Eddy has no paired
-- reading below 260 cfs. It is carried down from Eddy's own pairs that week
-- (260 cfs at 2.11 ft, 300 cfs at 2.19 ft, 320 cfs at 2.26 ft). It grades
-- nothing: this gauge is rated in cfs. Replace it from the rating table when
-- one can be read.
--
-- ── The prose that quoted the old line ──────────────────────────────────────
--
--   rivers.float_summary                     "below ~285 cfs you'll drag"
--   river_characteristics.low_water_meaning  "below ~285 cfs the riffles get scrapy"
--
-- Each is rewritten only while it still holds the text recorded here.
-- scripts/ingestion/set-cold-start.ts carries the float summary too and is
-- changed in the same commit, or its next run would put the old sentence back.
--
-- last_condition_code is NULLed, as in 00177 and 20260901180642: the gauge
-- reclassifies too_low -> low at today's flow, which the gauge cron would
-- otherwise post as an easing alert. The next pass re-baselines silently.
-- Display is unaffected: pages compute the condition live.

update public.river_gauges rg set
  level_too_low = 200,
  alt_level_too_low = 1.95,
  threshold_source = 'editorial',
  last_condition_code = null,
  threshold_updated_at = now()
from public.gauge_stations gs, public.rivers r
where rg.gauge_station_id = gs.id
  and rg.river_id = r.id
  and gs.usgs_site_id = '07057500'
  and r.slug = 'north-fork-white'
  and rg.threshold_unit = 'cfs'
  and rg.level_too_low = 285;

update public.rivers set float_summary =
  'At the Tecumseh gauge (primary), 628–1,000 cfs is the ideal float range. Below 475 cfs it''s low and the riffles get scrapy, and below ~200 cfs it''s too low to float. Above 1,000 cfs the North Fork runs high and cold, and 2,200 cfs and up is dangerous. Spring-fed baseflow from Rainbow and Blue Springs keeps it floatable most of the year, but it can jump quickly after heavy rain.'
where slug = 'north-fork-white'
  and float_summary = 'At the Tecumseh gauge (primary), 628–1,000 cfs is the ideal float range. Around 475 cfs it''s low, and below ~285 cfs you''ll drag. Above 1,000 cfs the North Fork runs high and cold, and 2,200 cfs and up is dangerous. Spring-fed baseflow from Rainbow and Blue Springs keeps it floatable most of the year, but it can jump quickly after heavy rain.';

update public.river_characteristics rc set
  low_water_meaning = 'north-fork-main: Low water means scrapy riffles, but the river below Rainbow Spring stays floatable.'
from public.rivers r
where rc.river_id = r.id
  and r.slug = 'north-fork-white'
  and rc.low_water_meaning = 'north-fork-main: below ~285 cfs the riffles get scrapy';

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariants
-- ─────────────────────────────────────────────────────────────────────────────
-- Each asserts a positive row count, per 20260803: a guard written only as "no
-- bad rows found" also passes when a mistyped site id matched nothing. A
-- database that does not hold this river (a test fixture, a fresh project) has
-- nothing to assert and is left alone.
do $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.rivers where slug = 'north-fork-white') then
    raise notice 'north fork floor: no such river here, nothing to do';
    return;
  end if;

  -- 1. The whole ladder, with the rungs this migration did not move pinned at
  --    the values it found them at.
  select count(*) into v_count
  from public.river_gauges rg
  join public.gauge_stations gs on gs.id = rg.gauge_station_id
  join public.rivers r on r.id = rg.river_id
  where gs.usgs_site_id = '07057500' and r.slug = 'north-fork-white' and rg.threshold_unit = 'cfs'
    and (rg.level_too_low, rg.level_low, rg.level_optimal_min, rg.level_optimal_max, rg.level_high, rg.level_dangerous)
      = (200, 475, 628, 1000, 1000, 2200);
  if v_count <> 1 then
    raise exception 'north fork floor: expected 1 ladder at 200/475/628-1000/1000/2200, found %', v_count;
  end if;

  -- 2. The defect, stated as the thing that must not be true again: the flow
  --    that read Too Low on 2026-11-19 (261 cfs) grades as floatable.
  perform 1 from public.river_gauges rg
    join public.gauge_stations gs on gs.id = rg.gauge_station_id
   where gs.usgs_site_id = '07057500' and rg.threshold_unit = 'cfs'
     and rg.level_too_low <= 261 and rg.level_low > 261;
  if not found then
    raise exception 'north fork floor: 261 cfs does not grade Low';
  end if;

  -- 3. And the other way to get this wrong: a floor at or under the record
  --    low (187 cfs, September 1954) is a ladder that can never say too_low.
  perform 1 from public.river_gauges rg
    join public.gauge_stations gs on gs.id = rg.gauge_station_id
   where gs.usgs_site_id = '07057500' and rg.threshold_unit = 'cfs' and rg.level_too_low > 187;
  if not found then
    raise exception 'north fork floor: too_low sits at or under the record low';
  end if;

  -- 4. The second-unit ladder still ascends.
  perform 1 from public.river_gauges rg
    join public.gauge_stations gs on gs.id = rg.gauge_station_id
   where gs.usgs_site_id = '07057500' and rg.threshold_unit = 'cfs'
     and rg.alt_level_too_low < rg.alt_level_low;
  if not found then
    raise exception 'north fork floor: the alternate ladder is out of order';
  end if;

  -- 5. No stored prose still quotes the old line.
  select count(*) into v_count
  from public.rivers r
  left join public.river_characteristics rc on rc.river_id = r.id
  where r.slug = 'north-fork-white'
    and (r.float_summary like '%285%' or rc.low_water_meaning like '%285%');
  if v_count <> 0 then
    raise exception 'north fork floor: stored prose still quotes 285 cfs';
  end if;
end $$;
