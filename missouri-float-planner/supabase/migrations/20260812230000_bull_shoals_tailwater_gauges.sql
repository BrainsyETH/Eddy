-- Wire the Bull Shoals tailwater: the release that drives it, and the two
-- gauges that measure what is left of it downstream.
--
-- Follows 00198 (Clearwater) for the station itself — a dam's total release IS
-- a river discharge at a point, so it rides the normal gauge pipeline as a
-- `provider='usace'` station rather than a parallel mechanism. Read 00198's
-- header for that reasoning; it is unchanged here.
--
-- What is NOT the same as Clearwater, and is the whole difficulty:
--
--   Clearwater  flood-control, no powerhouse, steady release, ONE downstream
--               gauge 40 river miles away reading within 5%. The Black's own
--               condition comes from Annapolis ABOVE the lake, so the dam
--               attaches as a secondary gauge that qualifies the river.
--
--   Bull Shoals eight units of peaking hydro on a trout tailwater. The river
--               below IS the release and has no other source, so there is no
--               "primary gauge above the lake" to defer to. Nothing measures
--               the water people actually stand in: between the dam and Rim
--               Shoals (~24 river miles, the trophy reach) there is no live
--               stage or discharge gauge, and the three USGS stations that
--               look like ones publish only temperature and dissolved oxygen.
--
-- Hence: the release station is PRIMARY here, because it is the only honest
-- description of the reach's flow, and both downstream gauges attach as
-- secondary with their bias recorded rather than averaged away.
--
-- Ladder levels stay NULL on all three, deliberately, exactly as 00198 left
-- Clearwater's. No sourced local rating exists for any point on this river.
-- `dam_tailwater` is exempt from the ladder checks as of
-- 20260812220000_regime_aware_validation_for_dam_tailwaters, so NULL here is
-- the regime's correct shape and not a gap to be filled in later by guessing.
--
-- ── Ordering ───────────────────────────────────────────────────────────────
-- This migration NEEDS the river row, which the NHD import creates (slug
-- white-river-bull-shoals, mode 'insert', trimmed dam→Guion). Every insert
-- below is guarded on that row existing, so applying this first is a harmless
-- no-op rather than an error — run the geometry import, then re-run this.

-- ── The release station ────────────────────────────────────────────────────
-- site_id_external matches the key in usace-registry.ts, as 00198 established.
insert into public.gauge_stations (
    usgs_site_id,
    site_id_external,
    provider,
    name,
    location,
    active,
    curated,
    threshold_descriptions
)
select
    null,
    'swl-bull-shoals-dam',
    'usace',
    'White River below Bull Shoals Dam',
    st_setsrid(st_makepoint(-92.574845, 36.3657191), 4326),
    true,
    true,
    jsonb_build_object(
        'source', 'USACE Little Rock District (CWMS)',
        'note', 'Total release from Bull Shoals Dam, measured at the dam. The White River below runs at whatever the Corps releases. This is NOT a depth anywhere downstream: the water takes hours to arrive, and releases change without notice.'
    )
where not exists (
    select 1 from public.gauge_stations
    where provider = 'usace' and site_id_external = 'swl-bull-shoals-dam'
);

-- ── Curate the two downstream gauges ───────────────────────────────────────
-- Both already exist as rows from the national catalogue import, at
-- curated=false with no readings and no river link — so this is a flag flip,
-- not an insert. Since 00196 the update-gauges cron polls only curated and
-- starred stations, so without this they stay silent.
update public.gauge_stations
set curated = true, active = true
where provider = 'usgs'
  and site_id_external in ('07057370', '07060500');

