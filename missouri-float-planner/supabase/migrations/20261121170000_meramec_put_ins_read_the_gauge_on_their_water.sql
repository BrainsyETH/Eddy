-- 20261121170000_meramec_put_ins_read_the_gauge_on_their_water.sql
--
-- NOT YET APPLIED. Drafted 2026-11-21 for the owner's review; listed under
-- [pending] in supabase/production-migrations.txt. Apply only on the owner's
-- go-ahead, then rename to the version production records.
--
-- On the Meramec, a put-in reads the gauge on its own water instead of the
-- Steelville gauge, in the planner and on its access page.
--
-- ── What is wrong today ─────────────────────────────────────────────────────
-- get_river_condition_segment() chooses a put-in's gauge from a stretch that
-- names one, then the nearest gauge upstream by river_gauges.river_mile, then
-- the river's main gauge. The Meramec's two stretches (upper-meramec,
-- lower-meramec) name no gauge, and none of its four gauge links carries a
-- mile, so every stored mile falls to the main gauge: Steelville.
--
-- Read from production on 2026-11-21, all 33 approved put-ins resolve to
-- Steelville by stored mile, from Short Bend Low Water Bridge (0.10) to
-- Meramec Landing at Valley Park (175.30). That is the planner (estimateRoute
-- passes the stored mile, and a mile wins over the point), the access page,
-- the reach lookup and the agent tools. 26 of them are not on Steelville's
-- water. The gauge blocks in EDDY_KNOWLEDGE.md, confirmed by the owner on
-- 2026-11-18, split the river at three inflows:
--
--   Cook Station  07010350  above Maramec Spring
--   Steelville    07013000  Maramec Spring down to the Huzzah
--   Sullivan      07014500  the Huzzah down to the Bourbeuse
--   Eureka        07019000  the Bourbeuse down
--
-- Given only a map point (embeds, /api/conditions, river visuals), the same
-- call snaps the point to the river line and takes the nearest gauge by
-- distance. That path is right today for 29 of 33.
--
-- ── Why the bounds are not at the inflows ───────────────────────────────────
-- A stretch's bounds are compared with whichever mile the caller resolves:
-- the stored access mile, or the river-line mile snap_to_river gives a point.
-- On the Meramec the two are 21.8 to 26.6 miles apart (stored miles count
-- from Short Bend, Float Missouri's mile 0; the line starts 24 miles higher).
-- The inflows on each scale:
--
--                    stored (Float Missouri)        river line
--   Maramec Spring   28.1, the spring branch        about 51.4
--   the Huzzah       about 65.6                     87.79
--   the Bourbeuse    at Chouteau Claim, 131.5       156.71
--
-- Stretches at the stored inflows would put the planner right and send 11
-- put-ins to the wrong gauge on the point path, because their line miles land
-- in the next stretch down. Sorted together, the two scales need 20 runs of
-- one gauge to be right for both. The owner chose, on 2026-11-21, seven
-- stretches whose bounds fall between put-ins on both scales, leaving the
-- point path's nearest-by-distance choice in the gaps, where it is already
-- right:
--
--   [  0.00,  28.10) Cook Station  stored 0.10-26.20; line 24.34, 25.40
--   [ 65.60,  69.90) Sullivan      stored 68.40, 68.50 (Onondaga, Ozark Outdoors)
--   [ 73.00,  77.50) Sullivan      stored 73.60, 74.20 (Campbell Bridge, Riverview Ranch)
--   [ 78.00, 131.50) Sullivan      stored 78.60-126.90; line 90.43-117.21
--   [131.50, 135.00) Eureka        stored 131.50 (Chouteau Claim)
--   [135.90, 150.50) Eureka        stored 136.00, 148.38
--   [151.00, 230.00) Eureka        stored 155.55, 175.30; line 156.65-201.85
--
-- 28.10 is the Maramec Spring branch on the stored scale, and 131.50 the
-- Bourbeuse at Chouteau Claim. The other bounds sit in gaps: 69.90 below the
-- line mile of Lucky Clover (69.94, Steelville), 73.00 above Bird's Nest's
-- (72.54), 77.50 and 78.00 either side of Garrison's (77.58), 135.00 and
-- 135.90 either side of Red Horse's (135.37, Sullivan by distance), 150.50 and
-- 151.00 either side of River 'Round's (150.72). 230.00 is past the end of the
-- line (223.5). Stored miles left in no stretch (Maramec Spring Park 28.10 to
-- Garrison's 55.30) fall to the main gauge, Steelville, which is their water.
--
-- Chouteau Claim sits at the Bourbeuse's mouth (Float Missouri mile 132.8 is
-- the junction; on the line the put-in is 60 m above it). A float from there
-- is on water below the Bourbeuse, so it reads Eureka.
--
-- Known limits, both as they are today on the point path:
--   Woodson K. Woods (stored 26.20) is above Maramec Spring and reads Cook
--   Station by stored mile, but Steelville by map point: its line mile, 49.40,
--   is nearer Steelville and no bound can take it without Maramec Spring
--   Park's.
--   River 'Round (stored 126.90) is above the Bourbeuse and reads Sullivan by
--   stored mile, but Eureka by map point.
-- A put-in approved later can land in a gap or in the wrong stretch on one
-- path. Bounds like these hold only until the Meramec's stored miles are
-- reconciled with its line; after that, three bounds at the inflows replace
-- all seven.
--
-- ── What it changes ─────────────────────────────────────────────────────────
-- Seven river_sections rows, as above. river_type stays NULL, so no reach
-- panel lists them, and stretch Reads are paused, so they produce no text.
-- No gauge gets a river_mile: on the stored scale it would send Maramec
-- Spring Park through Lucky Clover to Cook Station, the nearest gauge above
-- them, which has not met the spring. No float levels change.
--
-- By stored mile, 26 put-ins change gauge: 8 to Cook Station, 13 to Sullivan
-- and 5 to Eureka. The other 7 stay on Steelville. By map point, Onondaga and
-- Ozark Outdoors move from Steelville to Sullivan; nothing else changes.
--
-- ── What it checks, in one statement ────────────────────────────────────────
-- Before: the four gauges are linked to the river and active, none of the
-- stretches exists, none overlaps a stretch that already names a gauge, the
-- four links carry no mile, and every put-in reads Steelville. After: every
-- put-in reads the gauge of the stretch that holds its stored mile, or
-- Steelville where none does, and exactly 8, 13 and 5 moved. There must be
-- exactly the 33 put-ins reviewed: one approved since fails the count rather
-- than landing in a gap unseen.
-- scripts/meramec-gauge-stretches-migration.test.ts runs this file against
-- production's put-ins as read on 2026-11-21, on both paths.
--
-- After applying, read back every approved put-in on both paths, by stored
-- mile and by map point (coalesce(location_orig, location_snap), as
-- estimateRoute passes it): 31 should agree, and only Woodson K. Woods and
-- River 'Round should differ, as above.

do $$
declare
  found integer;
  bad text;
begin
  -- A database without the Meramec (a preview, a fresh local) has nothing to do.
  if not exists (select 1 from public.rivers where slug = 'meramec') then
    return;
  end if;

  create temporary table meramec_plan (
    section_slug text not null, name text not null, description text not null,
    lo numeric not null, hi numeric not null, site text not null, ord integer not null
  ) on commit drop;
  insert into meramec_plan values
    ('above-maramec-spring', 'Above Maramec Spring',
     'The Meramec above Maramec Spring, Short Bend through Woodson K. Woods. Graded by the Cook Station gauge.',
     0.00, 28.10, '07010350', 1),
    ('huzzah-to-ozark-outdoors', 'The Huzzah to Ozark Outdoors',
     'Onondaga Cave and Ozark Outdoors, below the Huzzah. Graded by the Sullivan gauge.',
     65.60, 69.90, '07014500', 2),
    ('campbell-bridge-to-riverview-ranch', 'Campbell Bridge to Riverview Ranch',
     'Below the Huzzah. Graded by the Sullivan gauge.',
     73.00, 77.50, '07014500', 3),
    ('blue-springs-creek-to-the-bourbeuse', 'Blue Springs Creek to the Bourbeuse',
     'Through Meramec State Park and Red Horse to River ''Round, above the Bourbeuse. Graded by the Sullivan gauge.',
     78.00, 131.50, '07014500', 4),
    ('chouteau-claim', 'Chouteau Claim',
     'At the mouth of the Bourbeuse. Graded by the Eureka gauge.',
     131.50, 135.00, '07019000', 5),
    ('robertsville-to-pacific-palisades', 'Robertsville to Pacific Palisades',
     'Below the Bourbeuse. Graded by the Eureka gauge.',
     135.90, 150.50, '07019000', 6),
    ('allenton-to-valley-park', 'Allenton to Valley Park',
     'Below the Bourbeuse, past the Big River. Graded by the Eureka gauge.',
     151.00, 230.00, '07019000', 7);

  -- By stored mile, how many put-ins move from Steelville to each gauge.
  create temporary table meramec_moves (site text primary key, n integer not null) on commit drop;
  insert into meramec_moves values ('07010350', 8), ('07014500', 13), ('07019000', 5);

  -- ── Before ────────────────────────────────────────────────────────────────
  select string_agg(s.site, ', ') into bad
  from (values ('07010350'), ('07013000'), ('07014500'), ('07019000')) as s(site)
  join public.rivers r on r.slug = 'meramec'
  where not exists (
    select 1 from public.river_gauges rg
    join public.gauge_stations g on g.id = rg.gauge_station_id
    where rg.river_id = r.id and g.usgs_site_id = s.site and g.active);
  if bad is not null then
    raise exception 'meramec stretches: a gauge is not linked to the river and active: %', bad;
  end if;

  if not exists (
    select 1 from public.river_gauges rg
    join public.gauge_stations g on g.id = rg.gauge_station_id
    join public.rivers r on r.id = rg.river_id
    where r.slug = 'meramec' and rg.is_primary and g.usgs_site_id = '07013000') then
    raise exception 'meramec stretches: Steelville (07013000) is not the main gauge, which put-ins outside the stretches fall to';
  end if;

  select string_agg(p.section_slug, ', ') into bad
  from meramec_plan p
  join public.rivers r on r.slug = 'meramec'
  join public.river_sections s on s.river_id = r.id and s.section_slug = p.section_slug;
  if bad is not null then
    raise exception 'meramec stretches: a stretch already exists: %', bad;
  end if;

  select string_agg(p.section_slug || ' with ' || s.section_slug, ', ') into bad
  from meramec_plan p
  join public.rivers r on r.slug = 'meramec'
  join public.river_sections s on s.river_id = r.id
  where s.primary_gauge_station_id is not null
    and coalesce(s.river_mile_start, '-infinity'::numeric) < p.hi
    and coalesce(s.river_mile_end, 'infinity'::numeric) > p.lo;
  if bad is not null then
    raise exception 'meramec stretches: a new stretch overlaps one that already names a gauge: %', bad;
  end if;

  select string_agg(g.usgs_site_id || ' at mile ' || rg.river_mile, ', ') into bad
  from public.rivers r
  join public.river_gauges rg on rg.river_id = r.id
  join public.gauge_stations g on g.id = rg.gauge_station_id
  where r.slug = 'meramec' and rg.river_mile is not null;
  if bad is not null then
    raise exception 'meramec stretches: a gauge link carries a mile, which was not so on 2026-11-21; the gaps between stretches would no longer fall to Steelville: %', bad;
  end if;

  create temporary table meramec_before on commit drop as
  select r.id as river_id, ap.name, ap.river_mile_downstream as mile,
         coalesce(c.gauge_usgs_id, 'none') as site
  from public.rivers r
  join public.access_points ap on ap.river_id = r.id and ap.approved and ap.river_mile_downstream is not null
  left join lateral public.get_river_condition_segment(
    p_river_id => r.id, p_put_in_mile => ap.river_mile_downstream) c on true
  where r.slug = 'meramec';

  select string_agg(b.name || ' (' || b.site || ')', ', ') into bad
  from meramec_before b
  where b.site <> '07013000';
  if bad is not null then
    raise exception 'meramec stretches: a put-in no longer reads Steelville, which every one did on 2026-11-21: %', bad;
  end if;

  -- The bounds were fitted to these 33. One approved since could sit in a gap
  -- and stay on Steelville unseen, so the count is checked, not only the moves.
  select count(*) into found from meramec_before;
  if found <> 33 then
    raise exception 'meramec stretches: % approved put-ins with a stored mile, expected the 33 reviewed on 2026-11-21', found;
  end if;

  -- ── The change ────────────────────────────────────────────────────────────
  insert into public.river_sections
    (river_id, section_slug, name, description, sort_order, river_mile_start, river_mile_end, primary_gauge_station_id)
  select r.id, p.section_slug, p.name, p.description,
         coalesce((select max(s.sort_order) from public.river_sections s where s.river_id = r.id), -1) + p.ord,
         p.lo, p.hi, g.id
  from meramec_plan p
  join public.rivers r on r.slug = 'meramec'
  join public.gauge_stations g on g.usgs_site_id = p.site;
  get diagnostics found = row_count;
  if found <> 7 then
    raise exception 'meramec stretches: inserted % stretches, expected 7', found;
  end if;

  -- ── After ─────────────────────────────────────────────────────────────────
  create temporary table meramec_after on commit drop as
  select b.name, b.mile, b.site as was,
         coalesce(c.gauge_usgs_id, 'none') as now,
         coalesce((select p.site from meramec_plan p where b.mile >= p.lo and b.mile < p.hi), '07013000') as expected
  from meramec_before b
  left join lateral public.get_river_condition_segment(
    p_river_id => b.river_id, p_put_in_mile => b.mile) c on true;

  select string_agg(a.name || ' at mile ' || a.mile || ' (' || a.now || ', expected ' || a.expected || ')', ', ') into bad
  from meramec_after a
  where a.now <> a.expected;
  if bad is not null then
    raise exception 'meramec stretches: a put-in does not read the gauge of its water: %', bad;
  end if;

  select string_agg(m.site || ' took ' || coalesce(k.n, 0) || ', expected ' || m.n, ', ') into bad
  from meramec_moves m
  left join (select now, count(*) as n from meramec_after where now is distinct from was group by now) k on k.now = m.site
  where coalesce(k.n, 0) <> m.n;
  if bad is not null then
    raise exception 'meramec stretches: the number of put-ins that moved is not what was reviewed: %', bad;
  end if;
end $$;
