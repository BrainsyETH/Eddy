-- 20261119170000_put_ins_read_the_gauge_that_speaks_for_them.sql
--
-- NOT YET APPLIED. Listed under [pending] in production-migrations.txt.
--
-- On seven rivers with two gauges, a put-in near the second gauge is graded by
-- that gauge, on both of the paths that choose one. The James gauge near Boaz
-- gets the top of its ladder.
--
-- ── What is wrong today ─────────────────────────────────────────────────────
-- get_river_condition_segment() chooses a put-in's gauge two ways when no
-- stretch names one. Given a stored mile it takes the nearest gauge upstream by
-- river_gauges.river_mile, which is NULL for these gauges, so it falls to the
-- river's main gauge. Given a map point it takes the nearest gauge by distance.
-- So the same put-in gets one gauge on its access page and another in the
-- planner. Read from production on 2026-11-19, 32 approved put-ins disagree:
--
--   river            by stored mile   by map point   put-ins
--   jacks-fork       Alley Spring     Mountain View  6  South Prong to Rymers
--   big-river        Richwoods        Byrnesville    3  Morse Mill to Rockford Beach
--   james            Galena           Boaz           4  Joe Crighton to Hootentown
--   bourbeuse        Union            High Gate      7  Mint Spring to Highway H
--   spring-river     Hardy            Imboden        2  Ravenden, Imboden
--   spring-river-mo  Carthage         Waco           6  Old Quaker Mill to Kafir Bridge
--   st-francis       Roselle          Patterson      4  Jewett to Greenville
--
-- Three of the second gauges have no float levels (Imboden, Waco, Patterson),
-- so the planner shows "Unknown" for twelve put-ins while their access pages
-- show the main gauge's condition.
--
-- ── What the owner decided, 2026-11-19 ──────────────────────────────────────
-- Where each creek joins was read from the national stream network (NHDPlus)
-- and placed on Eddy's river lines. Paired daily flows are from two years of
-- USGS record (scripts/research/rain-lag-2026-11/data).
--
--   Rated second gauge: put-ins near it use it.
--     Jacks Fork at Mountain View, Big River at Byrnesville, Bourbeuse at High
--     Gate (its ladder grades at every level: the empty `level_low` changes
--     nothing), and the James near Boaz once it has a top (below).
--   Borrowed: Spring River at Imboden has no levels and its put-ins use Hardy.
--     Imboden ran 15% above Hardy at low water and about a third above when
--     Hardy was high (719 paired days), so Hardy is a fair guide, not the same
--     water.
--   Unrated: Spring River near Waco and the St. Francis near Patterson have no
--     levels and get none here. Their put-ins use them and show a reading with
--     no condition, on both paths. The main gauges cannot stand in: the North
--     Fork joins above Waco and more than doubles the river (Waco ran 478 to
--     5,504 cfs on days Carthage sat near its 477 cfs line), and Roselle's
--     ladder is a whitewater stage ladder for the shut-ins 50 miles upstream.
--     The community trip log has no trips at Waco and two at Patterson, one of
--     them almost wholly on Big Creek, so there is nothing to rate either from.
--     Both have an NWS flood stage on file (19 ft and 16 ft), and a reading at
--     flood stage is Dangerous with or without a ladder.
--
-- ── The stretches ───────────────────────────────────────────────────────────
-- Miles are the planner's (snap_to_river). On five rivers the stored access
-- miles are the same numbers. A boundary sits at the creek that changes the
-- river, or between the two gauges where none does.
--
--   jacks-fork       [ 0.00,  20.00)  Mountain View   the Prongs through Rymers
--                    [20.00,  30.50)  Alley Spring    Bee Bluff, Bay Creek
--   big-river        [105.00, 145.00) Byrnesville     Morse Mill down
--   james            [ 0.00,  63.30)  Boaz            above Finley Creek (63.36)
--                    [63.30,  95.00)  Galena          Hootentown down
--   spring-river     [18.41,  60.00)  Hardy           Hardy down, borrowed
--   spring-river-mo  [ 0.00,  50.00)  Carthage        above the North Fork (50.11)
--                    [50.00, 105.00)  Waco            Highway 270 Bridge down
--   bourbeuse        [ 0.00,  33.00)  High Gate       see below
--   st-francis       [47.00, 125.00)  Patterson       see below
--
-- Two rivers keep chart miles on their access points that differ from the
-- planner's by 22 to 34 miles, so one range cannot be read on both scales
-- (docs/eddy-read-accuracy.md, "Connecting a stretch to a gauge").
--
--   Bourbeuse. Stored miles count from Mint Spring; the planner's count from
--   the head of the line, 26 miles higher. [0, 33) holds the stored miles of
--   Mint Spring through Highway H (0 to 31.1), which are the seven that move.
--   On the planner's scale it holds only Mint Spring and Glaser Ford; the
--   other five (34.6 to 60.1) fall through to the nearest gauge by distance,
--   which is already High Gate. Mill Rock and below are outside it on both
--   scales (stored 34.8 up, planner 63.9 up) and stay on Union.
--
--   St. Francis. [47, 125) starts between Silver Mines (planner 46.25) and the
--   Little St. Francis (47.57), so the whitewater run stays on Roselle. It
--   holds the planner miles of all four lower put-ins and the stored miles of
--   three. Jewett's stored mile is 43.40, and Millstream Gardens Fisherman's
--   Access sits at planner mile 43.35 inside the whitewater run, so no range
--   can take one without the other. Jewett's access page therefore stays on
--   Roselle by stored mile until the St. Francis access miles are reconciled
--   with the line. The planner already sends Jewett to Patterson.
--
-- Stretch Reads are paused, so these rows produce no text of their own. They
-- are rows in the same catalogue the earlier gauge stretches joined
-- (20261117221408, 20261118214137).
--
-- ── The James near Boaz ─────────────────────────────────────────────────────
-- Boaz had a floor and nothing above it: from 150 cfs it read Good at any
-- flow. Owner's lines, 2026-11-19, both provisional:
--   High above 650 cfs. The trip log has 32 trips at this gauge. Five rated
--     Good ran above 550 (589, 636, 735, 828 and 1,050 cfs) and none was rated
--     High, so a line carried over from Galena by ratio (about 460 to 550)
--     would call logged good trips High.
--   Dangerous at 1,500 cfs. Galena's is 3,000; on the 33 days Galena ran
--     within 15% of it, Boaz's median was 1,470.
-- level_optimal_max stays NULL, so 150 to 650 still reads Good as it does now.
--
-- ── What it checks, in one statement ────────────────────────────────────────
-- Before: every gauge it names is linked to its river and active, none of the
-- new stretches exists, none overlaps a stretch that already names a gauge,
-- and Boaz's top is still empty. After: by stored mile, exactly the put-ins
-- listed under `moves` changed gauge, each from and to the gauge named, and
-- no other put-in on these rivers moved. The map-point path cannot be checked
-- here without the river lines; it was simulated against production's
-- snap_to_river miles on 2026-11-19 and is read back after applying.

