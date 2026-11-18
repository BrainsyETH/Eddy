-- 20261117211017_twenty_one_stretches_read_their_own_gauge.sql
--
-- Applied to production 2026-11-17 as 20261117211017, after production was
-- confirmed to be serving the commit that pauses stretch Reads (d9dc2a5f7).
-- Read back afterwards: 21 stretches on these ten rivers carry a gauge with
-- both bounds, none is half-set, and the other 18 are untouched. All 103
-- approved access points on these rivers still resolve to their river's
-- primary gauge by stored mile. By map point, nine resolve to a second gauge
-- (Big River's lower three, the Spring's lower two, the St. Francis's lower
-- four), as they did before: none falls inside an assigned stretch, so each
-- comes from the nearest-gauge rule this migration does not touch.
--
-- Twenty-one river stretches get a gauge and mile bounds.
--
-- WHAT THIS DOES TODAY: it records, for each stretch, which gauge speaks for
-- it and where the stretch starts and ends. Nothing a user sees changes.
-- Stretch Reads are paused (src/lib/eddy/stretch-reads.ts: no screen shows
-- them), and these assignments were chosen so that no put-in's planner gauge
-- moves. It is groundwork: if stretch Reads are ever shown, these stretches
-- can be described instead of publishing "Eddy has no gauge reading for
-- <stretch> itself". The owner asked for it on condition that stretch Reads
-- were switched off in production before it was applied.
--
-- ── Why they had none ───────────────────────────────────────────────────────
-- A stretch's Read is written only when its gauge is known to sit on it:
-- sectionGaugeSupportsReport() wants either an assigned station or the
-- stretch's start, end and the gauge's mile. Only the Black, the Buffalo and
-- the Elk had any of that. On the other fifteen rivers every one of those
-- columns was NULL, so the check could not pass whatever the gauge was. The
-- generation log for 2026-11-17 recorded 50 of 58 stretch Reads as
-- `unsupported_section`. Nobody had decided those gauges were wrong for those
-- stretches. The positions had simply never been entered.
--
-- ── Which stretches, and how they were chosen ───────────────────────────────
-- Positions were worked out from the river lines and approved access points
-- on 2026-11-17 and reviewed with the owner, who chose the rule for stretches
-- with no gauge on them: use the nearest gauge when it is the only one or the
-- closest one.
--
--   the gauge is on the stretch, or at its put-in or take-out (11)
--     big-piney        slabtown-to-ross
--     big-river        mammoth-to-merrill-horne
--     bryant-creek     warren-bridge-to-cooks-landing
--     caddo-river      caddo-gap-to-glenwood
--     crooked-creek    mark-oliver-to-kellys-slab, kellys-slab-to-yellville
--     mulberry         campbell-cemetery-to-mill-creek
--     north-fork-white north-fork-main
--     spring-river     spring-reach1
--     war-eagle-creek  withrow-springs-to-hwy-45, hwy-45-to-war-eagle-mill
--
--   the nearest gauge is off the stretch (10), miles from the nearer end
--     caddo-river      norman-to-caddo-gap                 2 below the take-out
--     st-francis       upper-whitewater                    3 above the put-in;
--                                                          the run is published
--                                                          on this gauge
--     bryant-creek     hodgson-mill-to-warren-bridge       5 below
--     big-river        washington-state-park-to-mammoth    6 below
--     big-piney        slabtown-to-horse-camp              6 below
--     crooked-creek    snow-to-mark-oliver                 7 below
--     mulberry         turner-bend-to-campbell-cemetery   12 below
--     mulberry         redding-to-turner-bend             23 below
--     mulberry         byrds-to-turner-bend               23 below
--     mulberry         wolf-pen-to-redding                26 below
--
-- A gauge below a stretch has more drainage above it than the stretch does and
-- can read floatable while the stretch is thin. That is the accepted cost of
-- the rule above. Where EDDY_KNOWLEDGE.md says so for a stretch (Wolf Pen
-- "needs the upper part of the band"), that note would reach a stretch Read,
-- because section knowledge is only loaded for a model-written Read.
--
-- ── Why only twenty-one of the thirty-one that were approved ────────────────
-- The assignment made here is not private to the Read.
-- get_river_condition_segment() consults the same columns to choose the gauge
-- that grades a float plan: a stretch with an assigned gauge overrides
-- positional selection for every put-in inside its bounds. So each proposed
-- row was simulated against all approved access points on its river, by
-- stored mile and by map point, before this file was written.
--
-- These twenty-one change no put-in's gauge in either mode. Each uses its
-- river's primary gauge, on a river where that is already what every put-in
-- resolves to. The other ten would move a put-in to a different gauge (the
-- Current, James and Meramec stretches, Big River's Morse Mill), or have no
-- defined boundaries (the two Gasconade stretches), or sit on a river whose
-- access-point miles are offset from its line so that bounds cannot be right
-- for both kinds of caller (the Bourbeuse, the Meramec). Those are a separate
-- decision and are not in this file.
--
-- ── Miles ───────────────────────────────────────────────────────────────────
-- Bounds are the stored river_mile_downstream of the approved access points
-- that name each stretch's ends, read on 2026-11-17. That is the scale the
-- planner passes in. A stretch with an assigned gauge and no bounds would
-- match every mile on its river, so both are set together or not at all.
--
-- Stretches on one river may overlap (Slabtown to Horse Camp lies inside
-- Slabtown to Ross). That is harmless here because overlapping stretches are
-- assigned the same gauge.
--
-- gauge river_mile is deliberately left NULL. Setting it would switch on
-- positional selection for put-ins outside these stretches.
--
-- ── What it checks before and after, in one statement ───────────────────────
-- Before: all twenty-one stretches exist and are still unassigned and
-- unbounded; each gauge is linked to its river, active, rated, and is that
-- river's primary. After: each stretch's put-in mile resolves to its gauge,
-- and every approved access point on these ten rivers still resolves to the
-- river's primary gauge. Any failure raises, and the whole statement is
-- rolled back.

do $$
declare
  expected constant integer := 21;
  found integer;
  bad text;
begin
  create temporary table stretch_gauge_plan (
    river_slug text not null,
    section_slug text not null,
    site text not null,
    start_mile numeric not null,
    end_mile numeric not null,
    primary key (river_slug, section_slug)
  ) on commit drop;

  insert into stretch_gauge_plan values
    -- Slabtown Recreation Area, Horse Camp Access, Ross Access
    ('big-piney', 'slabtown-to-horse-camp', '06930000', 59.00, 68.70),
    ('big-piney', 'slabtown-to-ross', '06930000', 59.00, 74.80),
    -- Washington State Park Access, Mammoth Access, Merrill Horse Access
    ('big-river', 'washington-state-park-to-mammoth', '07018100', 76.97, 80.20),
    ('big-river', 'mammoth-to-merrill-horne', '07018100', 80.20, 86.38),
    -- Sycamore Access, Warren Bridge Access, Florence C. Cook Access
    ('bryant-creek', 'hodgson-mill-to-warren-bridge', '07058000', 46.48, 54.11),
    ('bryant-creek', 'warren-bridge-to-cooks-landing', '07058000', 54.11, 61.85),
    -- Norman Boating Access, Swinging Bridge Access, Glenwood Access
    ('caddo-river', 'norman-to-caddo-gap', '07359610', 11.68, 17.77),
    ('caddo-river', 'caddo-gap-to-glenwood', '07359610', 17.77, 27.68),
    -- Snow Access, Mark Oliver Access, Kelley's Slab Access, Yellville City Park Access
    ('crooked-creek', 'snow-to-mark-oliver', '07055607', 47.15, 52.52),
    ('crooked-creek', 'mark-oliver-to-kellys-slab', '07055607', 52.52, 59.36),
    ('crooked-creek', 'kellys-slab-to-yellville', '07055607', 59.36, 62.89),
    -- Wolf Pen, Byrd's, Redding, Turner Bend, Campbell Cemetery, Mill Creek
    ('mulberry', 'wolf-pen-to-redding', '07252000', 19.55, 32.21),
    ('mulberry', 'byrds-to-turner-bend', '07252000', 28.47, 35.81),
    ('mulberry', 'redding-to-turner-bend', '07252000', 32.21, 35.81),
    ('mulberry', 'turner-bend-to-campbell-cemetery', '07252000', 35.81, 46.44),
    ('mulberry', 'campbell-cemetery-to-mill-creek', '07252000', 46.44, 59.19),
    -- Highway 14 bridge (Twin Bridges), Tecumseh / Norfork Lake Public Access
    ('north-fork-white', 'north-fork-main', '07057500', 38.19, 64.05),
    -- Mammoth Spring State Park (Dam #1), Hardy (Spring Street Bridge) Access
    ('spring-river', 'spring-reach1', '07069305', 0.23, 18.41),
    -- Millstream Gardens Conservation Area, Silver Mines Recreation Area
    ('st-francis', 'upper-whitewater', '07034000', 20.20, 23.20),
    -- Withrow Springs boating access, Hwy 45 bridge, War Eagle Mill
    ('war-eagle-creek', 'withrow-springs-to-hwy-45', '07049000', 31.20, 43.73),
    ('war-eagle-creek', 'hwy-45-to-war-eagle-mill', '07049000', 43.73, 54.20);

  -- A database without these rivers (a preview, a fresh local) has nothing to
  -- connect. Production has all ten; anything in between is a real problem and
  -- is caught by the counts below.
  if not exists (select 1 from public.rivers r join stretch_gauge_plan p on p.river_slug = r.slug) then
    return;
  end if;

  -- ── Before ────────────────────────────────────────────────────────────────
  select count(*) into found
  from stretch_gauge_plan p
  join public.rivers r on r.slug = p.river_slug
  join public.river_sections s on s.river_id = r.id and s.section_slug = p.section_slug
  where s.primary_gauge_station_id is null
    and s.river_mile_start is null
    and s.river_mile_end is null;
  if found <> expected then
    raise exception 'stretch gauges: % of % stretches exist unassigned and unbounded', found, expected;
  end if;

  select count(*) into found
  from stretch_gauge_plan p
  join public.rivers r on r.slug = p.river_slug
  join public.gauge_stations g on g.usgs_site_id = p.site and g.active
  join public.river_gauges rg on rg.river_id = r.id and rg.gauge_station_id = g.id
  where rg.is_primary
    and rg.level_optimal_min is not null;
  if found <> expected then
    raise exception 'stretch gauges: % of % gauges are linked, active, rated and primary', found, expected;
  end if;

  -- ── The change ────────────────────────────────────────────────────────────
  update public.river_sections s
  set primary_gauge_station_id = g.id,
      river_mile_start = p.start_mile,
      river_mile_end = p.end_mile
  from stretch_gauge_plan p
  join public.rivers r on r.slug = p.river_slug
  join public.gauge_stations g on g.usgs_site_id = p.site
  where s.river_id = r.id
    and s.section_slug = p.section_slug;
  get diagnostics found = row_count;
  if found <> expected then
    raise exception 'stretch gauges: updated % rows, expected %', found, expected;
  end if;

  -- ── After ─────────────────────────────────────────────────────────────────
  -- Each stretch's put-in resolves to the gauge it was given.
  select string_agg(p.river_slug || '/' || p.section_slug, ', ') into bad
  from stretch_gauge_plan p
  join public.rivers r on r.slug = p.river_slug
  left join lateral public.get_river_condition_segment(p_river_id => r.id, p_put_in_mile => p.start_mile) c on true
  where c.gauge_usgs_id is distinct from p.site;
  if bad is not null then
    raise exception 'stretch gauges: put-in does not resolve to the assigned gauge for %', bad;
  end if;

  -- No put-in on these rivers changed gauge. Before this migration every one
  -- resolved to its river's primary; it still must.
  select string_agg(r.slug || ': ' || ap.name, ', ') into bad
  from public.access_points ap
  join public.rivers r on r.id = ap.river_id
  join public.river_gauges rg on rg.river_id = r.id and rg.is_primary
  join public.gauge_stations g on g.id = rg.gauge_station_id
  left join lateral public.get_river_condition_segment(p_river_id => r.id, p_put_in_mile => ap.river_mile_downstream) c on true
  where r.slug in (select river_slug from stretch_gauge_plan)
    and ap.approved
    and ap.river_mile_downstream is not null
    and c.gauge_usgs_id is distinct from g.usgs_site_id;
  if bad is not null then
    raise exception 'stretch gauges: a put-in no longer resolves to its river''s primary gauge: %', bad;
  end if;
end $$;
