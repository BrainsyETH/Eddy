-- 20261117230100_eminence_is_the_jacks_fork_main_gauge.sql
--
-- NOT YET APPLIED. Listed under [pending] in production-migrations.txt.
-- Apply after 20261117221408 (the Alley Spring to Two Rivers stretch).
--
-- The Jacks Fork's main gauge becomes Eminence (07066000). It was the Alley
-- Spring gauge (07065495), which sits above the spring's inflow and so speaks
-- for the rain-fed upper river.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The main gauge sets the river's headline: its card, favorites, widgets,
-- alerts, and the gauge the river's Read is written from. With the Alley
-- Spring gauge there, the headline said Too Low whenever the upper river was
-- dry, which is much of the year, while the stretch most people float, from
-- Alley Spring to Two Rivers, was carried by the spring.
--
-- Daily means, 2026-01-24 to 2026-11-17 (295 days), each gauge on its own
-- ladder as stored on 2026-11-17:
--
--                  Too Low   Low   Good   Flowing   High   Dangerous
--   Alley Spring       128    38     58        49     11          11
--   Eminence            24   122     65        61     18           5
--
-- On 104 of those days the Alley Spring gauge read Too Low while Eminence read
-- floatable. The owner chose Eminence as the main gauge on 2026-11-17.
--
-- ── What changes ────────────────────────────────────────────────────────────
-- 1. is_primary moves from 07065495 to 07066000. The Alley Spring gauge stays
--    linked as a secondary gauge and gets its own gauge Read, as Eminence did.
-- 2. The river is rated on Eminence's ladder, unchanged here: too low under
--    100 cfs (owner-approved 2026-09-01, 20260901180642), low under 200,
--    optimal 313 to 900, dangerous at 1,700.
-- 3. rivers.float_summary is rewritten for that ladder. It quoted the Alley
--    Spring ladder and named that gauge "(primary)", which the float_summary
--    trust check would report as summary_gauge_mismatch after the switch.
-- 4. last_condition_code and the pending-change columns are cleared on both
--    rows, as 00171, 00177 and 20260803 did after moving a ladder. The gauge
--    cron would otherwise compare Eminence's first reading as main gauge with
--    a stamp written for another gauge and post a condition-change alert that
--    no river did. Cleared, the next pass sets the baseline silently.
--
-- ── What does not change ────────────────────────────────────────────────────
-- No put-in's planner gauge. Positional selection and the stretch added in
-- 20261117221408 decide those; the main gauge is only their last fallback.
-- This file asserts it. No ladder line moves.
--
-- Known and left alone: 20260803170000 and 20260901180642 record a
-- USGS-confirmed problem in this gauge pair's provisional record in late July
-- and August 2026, when Eminence minus Alley Spring fell to about 43 cfs. On
-- 2026-11-17 the difference was 106 cfs against a 295-day median of 109.
--
-- ── What it checks, in one statement ────────────────────────────────────────
-- Before: the Alley Spring gauge is the main gauge, Eminence is linked,
-- active and rated in cfs, and the stretch from 20261117221408 exists.
-- After: exactly one main gauge, and it is Eminence; every approved put-in
-- resolves to the gauge it had. Any failure raises and nothing is changed.

do $$
declare
  old_site constant text := '07065495';
  new_site constant text := '07066000';
  jacks_fork uuid;
  old_link uuid;
  new_link uuid;
  found integer;
  bad text;
begin
  select id into jacks_fork from public.rivers where slug = 'jacks-fork';
  -- A database without the river (a preview, a fresh local) has nothing to do.
  if jacks_fork is null then
    return;
  end if;

  -- ── Before ────────────────────────────────────────────────────────────────
  select rg.id into old_link
  from public.river_gauges rg
  join public.gauge_stations g on g.id = rg.gauge_station_id
  where rg.river_id = jacks_fork and g.usgs_site_id = old_site and rg.is_primary;
  if old_link is null then
    raise exception 'jacks fork main gauge: % is not the main gauge, so there is nothing to switch from', old_site;
  end if;

  select rg.id into new_link
  from public.river_gauges rg
  join public.gauge_stations g on g.id = rg.gauge_station_id
  where rg.river_id = jacks_fork and g.usgs_site_id = new_site and g.active
    and rg.threshold_unit = 'cfs'
    and rg.level_too_low is not null and rg.level_low is not null
    and rg.level_optimal_min is not null and rg.level_optimal_max is not null
    and rg.level_dangerous is not null;
  if new_link is null then
    raise exception 'jacks fork main gauge: % is not linked, active and fully rated in cfs', new_site;
  end if;

  if not exists (
    select 1 from public.river_sections s
    join public.gauge_stations g on g.id = s.primary_gauge_station_id
    where s.river_id = jacks_fork and s.section_slug = 'alley-spring-to-two-rivers' and g.usgs_site_id = new_site
  ) then
    raise exception 'jacks fork main gauge: apply 20261117221408 first; the Alley Spring to Two Rivers stretch is missing';
  end if;

  create temporary table jacks_fork_put_ins_before_switch on commit drop as
  select ap.name, ap.river_mile_downstream as mile, c.gauge_usgs_id as site
  from public.access_points ap
  left join lateral public.get_river_condition_segment(
    p_river_id => jacks_fork, p_put_in_mile => ap.river_mile_downstream) c on true
  where ap.river_id = jacks_fork
    and ap.approved
    and ap.river_mile_downstream is not null;

  -- ── The change ────────────────────────────────────────────────────────────
  -- One main gauge per river is a unique index, so the old one is cleared first.
  update public.river_gauges
  set is_primary = false,
      last_condition_code = null,
      pending_condition_code = null,
      pending_count = default,
      pending_first_at = null,
      pending_reading_at = null
  where id = old_link;

  update public.river_gauges
  set is_primary = true,
      last_condition_code = null,
      pending_condition_code = null,
      pending_count = default,
      pending_first_at = null,
      pending_reading_at = null
  where id = new_link;

  update public.rivers
  set float_summary =
    'At the Eminence gauge (primary), 313–900 cfs is the ideal range on the Jacks Fork from Alley Spring down. Below about 200 cfs it''s low and you may drag in spots with a loaded boat, and below ~100 cfs it isn''t really floating. Above 900 cfs it runs high, and 1,700 cfs and up is dangerous—choose another day. These are cfs, not the gauge-height feet quoted on outfitter and Park Service boards, so don''t compare the two. The river above Alley Spring depends on rain and is often too low when this gauge reads fine; check the Alley Spring and Mountain View gauges for it.'
  where id = jacks_fork
    and (float_summary is null or float_summary like 'At the Alley Spring gauge (primary)%');
  get diagnostics found = row_count;
  if found <> 1 then
    raise exception 'jacks fork main gauge: float_summary no longer describes the Alley Spring gauge; rewrite it by hand';
  end if;

  -- ── After ─────────────────────────────────────────────────────────────────
  select count(*) into found from public.river_gauges where river_id = jacks_fork and is_primary;
  if found <> 1 or not exists (select 1 from public.river_gauges where id = new_link and is_primary) then
    raise exception 'jacks fork main gauge: expected exactly one main gauge, %', new_site;
  end if;

  select string_agg(b.name, ', ' order by b.mile) into bad
  from jacks_fork_put_ins_before_switch b
  left join lateral public.get_river_condition_segment(
    p_river_id => jacks_fork, p_put_in_mile => b.mile) c on true
  where c.gauge_usgs_id is distinct from b.site;
  if bad is not null then
    raise exception 'jacks fork main gauge: a put-in changed gauge: %', bad;
  end if;
end $$;