do $$
declare
  found integer;
  bad text;
begin
  create temporary table zone_plan (
    slug text not null, section_slug text not null, name text not null, description text not null,
    lo numeric not null, hi numeric not null, site text not null, ord integer not null
  ) on commit drop;
  insert into zone_plan values
    ('jacks-fork', 'prongs-to-rymers', 'The Prongs to Rymers',
     'The upper Jacks Fork from the Prongs down past Rymers. Graded by the Mountain View gauge at Buck Hollow.',
     0.00, 20.00, '07065200', 1),
    ('jacks-fork', 'bee-bluff-to-alley-spring', 'Bee Bluff to Alley Spring',
     'The last miles above Alley Spring. Graded by the Alley Spring gauge, which sits just above the spring.',
     20.00, 30.50, '07065495', 2),
    ('big-river', 'morse-mill-to-the-meramec', 'Morse Mill to the Meramec',
     'The lower Big River. Graded by the Byrnesville gauge.',
     105.00, 145.00, '07018500', 1),
    ('james', 'above-finley-creek', 'Above Finley Creek',
     'The James above Finley Creek, which nearly doubles the river. Graded by the gauge near Boaz.',
     0.00, 63.30, '07052250', 1),
    ('james', 'finley-creek-to-galena', 'Finley Creek to Galena',
     'From Finley Creek down, Hootentown to Galena. Graded by the Galena gauge.',
     63.30, 95.00, '07052500', 2),
    ('bourbeuse', 'mint-spring-to-highway-h', 'Mint Spring to Highway H',
     'The upper Bourbeuse. Graded by the High Gate gauge.',
     0.00, 33.00, '07015720', 1),
    ('spring-river', 'hardy-to-the-black-river', 'Hardy to the Black River',
     'The lower Spring River. The Imboden gauge has no float levels, so this stretch is graded by the Hardy gauge upstream. The lower river carries more water than Hardy shows.',
     18.41, 60.00, '07069305', 1),
    ('spring-river-mo', 'above-the-north-fork', 'Above the North Fork',
     'The Spring River above the North Fork. Graded by the Carthage gauge.',
     0.00, 50.00, '07185765', 1),
    ('spring-river-mo', 'below-the-north-fork', 'Below the North Fork',
     'From the North Fork down, where the river more than doubles. The Waco gauge has no float levels yet, so put-ins here show its reading and no condition.',
     50.00, 105.00, '07186000', 2),
    ('st-francis', 'below-the-little-st-francis', 'Below the Little St. Francis',
     'The lower St. Francis toward Sam A. Baker and Wappapello. The Patterson gauge has no float levels yet, so put-ins here show its reading and no condition.',
     47.00, 125.00, '07037500', 1);

  -- By stored mile: how many put-ins change gauge on each river, and between which two.
  create temporary table moves (slug text primary key, n integer not null, from_site text not null, to_site text not null) on commit drop;
  insert into moves values
    ('jacks-fork', 6, '07065495', '07065200'),
    ('big-river', 3, '07018100', '07018500'),
    ('james', 3, '07052500', '07052250'),
    ('bourbeuse', 7, '07016500', '07015720'),
    ('spring-river-mo', 3, '07185765', '07186000'),
    ('st-francis', 3, '07034000', '07037500');

  -- A database without a river (a preview, a fresh local) has nothing to do for it.
  delete from zone_plan p where not exists (select 1 from public.rivers r where r.slug = p.slug);
  delete from moves m where not exists (select 1 from public.rivers r where r.slug = m.slug);
  if not exists (select 1 from zone_plan) then
    return;
  end if;

  -- ── Before ────────────────────────────────────────────────────────────────
  select string_agg(p.slug || ' ' || p.site, ', ') into bad
  from zone_plan p
  join public.rivers r on r.slug = p.slug
  where not exists (
    select 1 from public.river_gauges rg
    join public.gauge_stations g on g.id = rg.gauge_station_id
    where rg.river_id = r.id and g.usgs_site_id = p.site and g.active);
  if bad is not null then
    raise exception 'gauge stretches: a gauge is not linked to its river and active: %', bad;
  end if;

  select string_agg(p.slug || '/' || p.section_slug, ', ') into bad
  from zone_plan p
  join public.rivers r on r.slug = p.slug
  join public.river_sections s on s.river_id = r.id and s.section_slug = p.section_slug;
  if bad is not null then
    raise exception 'gauge stretches: a stretch already exists: %', bad;
  end if;

  select string_agg(p.slug || '/' || p.section_slug || ' with ' || s.section_slug, ', ') into bad
  from zone_plan p
  join public.rivers r on r.slug = p.slug
  join public.river_sections s on s.river_id = r.id
  where s.primary_gauge_station_id is not null
    and coalesce(s.river_mile_start, '-infinity'::numeric) < p.hi
    and coalesce(s.river_mile_end, 'infinity'::numeric) > p.lo;
  if bad is not null then
    raise exception 'gauge stretches: a new stretch overlaps one that already names a gauge: %', bad;
  end if;

  create temporary table put_ins_before on commit drop as
  select r.slug, r.id as river_id, ap.name, ap.river_mile_downstream as mile, c.gauge_usgs_id as site
  from public.rivers r
  join public.access_points ap on ap.river_id = r.id and ap.approved and ap.river_mile_downstream is not null
  left join lateral public.get_river_condition_segment(
    p_river_id => r.id, p_put_in_mile => ap.river_mile_downstream) c on true
  where r.slug in (select slug from zone_plan);

  -- ── The change ────────────────────────────────────────────────────────────
  insert into public.river_sections
    (river_id, section_slug, name, description, sort_order, river_mile_start, river_mile_end, primary_gauge_station_id)
  select r.id, p.section_slug, p.name, p.description,
         coalesce((select max(s.sort_order) from public.river_sections s where s.river_id = r.id), -1) + p.ord,
         p.lo, p.hi, g.id
  from zone_plan p
  join public.rivers r on r.slug = p.slug
  join public.gauge_stations g on g.usgs_site_id = p.site;

  if exists (select 1 from public.rivers where slug = 'james') then
    update public.river_gauges rg
    set level_high = 650,
        level_dangerous = 1500,
        threshold_updated_at = now()
    from public.rivers r, public.gauge_stations g
    where r.slug = 'james' and rg.river_id = r.id
      and g.id = rg.gauge_station_id and g.usgs_site_id = '07052250'
      and rg.threshold_unit = 'cfs'
      and rg.level_optimal_min = 150
      and rg.level_optimal_max is null and rg.level_high is null and rg.level_dangerous is null;
    get diagnostics found = row_count;
    if found <> 1 then
      raise exception 'gauge stretches: the Boaz ladder is not as it was read on 2026-11-19 (good from 150 cfs, no top); review it before setting one';
    end if;
  end if;

  -- ── After ─────────────────────────────────────────────────────────────────
  create temporary table put_ins_after on commit drop as
  select b.slug, b.name, b.site as was, c.gauge_usgs_id as now
  from put_ins_before b
  left join lateral public.get_river_condition_segment(
    p_river_id => b.river_id, p_put_in_mile => b.mile) c on true;

  select string_agg(a.slug || ' ' || a.name || ' (' || coalesce(a.was, 'none') || ' to ' || coalesce(a.now, 'none') || ')', ', ') into bad
  from put_ins_after a
  left join moves m on m.slug = a.slug
  where a.now is distinct from a.was
    and (m.slug is null or a.was is distinct from m.from_site or a.now is distinct from m.to_site);
  if bad is not null then
    raise exception 'gauge stretches: a put-in moved that should not have: %', bad;
  end if;

  select string_agg(m.slug || ' moved ' || coalesce(k.n, 0) || ', expected ' || m.n, ', ') into bad
  from moves m
  left join (select slug, count(*) as n from put_ins_after where now is distinct from was group by slug) k on k.slug = m.slug
  where coalesce(k.n, 0) <> m.n;
  if bad is not null then
    raise exception 'gauge stretches: the number of put-ins that moved is not what was reviewed: %', bad;
  end if;
end $$;