-- ── Attach all three to the river ──────────────────────────────────────────
-- threshold_unit = 'cfs' throughout: the release provider reports discharge and
-- never a stage (00198 asserts this globally, and that assertion re-runs
-- below), and both USGS gauges are graded on discharge for consistency across
-- the reach — mixing ft and cfs within one river invites a comparison nobody
-- should make.
insert into public.river_gauges (
    river_id,
    gauge_station_id,
    is_primary,
    threshold_unit,
    distance_from_section_miles
)
select r.id, gs.id, v.is_primary, 'cfs', v.distance_mi
from public.rivers r
cross join (values
    -- The release. Primary because it is the only measurement of this reach's
    -- flow that exists; distance 0 because it is measured at the dam.
    ('usace', 'swl-bull-shoals-dam', true,  0.0),
    -- Nearest live stage/discharge gauge, ~45 river miles down. BIASED HIGH
    -- for this dam: it sits below the North Fork confluence and carries
    -- Norfork Dam's releases too (drainage 8,040 sq mi vs this dam's 6,050).
    ('usgs',  '07057370',            false, 45.0),
    -- ~62 river miles down, below the Buffalo as well. Lower river only.
    ('usgs',  '07060500',            false, 62.0)
) as v(provider, site_id, is_primary, distance_mi)
join public.gauge_stations gs
  on gs.provider = v.provider and gs.site_id_external = v.site_id
where r.slug = 'white-river-bull-shoals'
  and not exists (
      select 1 from public.river_gauges rg
      where rg.river_id = r.id and rg.gauge_station_id = gs.id
  );

-- ── Invariants ─────────────────────────────────────────────────────────────
do $$
declare
    v_river uuid;
begin
    select id into v_river from public.rivers where slug = 'white-river-bull-shoals';
    if v_river is null then
        raise notice 'white-river-bull-shoals not present yet — run the NHD geometry import, then re-run this migration';
        return;
    end if;

    -- The regime has to be declared, or regime-aware validation grades this
    -- river as an ordinary one and fails it on a ladder it must not have.
    if not exists (
        select 1 from public.rivers
        where id = v_river and river_type = 'dam_tailwater'
    ) then
        raise exception 'white-river-bull-shoals must be river_type = dam_tailwater';
    end if;

    -- Exactly one primary, and it must be the release. A downstream gauge
    -- promoted here would describe the trophy reach with water measured 45
    -- miles away, below another dam's outflow.
    if (
        select count(*) from public.river_gauges rg
        where rg.river_id = v_river and rg.is_primary
    ) <> 1 then
        raise exception 'white-river-bull-shoals must have exactly one primary gauge';
    end if;

    if not exists (
        select 1 from public.river_gauges rg
        join public.gauge_stations gs on gs.id = rg.gauge_station_id
        where rg.river_id = v_river and rg.is_primary and gs.provider = 'usace'
    ) then
        raise exception 'the primary gauge of a dam tailwater must be its release station';
    end if;

    -- No ladder anywhere on this river. If a level appears here later it must
    -- arrive with a sourced local rating and a deliberate removal of this
    -- guard — not as a side effect of a bulk threshold script.
    if exists (
        select 1 from public.river_gauges rg
        where rg.river_id = v_river
          and (rg.level_too_low is not null or rg.level_low is not null
            or rg.level_optimal_min is not null or rg.level_optimal_max is not null
            or rg.level_high is not null or rg.level_dangerous is not null)
    ) then
        raise exception 'no calibrated rating exists for any point on the Bull Shoals tailwater; thresholds here would be invented';
    end if;

    -- 00198's rules, re-asserted because this migration adds rows they govern.
    if exists (
        select 1 from public.gauge_stations gs
        join public.river_gauges rg on rg.gauge_station_id = gs.id
        where gs.provider = 'usace' and gs.curated is not true
    ) then
        raise exception 'usace stations wired to a river must be curated, or update-gauges will skip them';
    end if;

    if exists (
        select 1 from public.river_gauges rg
        join public.gauge_stations gs on gs.id = rg.gauge_station_id
        where gs.provider = 'usace' and rg.threshold_unit is distinct from 'cfs'
    ) then
        raise exception 'usace river_gauges must use threshold_unit = cfs';
    end if;
end $$;
