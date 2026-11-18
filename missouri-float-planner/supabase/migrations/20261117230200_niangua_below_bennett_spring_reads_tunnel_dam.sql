-- 20261117230200_niangua_below_bennett_spring_reads_tunnel_dam.sql
--
-- NOT YET APPLIED. Listed under [pending] in production-migrations.txt. The
-- owner decided the top of Tunnel Dam's ladder on 2026-11-18; see "The top of
-- the ladder". Applying to production is a separate, authorized step.
--
-- The Niangua from Bennett Spring down is graded by the Tunnel Dam gauge
-- (06923950), and that gauge becomes the river's main gauge. Put-ins above the
-- spring stay on Windyville (06923250).
--
-- ── What is wrong today ─────────────────────────────────────────────────────
-- Windyville is the main gauge and sits above Bennett Spring. Every put-in on
-- the river is graded by it, and so is the river's headline. On 2026-11-17 it
-- read 26 cfs and "Low" while Tunnel Dam, below the spring, read 169. Over 293
-- days of 2026 Windyville's lowest daily mean was 17 cfs and the river gained
-- a median 214 cfs by Tunnel Dam. The floats people come for start at the
-- spring.
--
-- Tunnel Dam is the only gauge below the spring. It is about 37 river miles
-- below Bennett Spring Access, at a hydroelectric diversion. Its readings do
-- not look like dam operation: the largest reading in a day was a median 1.06
-- times the smallest (Windyville: 1.10).
--
-- ── The top of the ladder ───────────────────────────────────────────────────
-- Tunnel Dam's ladder came from flow percentiles (00167, threshold_source
-- 'usgs') and nobody had reviewed it: too low under 90 cfs, low under 142,
-- flowing 234 to 441, a High field of 754, dangerous at 1,508. That danger
-- line was double the 90th percentile of July flow, lower than Windyville's
-- (2,000 cfs on 377 square miles, against 598 here), and with it the headline
-- would have read High or Dangerous on 118 of 295 days.
--
-- Owner decision, 2026-11-18: Dangerous is the official flood action line, and
-- High is a cautious figure for now.
--
--   Dangerous  7,900 cfs. NWS action stage for TUDM7 (Niangua River at Tunnel
--     Dam near Macks Creek) is 10 ft, published with a flow of 7,900 cfs;
--     minor flood is 11 ft and 9,700 cfs, and there is no moderate or major
--     category. Read from api.water.noaa.gov/nwps/v1/gauges/TUDM7 on
--     2026-11-18. The two agencies disagree about the flow at 10 ft: the USGS
--     rating in use (9.2, shift dated 2026-09-11) gives 9,575 cfs there, and
--     the gauge reported 9,580 cfs at 10.00 ft on 2026-06-14; that rating
--     puts 7,900 cfs at 9.12 ft. The gauge is graded in cfs, so the line is
--     NWS's 7,900 cfs, the lower of the two readings of "action stage". Flood
--     stage (11 ft, already on the pairing) still reads Dangerous by stage
--     whatever the flow says.
--   High       above 750 cfs. PROVISIONAL, not a measured line. High begins
--     just above Optimal Max (shared/condition-ladder.ts), so until now it
--     began at 441 cfs and the High field's 754 was never read; both fields
--     become 750. The figure follows Windyville, whose High line (400 cfs) is
--     from trip reports: on the 12 days of 2026 Windyville averaged 300 to
--     400 cfs, Tunnel Dam averaged 498 to 1,055, median 784. 750 is under
--     that median, so it warns a little before the upstream gauge would.
--
-- The stage ladder (alt_level_*) was left over from before the gauge was
-- graded in cfs and described different water (its Flowing band began at
-- 2.5 ft, which is about 800 cfs). Every rung is now the cfs rung read off
-- USGS rating 9.2, so the two views of "What the levels mean" agree:
--
--                   too low   low   flowing from   high above   dangerous
--   cfs                  90   142            234          750       7,900
--   ft                 0.86  1.13           1.45         2.43        9.12
--
-- Daily means for 2026 (UTC days through 2026-11-17), each gauge on its own
-- ladder, Tunnel Dam on the old one and on this one:
--
--                     Too Low   Low   Good   Flowing   High   Dangerous
--   Windyville             50    89      2        89     47          16
--   Tunnel Dam, old         0    18     91        68     88          30
--   Tunnel Dam, new         0    18     91       115     69           2
--
-- What that costs, and why High is the rung to revisit: 28 days that read
-- Dangerous on the old ladder read High on this one, and on 18 of them Tunnel
-- Dam averaged 2,000 cfs or more, the flow at which Windyville reads
-- Dangerous on a smaller river. High now spans 750 to 7,900 cfs, 2.4 ft to
-- 9.1 ft of stage. Action stage is where the NWS starts preparing for a
-- flood, which is well past the level at which a paddler should stay off.
--
-- threshold_source becomes 'editorial' (an owner decision; the three low rungs
-- are still the 00167 percentiles) and threshold_source_url points at the NWS
-- gauge page. The migration refuses to run unless the ladder it replaces is
-- exactly the one described above.
--
-- ── Why two stretches, and why they are bounded as they are ─────────────────
-- Two mile scales reach the planner: an access point's stored
-- river_mile_downstream, and the mile a map point snaps to on the river line.
-- On the Niangua they differ by about 25 miles (Bennett Spring Access is
-- stored at 30.2 and sits at 55.0 on the line). docs/eddy-read-accuracy.md
-- says bounds on such a river cannot be right for both. Here they can,
-- because of where the put-ins fall:
--
--                              stored    on the line
--   Riverfront Campground       28.8      53.6    last put-in above the spring
--   Bennett Spring Access       30.2      55.0    first put-in below it
--
--   above-bennett-spring        miles  0.00 to 30.00   Windyville
--     Stored miles under 30 are the put-ins above the spring (five approved). Line miles
--     under 30 are far above Windyville itself (40.97 on the line).
--   bennett-spring-to-lake      miles 54.50 to 122.00  Tunnel Dam
--     Line miles from 54.5 are everything from the spring down. Stored miles
--     from 54.5 are Berry Bluff and below, also below the spring.
--
-- Between them: a stored mile from 30 to 54.5 is below the spring and falls
-- through to the main gauge, which this migration makes Tunnel Dam. A line
-- mile from 30 to 54.5 is above the spring and falls through to the nearest
-- gauge by distance, which is Windyville for all four put-ins there.
--
-- That is why the stretches and the main-gauge switch are one statement: the
-- stretches are only right once Tunnel Dam is the fallback. When the stored
-- access miles are reconciled with the line, the two stretches collapse to a
-- single boundary at the spring, near 54.7 on the line.
--
-- ── What changes ────────────────────────────────────────────────────────────
-- By stored mile, fifteen approved put-ins from Bennett Spring Access to Ha Ha
-- Tonka move from Windyville to Tunnel Dam; five above the spring stay. By map
-- point, the eight from Bennett Spring Access to Mountain Creek move; the
-- seven from Lead Mine down already resolved to Tunnel Dam by distance.
-- Tunnel Dam's ladder changes as described under "The top of the ladder".
-- last_condition_code and the pending-change columns are cleared on both rows
-- so neither the switch nor the new ladder posts a condition-change alert (see
-- 20261117225734).
-- rivers.float_summary is NULL for the Niangua and stays NULL.
--
-- ── What it checks, in one statement ────────────────────────────────────────
-- Before: Windyville is the main gauge, Tunnel Dam is linked, active and
-- rated in cfs on the ladder this was written against, and the river has no
-- stretches. After: exactly one main gauge, Tunnel Dam, on the new ladder;
-- every approved put-in stored below mile 30 resolves to Windyville and every
-- other one to Tunnel Dam; exactly fifteen moved.

