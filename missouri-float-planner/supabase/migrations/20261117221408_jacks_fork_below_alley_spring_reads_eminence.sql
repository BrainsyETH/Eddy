-- 20261117221408_jacks_fork_below_alley_spring_reads_eminence.sql
--
-- Applied to production 2026-11-17 as 20261117221408, on the owner's
-- instruction. Read back afterwards: the stretch exists with these bounds and
-- no river_type. By stored mile, the eight approved put-ins from South Prong
-- to Bay Creek resolve to the Alley Spring gauge and the five from Alley
-- Spring to Two Rivers resolve to Eminence. By map point the same five resolve
-- to Eminence; the eight above resolve to Mountain View or the Alley Spring
-- gauge by distance, as they did before.
--
-- A float plan that starts at Alley Spring, Circle B or Eminence City Access
-- is graded by the Eminence gauge instead of the gauge above the spring.
--
-- ── What was wrong ──────────────────────────────────────────────────────────
-- "Jacks Fork at Alley Spring" (07065495) sits ABOVE the spring's inflow. The
-- owner confirmed it on 2026-11-17, and the readings agree: over 295 days of
-- 2026 the river gained a median 20 cfs from Mountain View to this gauge and a
-- median 109 cfs from this gauge to Eminence (07066000). Alley Spring puts out
-- about 81 million gallons a day, roughly 125 cfs. That water is not in this
-- gauge's reading.
--
-- The planner picks a put-in's gauge by position: the nearest gauge at or
-- above it. So every put-in from the spring down to the Eminence gauge was
-- graded by water that had not met the spring yet. On 2026-11-17 that was
-- "Too Low - Not Recommended" at 47 cfs for Alley Spring, Circle B and
-- Eminence City Access while Eminence read 153 cfs. The owner's rule is that
-- the river from Alley Spring down floats all year.
--
-- Position cannot express "a spring comes in between you and that gauge". A
-- stretch that names its own gauge can: get_river_condition_segment() lets it
-- override positional selection for every put-in inside its bounds.
--
-- ── The stretch ─────────────────────────────────────────────────────────────
--   alley-spring-to-two-rivers, graded by Eminence (07066000)
--   river_mile_start 30.50   river_mile_end 45.00
--
-- Two mile scales reach the planner: an access point's stored
-- river_mile_downstream, and the mile a map point snaps to on the river line.
-- On the Jacks Fork they agree to within half a mile. The start has to sit
-- above the Alley Spring access on both and below Bay Creek on both:
--
--                         stored   on the line
--   Bay Creek             25.20    25.25     stays on the Alley Spring gauge
--   Alley Spring access   31.00    30.76     moves to Eminence
--   Alley Spring gauge     8.00    30.88     (its stored mile is wrong; see below)
--
-- 30.50 clears both. The end is past the river's last mile (44.84), so Two
-- Rivers is inside the stretch.
--
-- ── What changes ────────────────────────────────────────────────────────────
-- By stored mile, three approved put-ins move from the Alley Spring gauge to
-- Eminence: Alley Spring, Circle B Campground & Resort, Eminence City Access.
-- Shawnee Creek and Two Rivers already resolved to Eminence. The eight
-- put-ins from South Prong to Bay Creek stay on the Alley Spring gauge.
--
-- By map point the nearest-gauge rule already sent Circle B and Eminence City
-- Access to Eminence, so the two kinds of caller disagreed about them. After
-- this they agree, and the Alley Spring access moves for map-point callers too.
--
-- ── What is left alone ──────────────────────────────────────────────────────
-- The river's main gauge. That is the next migration.
--
-- river_gauges.river_mile. The Alley Spring gauge is stored at mile 8.00 and
-- sits at 30.88 on the line. Correcting it would not change which gauge any
-- put-in resolves to once this stretch exists, and it is a separate fix.
--
-- river_type on the new row stays NULL, so the river page's reach panel, which
-- is gated on a stretch declaring its own type, does not appear. Stretch Reads
-- are paused (src/lib/eddy/stretch-reads.ts), so this row adds no Read.
--
-- ── What it checks, in one statement ────────────────────────────────────────
-- Before: the Jacks Fork has no stretches; Eminence is linked, active and
-- rated. After: every approved put-in at or below the start resolves to
-- Eminence, every one above it resolves to the gauge it had, and exactly three
-- changed. Any failure raises and the whole statement is rolled back.

