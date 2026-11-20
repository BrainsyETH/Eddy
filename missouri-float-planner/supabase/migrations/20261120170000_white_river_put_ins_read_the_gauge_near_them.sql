-- 20261120170000_white_river_put_ins_read_the_gauge_near_them.sql
--
-- Drafted 2026-11-20. Whether production holds it is recorded in
-- supabase/production-migrations.txt, not here.
--
-- On the White River below Bull Shoals Dam, a put-in reads the gauge on its
-- own stretch of river instead of the dam's release, in the planner and on
-- its access page.
--
-- ── What is wrong today ─────────────────────────────────────────────────────
-- get_river_condition_segment() chooses a put-in's gauge from a stretch that
-- names one, then the nearest gauge upstream by river_gauges.river_mile, then
-- the nearest downstream, then the river's main gauge. The White has no
-- stretches and none of its four gauge links carries a mile
-- (20260824232949 and 20260825011543 wired them without one), so every put-in
-- falls to the main gauge: the Corps' release at Bull Shoals Dam, mile 0.2.
--
-- Read from production on 2026-11-20, all 26 approved put-ins resolve to the
-- dam by stored mile, from Jim Griffin (0.54) to Guion (90.46). The reported
-- case was Red's Landing (50.84) to Calico Rock (60.73): the card showed the
-- release 50 miles upstream. Readings that morning, 12:00 to 12:30 UTC:
--
--   Bull Shoals Dam release        mile  0.2   4,117 cfs
--   White River near Norfork       mile 42.0   3,340 cfs
--   Norfork Dam release            joins at mile 43.1   3,175 cfs
--   White River at Calico Rock     mile 60.7   5,000 cfs, 4.02 ft
--
-- The same call given only a map point takes the nearest gauge by distance, so
-- the two paths already disagree for 15 put-ins: Ranchette through Red's
-- Landing get the gauge near Norfork, Sneed Creek through Guion get Calico
-- Rock.
--
-- The float plan's check of gauges inside the float reads only links that
-- carry a mile (estimateRoute, src/lib/calculations/route-estimate.ts), so it
-- skips both USGS gauges. Calico Rock has a 19 ft NWS flood stage, and a
-- reading at flood stage is Dangerous with or without a ladder. No White
-- River plan can see it today, and the dam reports no stage at all.
--
-- ── What the owner decided, 2026-11-20 ──────────────────────────────────────
-- Three stretches, each naming its gauge. Miles are the planner's
-- (snap_to_river); on the White the stored access miles are the same numbers,
-- so one range is right on both paths.
--
--   [ 0.00, 24.00)  Bull Shoals Dam release   Jim Griffin through Rim Shoals
--   [24.00, 43.00)  White near Norfork        Ranchette through Shipp's Ferry
--   [43.00, 95.00)  White at Calico Rock      Norfork Access through Guion
--
-- 24.00 is just above Crooked Creek, which joins at mile 24.01, between Rim
-- Shoals (21.85) and Ranchette (26.88). The two gauges either side are 42
-- miles apart with nothing between them, and this is the split the nearest
-- gauge by distance already makes.
--
-- 43.00 is just above the North Fork, which joins at mile 43.12 carrying
-- Norfork Dam's release. This is the boundary that matters. The gauge near
-- Norfork sits at mile 42.0, above the confluence (8,040 sq mi against Calico
-- Rock's 9,980), so filling in miles alone would send Norfork Access and Red's
-- Landing to a gauge that never sees the second dam's water. Calico Rock is
-- the only gauge that measures both.
--
-- 95.00 is past the last put-in (Guion, 90.46).
--
-- Known limit: Ranchette (26.88) is above the Buffalo River, which joins at
-- mile 31.28, and the gauge near Norfork is below it. When the Buffalo is up,
-- that gauge reads water Ranchette's first four miles do not carry.
--
-- ── What it changes ─────────────────────────────────────────────────────────
-- 1. Three river_sections rows, as above. river_type stays NULL: all three
--    are the river's own dam_tailwater.
-- 2. river_gauges.river_mile on the three links, to a tenth: 0.2, 42.0, 60.7
--    (snap_to_river gives 0.24, 41.95, 60.74). This is what lets the in-float
--    check see Calico Rock and the gauge near Norfork. 60.7 keeps the Calico
--    Rock gauge inside a float that ends at Calico Rock City Park (60.73).
--    The Norfork Dam link (role 'tributary') stays without a mile: it is not
--    on this river.
--
-- No float levels are set. All three gauges stay unrated
-- (river_gauges_tailwater_rating_provenance), so a put-in shows a reading and
-- no condition, as it does now, but from its own stretch. Stretch Reads are
-- paused, so these rows produce no text of their own.
--
-- By stored mile, 15 put-ins change gauge: 4 to the gauge near Norfork and 11
-- to Calico Rock. The other 11 stay on the dam. After applying, both paths
-- agree for all 26.
--
-- ── What it checks, in one statement ────────────────────────────────────────
-- Before: the three gauges are linked to the river and active, none of the
-- stretches exists, none overlaps a stretch that already names a gauge, the
-- three links carry no mile, and every put-in reads the dam. After: every
-- put-in reads the gauge of the stretch that holds its mile, and exactly 4
-- and 11 moved. A put-in approved since the review fails the count rather
-- than moving unseen. scripts/white-river-gauge-stretches-migration.test.ts
-- runs this file against production's put-ins as read on 2026-11-20.

do $$
declare
  found integer;
  bad text;
begin
  -- A database without the White (a preview, a fresh local) has nothing to do.
  if not exists (select 1 from public.rivers where slug = 'white') then
    return;
  end if;

  create temporary table white_plan (
    section_slug text not null, name text not null, description text not null,
    lo numeric not null, hi numeric not null,
    provider text not null, site text not null, gauge_mile numeric not null,
    ord integer not null, moves integer not null
  ) on commit drop;
  insert into white_plan values
    ('bull-shoals-dam-to-crooked-creek', 'Bull Shoals Dam to Crooked Creek',
     'The first 24 miles below the dam, through Cotter and Rim Shoals. There is no river gauge on this stretch, so put-ins here show the release from Bull Shoals Dam.',
     0.00, 24.00, 'usace', 'swl-bull-shoals-dam', 0.2, 1, 0),
    ('crooked-creek-to-the-north-fork', 'Crooked Creek to the North Fork',
     'From Crooked Creek past Buffalo City to the mouth of the North Fork. Put-ins here show the White River gauge near Norfork, which sits just above the North Fork.',
     24.00, 43.00, 'usgs', '07057370', 42.0, 2, 4),
    ('below-the-north-fork', 'Below the North Fork',
     'From the North Fork through Calico Rock to Guion. Put-ins here show the Calico Rock gauge, the only one that measures the water from both Bull Shoals and Norfork dams.',
     43.00, 95.00, 'usgs', '07060500', 60.7, 3, 11);

  -- ── Before ────────────────────────────────────────────────────────────────
  select string_agg(p.site, ', ') into bad
  from white_plan p
  join public.rivers r on r.slug = 'white'
  where not exists (
    select 1 from public.river_gauges rg
    join public.gauge_stations g on g.id = rg.gauge_station_id
    where rg.river_id = r.id and g.provider = p.provider and g.site_id_external = p.site and g.active);
  if bad is not null then
    raise exception 'white river stretches: a gauge is not linked to the river and active: %', bad;
  end if;

  select string_agg(p.section_slug, ', ') into bad
  from white_plan p
  join public.rivers r on r.slug = 'white'
  join public.river_sections s on s.river_id = r.id and s.section_slug = p.section_slug;
  if bad is not null then
    raise exception 'white river stretches: a stretch already exists: %', bad;
  end if;

  select string_agg(p.section_slug || ' with ' || s.section_slug, ', ') into bad
  from white_plan p
  join public.rivers r on r.slug = 'white'
  join public.river_sections s on s.river_id = r.id
  where s.primary_gauge_station_id is not null
    and coalesce(s.river_mile_start, '-infinity'::numeric) < p.hi
    and coalesce(s.river_mile_end, 'infinity'::numeric) > p.lo;
  if bad is not null then
    raise exception 'white river stretches: a new stretch overlaps one that already names a gauge: %', bad;
  end if;

  select string_agg(p.site || ' at mile ' || rg.river_mile, ', ') into bad
  from white_plan p
  join public.rivers r on r.slug = 'white'
  join public.gauge_stations g on g.provider = p.provider and g.site_id_external = p.site
  join public.river_gauges rg on rg.river_id = r.id and rg.gauge_station_id = g.id
  where rg.river_mile is not null;
  if bad is not null then
    raise exception 'white river stretches: a gauge link already carries a mile, which was not so on 2026-11-20; review it before setting one: %', bad;
  end if;

  -- The gauge each put-in reads by stored mile. The function names a USGS
  -- gauge by its site number; the dam has none, so it is matched by name.
  create temporary table put_ins_before on commit drop as
  select r.id as river_id, ap.name, ap.river_mile_downstream as mile,
         case when c.gauge_usgs_id is not null then c.gauge_usgs_id
              when c.gauge_name = dam.name then dam.site_id_external
              else coalesce(c.gauge_name, 'none') end as site
  from public.rivers r
  join public.access_points ap on ap.river_id = r.id and ap.approved and ap.river_mile_downstream is not null
  left join public.gauge_stations dam on dam.provider = 'usace' and dam.site_id_external = 'swl-bull-shoals-dam'
  left join lateral public.get_river_condition_segment(
    p_river_id => r.id, p_put_in_mile => ap.river_mile_downstream) c on true
  where r.slug = 'white';

  select string_agg(b.name || ' (' || b.site || ')', ', ') into bad
  from put_ins_before b
  where b.site <> 'swl-bull-shoals-dam';
  if bad is not null then
    raise exception 'white river stretches: a put-in no longer reads the dam, which every one did on 2026-11-20: %', bad;
  end if;

  -- ── The change ────────────────────────────────────────────────────────────
  insert into public.river_sections
    (river_id, section_slug, name, description, sort_order, river_mile_start, river_mile_end, primary_gauge_station_id)
  select r.id, p.section_slug, p.name, p.description,
         coalesce((select max(s.sort_order) from public.river_sections s where s.river_id = r.id), -1) + p.ord,
         p.lo, p.hi, g.id
  from white_plan p
  join public.rivers r on r.slug = 'white'
  join public.gauge_stations g on g.provider = p.provider and g.site_id_external = p.site;

  update public.river_gauges rg
  set river_mile = p.gauge_mile
  from white_plan p, public.rivers r, public.gauge_stations g
  where r.slug = 'white' and rg.river_id = r.id
    and g.id = rg.gauge_station_id and g.provider = p.provider and g.site_id_external = p.site
    and rg.river_mile is null;
  get diagnostics found = row_count;
  if found <> 3 then
    raise exception 'white river stretches: set a mile on % gauge links, expected 3', found;
  end if;

  -- ── After ─────────────────────────────────────────────────────────────────
  create temporary table put_ins_after on commit drop as
  select b.name, b.mile, b.site as was,
         case when c.gauge_usgs_id is not null then c.gauge_usgs_id
              when c.gauge_name = dam.name then dam.site_id_external
              else coalesce(c.gauge_name, 'none') end as now
  from put_ins_before b
  left join public.gauge_stations dam on dam.provider = 'usace' and dam.site_id_external = 'swl-bull-shoals-dam'
  left join lateral public.get_river_condition_segment(
    p_river_id => b.river_id, p_put_in_mile => b.mile) c on true;

  select string_agg(a.name || ' at mile ' || a.mile || ' (' || a.now || ', expected ' || coalesce(p.site, 'a stretch') || ')', ', ') into bad
  from put_ins_after a
  left join white_plan p on a.mile >= p.lo and a.mile < p.hi
  where p.site is null or a.now <> p.site;
  if bad is not null then
    raise exception 'white river stretches: a put-in does not read the gauge of its stretch: %', bad;
  end if;

  select string_agg(p.site || ' took ' || coalesce(k.n, 0) || ', expected ' || p.moves, ', ') into bad
  from white_plan p
  left join (select now, count(*) as n from put_ins_after where now is distinct from was group by now) k on k.now = p.site
  where coalesce(k.n, 0) <> p.moves;
  if bad is not null then
    raise exception 'white river stretches: the number of put-ins that moved is not what was reviewed: %', bad;
  end if;
end $$;