do $$
declare
  upper_site constant text := '06923250';
  lower_site constant text := '06923950';
  spring_stored_mile constant numeric := 30.00;
  spring_line_mile constant numeric := 54.50;
  line_end_mile constant numeric := 122.00;
  expected_moves constant integer := 15;
  niangua uuid;
  upper_link uuid;
  lower_link uuid;
  upper_station uuid;
  lower_station uuid;
  found integer;
  bad text;
begin
  select id into niangua from public.rivers where slug = 'niangua';
  -- A database without the river (a preview, a fresh local) has nothing to do.
  if niangua is null then
    return;
  end if;

  -- ── Before ────────────────────────────────────────────────────────────────
  if exists (select 1 from public.river_sections where river_id = niangua) then
    raise exception 'niangua gauges: the river already has stretches; review them before adding these';
  end if;

  select rg.id, rg.gauge_station_id into upper_link, upper_station
  from public.river_gauges rg
  join public.gauge_stations g on g.id = rg.gauge_station_id
  where rg.river_id = niangua and g.usgs_site_id = upper_site and g.active and rg.is_primary;
  if upper_link is null then
    raise exception 'niangua gauges: % is not the main gauge, so there is nothing to switch from', upper_site;
  end if;

  select rg.id, rg.gauge_station_id into lower_link, lower_station
  from public.river_gauges rg
  join public.gauge_stations g on g.id = rg.gauge_station_id
  where rg.river_id = niangua and g.usgs_site_id = lower_site and g.active
    and rg.threshold_unit = 'cfs'
    and rg.level_too_low is not null and rg.level_low is not null
    and rg.level_optimal_min is not null and rg.level_optimal_max is not null
    and rg.level_dangerous is not null;
  if lower_link is null then
    raise exception 'niangua gauges: % is not linked, active and fully rated in cfs', lower_site;
  end if;

  -- The ladder being replaced. Anything else means somebody has edited it
  -- since 2026-11-18, and their edit is not this migration's to overwrite.
  if not exists (
    select 1 from public.river_gauges
    where id = lower_link
      and level_too_low = 90 and level_low = 142 and level_optimal_min = 234
      and level_optimal_max = 441 and level_high = 754 and level_dangerous = 1508
  ) then
    raise exception 'niangua gauges: the % ladder is not the one this was written against; set it by hand', lower_site;
  end if;

  create temporary table niangua_put_ins_before on commit drop as
  select ap.name, ap.river_mile_downstream as mile, c.gauge_usgs_id as site
  from public.access_points ap
  left join lateral public.get_river_condition_segment(
    p_river_id => niangua, p_put_in_mile => ap.river_mile_downstream) c on true
  where ap.river_id = niangua
    and ap.approved
    and ap.river_mile_downstream is not null;

  -- ── The change ────────────────────────────────────────────────────────────
  insert into public.river_sections
    (river_id, section_slug, name, description, sort_order,
     river_mile_start, river_mile_end, primary_gauge_station_id)
  values
    (niangua, 'above-bennett-spring', 'Above Bennett Spring',
     'The river above Bennett Spring, which depends on rain. Graded by the Windyville gauge.',
     0, 0.00, spring_stored_mile, upper_station),
    (niangua, 'bennett-spring-to-lake', 'Bennett Spring to Lake of the Ozarks',
     'From Bennett Spring down, where the spring carries the river. Graded by the Tunnel Dam gauge: Windyville sits above the spring.',
     1, spring_line_mile, line_end_mile, lower_station);

  -- One main gauge per river is a unique index, so the old one is cleared first.
  update public.river_gauges
  set is_primary = false,
      last_condition_code = null,
      pending_condition_code = null,
      pending_count = default,
      pending_first_at = null,
      pending_reading_at = null
  where id = upper_link;

  -- High begins just above level_optimal_max; level_high is kept equal to it
  -- so the chart's High line and the grade agree. alt_level_* is the same
  -- ladder in feet, off USGS rating 9.2.
  update public.river_gauges
  set is_primary = true,
      level_optimal_max = 750,
      level_high = 750,
      level_dangerous = 7900,
      alt_level_too_low = 0.86,
      alt_level_low = 1.13,
      alt_level_optimal_min = 1.45,
      alt_level_optimal_max = 2.43,
      alt_level_high = 2.43,
      alt_level_dangerous = 9.12,
      threshold_source = 'editorial',
      threshold_source_url = 'https://water.noaa.gov/gauges/tudm7',
      threshold_updated_at = now(),
      last_condition_code = null,
      pending_condition_code = null,
      pending_count = default,
      pending_first_at = null,
      pending_reading_at = null
  where id = lower_link;

  -- ── After ─────────────────────────────────────────────────────────────────
  select count(*) into found from public.river_gauges where river_id = niangua and is_primary;
  if found <> 1 or not exists (select 1 from public.river_gauges where id = lower_link and is_primary) then
    raise exception 'niangua gauges: expected exactly one main gauge, %', lower_site;
  end if;

  if not exists (
    select 1 from public.river_gauges
    where id = lower_link
      and level_too_low < level_low and level_low < level_optimal_min
      and level_optimal_min < level_optimal_max and level_optimal_max = level_high
      and level_high < level_dangerous
      and alt_level_too_low < alt_level_low and alt_level_low < alt_level_optimal_min
      and alt_level_optimal_min < alt_level_optimal_max and alt_level_optimal_max = alt_level_high
      and alt_level_high < alt_level_dangerous
      -- The flow line must trip before the stage one, not after it.
      and alt_level_dangerous < flood_stage_ft
  ) then
    raise exception 'niangua gauges: the % ladder is out of order after the change', lower_site;
  end if;

  select string_agg(b.name, ', ' order by b.mile) into bad
  from niangua_put_ins_before b
  left join lateral public.get_river_condition_segment(
    p_river_id => niangua, p_put_in_mile => b.mile) c on true
  where c.gauge_usgs_id is distinct from
        case when b.mile < spring_stored_mile then upper_site else lower_site end;
  if bad is not null then
    raise exception 'niangua gauges: a put-in resolves to the wrong side of Bennett Spring: %', bad;
  end if;

  select count(*) into found
  from niangua_put_ins_before b
  where b.mile >= spring_stored_mile
    and b.site is distinct from lower_site;
  if found <> expected_moves then
    raise exception 'niangua gauges: % put-ins moved to Tunnel Dam, expected %', found, expected_moves;
  end if;
end $$;
