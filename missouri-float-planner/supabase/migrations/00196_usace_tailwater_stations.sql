-- 00196_usace_tailwater_stations.sql
-- Registers Clearwater Dam as a gauge station so its release rides the normal
-- ingestion pipeline, and attaches it to the Black River as a secondary gauge.
--
-- Why a gauge_stations row and not a new table: the total release below a dam
-- IS a river discharge at a point on the river. gauge_readings.discharge_cfs
-- already models exactly that, and gauge_stations.provider (added in 00145,
-- TEXT with no CHECK) already dispatches to a FlowProvider. Registering
-- 'usace' therefore gets ingestion, threshold banding, the trend chart, the
-- condition badge, alert gating and the embeds for free.
--
-- Reservoir state -- pool elevation, % flood pool, inflow, generation, the
-- release forecast -- deliberately does NOT live here. It is not a river
-- discharge, and one part of it is actively dangerous in this table: Table
-- Rock's pool reads 916 ft, and a value like that in gauge_height_ft would
-- trip the flood-stage override in shared/condition-ladder.ts (which runs
-- BEFORE the null guard) and paint the river red. Those metrics are read
-- through per-request in the dam routes instead.
--
-- Clearwater is the only USACE dam in the registry whose tailwater Eddy
-- currently carries: Black River at Poplar Bluff (07063000) sits below the dam
-- and is release-driven. Measured 2026-07-27, Clearwater released 3,561 cfs
-- while Poplar Bluff read 3,380 -- 5% apart, ~40 river miles down. The other
-- Black River gauge, Annapolis (07061500), sits ABOVE Clearwater Lake and is
-- unaffected by releases; it gets no dam treatment.

-- ── The station ────────────────────────────────────────────────────────────
-- site_id_external matches the key in src/lib/flow-providers/usace-registry.ts.
-- usgs_site_id stays NULL (nullable since 00145) because this is not a USGS
-- site; the unique index on (provider, site_id_external) is what identifies it.
insert into public.gauge_stations (
    usgs_site_id,
    site_id_external,
    provider,
    name,
    location,
    active,
    threshold_descriptions
)
select
    null,
    'swl-clearwater-dam',
    'usace',
    'Black River below Clearwater Dam',
    st_setsrid(st_makepoint(-90.7708833, 37.1349222), 4326)::geography,
    true,
    jsonb_build_object(
        'source', 'USACE Little Rock District (CWMS)',
        'note', 'Total release from Clearwater Dam. The Black River below the dam runs at whatever the Corps releases, so this is the controlling number for the reach down to Poplar Bluff. Releases can change without notice.'
    )
where not exists (
    select 1 from public.gauge_stations
    where provider = 'usace' and site_id_external = 'swl-clearwater-dam'
);

-- ── Attach to the Black River ──────────────────────────────────────────────
-- is_primary = false on purpose. get_river_condition filters is_primary = TRUE,
-- so the river's hero condition stays on Annapolis and the dam shows up as an
-- additional gauge tab. That is the correct relationship: the dam qualifies the
-- river's state, it does not define it.
--
-- threshold_unit = 'cfs' because the provider reports discharge and never a
-- stage (gaugeHeightFt is always null for usace). The ladder levels are left
-- NULL deliberately -- calibrating them is a safety judgement Eddy would be
-- held to, and guessing is worse than staying silent. Until they are sourced
-- the hasLadder() guard in RiverGaugeDetail shows the raw cfs with no
-- condition badge, which is honest.
insert into public.river_gauges (
    river_id,
    gauge_station_id,
    is_primary,
    threshold_unit
)
select r.id, gs.id, false, 'cfs'
from public.rivers r
cross join public.gauge_stations gs
where r.slug = 'black'
  and gs.provider = 'usace'
  and gs.site_id_external = 'swl-clearwater-dam'
  and not exists (
      select 1 from public.river_gauges rg
      where rg.river_id = r.id and rg.gauge_station_id = gs.id
  );

-- ── Invariants ─────────────────────────────────────────────────────────────
do $$
begin
    -- A usace-fed river gauge graded in ft would be comparing a release rate
    -- against a stage ladder. Fail the migration rather than ship that.
    if exists (
        select 1
        from public.river_gauges rg
        join public.gauge_stations gs on gs.id = rg.gauge_station_id
        where gs.provider = 'usace' and rg.threshold_unit is distinct from 'cfs'
    ) then
        raise exception 'usace river_gauges must use threshold_unit = cfs';
    end if;

    -- Pool elevation must never reach gauge_readings. Nothing should have
    -- written a height for a usace station; assert it here so the rule is
    -- enforced at the schema level and not only by convention in the provider.
    if exists (
        select 1
        from public.gauge_readings gr
        join public.gauge_stations gs on gs.id = gr.gauge_station_id
        where gs.provider = 'usace' and gr.gauge_height_ft is not null
    ) then
        raise exception 'usace readings must not carry gauge_height_ft (see condition-ladder flood override)';
    end if;
end $$;