do $$
declare
  stretch_slug constant text := 'alley-spring-to-two-rivers';
  eminence_site constant text := '07066000';
  start_mile constant numeric := 30.50;
  end_mile constant numeric := 45.00;
  expected_moves constant integer := 3;
  jacks_fork uuid;
  eminence uuid;
  found integer;
  bad text;
begin
  select id into jacks_fork from public.rivers where slug = 'jacks-fork';
  -- A database without the river (a preview, a fresh local) has nothing to do.
  if jacks_fork is null then
    return;
  end if;

  -- ── Before ────────────────────────────────────────────────────────────────
  if exists (select 1 from public.river_sections where river_id = jacks_fork) then
    raise exception 'jacks fork stretch: the river already has stretches; review them before adding this one';
  end if;

  select g.id into eminence
  from public.gauge_stations g
  join public.river_gauges rg on rg.gauge_station_id = g.id and rg.river_id = jacks_fork
  where g.usgs_site_id = eminence_site
    and g.active
    and rg.level_optimal_min is not null;
  if eminence is null then
    raise exception 'jacks fork stretch: gauge % is not linked, active and rated on this river', eminence_site;
  end if;

  create temporary table jacks_fork_put_ins_before on commit drop as
  select ap.id, ap.name, ap.river_mile_downstream as mile, c.gauge_usgs_id as site
  from public.access_points ap
  left join lateral public.get_river_condition_segment(
    p_river_id => jacks_fork, p_put_in_mile => ap.river_mile_downstream) c on true
  where ap.river_id = jacks_fork
    and ap.approved
    and ap.river_mile_downstream is not null;

  -- ── The change ────────────────────────────────────────────────────────────
  insert into public.river_sections
    (river_id, section_slug, name, description, sort_order,
     river_mile_start, river_mile_end, primary_gauge_station_id)
  values
    (jacks_fork, stretch_slug, 'Alley Spring to Two Rivers',
     'Below Alley Spring, where the spring carries the river. Graded by the Eminence gauge: the Alley Spring gauge sits above the spring''s inflow.',
     0, start_mile, end_mile, eminence);

  -- ── After ─────────────────────────────────────────────────────────────────
  select string_agg(b.name, ', ' order by b.mile) into bad
  from jacks_fork_put_ins_before b
  left join lateral public.get_river_condition_segment(
    p_river_id => jacks_fork, p_put_in_mile => b.mile) c on true
  where b.mile >= start_mile
    and c.gauge_usgs_id is distinct from eminence_site;
  if bad is not null then
    raise exception 'jacks fork stretch: a put-in at or below Alley Spring does not resolve to Eminence: %', bad;
  end if;

  select string_agg(b.name, ', ' order by b.mile) into bad
  from jacks_fork_put_ins_before b
  left join lateral public.get_river_condition_segment(
    p_river_id => jacks_fork, p_put_in_mile => b.mile) c on true
  where b.mile < start_mile
    and c.gauge_usgs_id is distinct from b.site;
  if bad is not null then
    raise exception 'jacks fork stretch: a put-in above Alley Spring changed gauge: %', bad;
  end if;

  select count(*) into found
  from jacks_fork_put_ins_before b
  where b.mile >= start_mile
    and b.site is distinct from eminence_site;
  if found <> expected_moves then
    raise exception 'jacks fork stretch: % put-ins moved to Eminence, expected %', found, expected_moves;
  end if;
end $$;
