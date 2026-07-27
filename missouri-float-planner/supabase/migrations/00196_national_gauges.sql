-- 00196_national_gauges.sql
-- Nationwide gauge coverage: the "All Gauges" tier from docs/EDDY_IOS_STRATEGY.md.
--
-- Eddy rates 46 gauges across 24 rivers. Every competitor ships the whole
-- country (Rivercast ~12k, River Stages ~10k). This migration makes room for
-- the other ~16,500 live USGS stream sites WITHOUT letting them anywhere near
-- the curated machinery — no alerts, no Eddy prose, no floatability verdict.
--
-- ── Why a flag on gauge_stations and not a second table ─────────────────────
-- The obvious split is a separate `reference_gauges`. It costs more than it
-- saves: starred_gauges.gauge_station_id is a REAL foreign key to
-- gauge_stations(id) (00194), and the strategy requires that a starred raw
-- gauge GRADUATES IN PLACE when its river is later curated — same row, same id,
-- same star, same history. Two tables would make that a migration instead of a
-- boolean flip. 00194's own header makes this argument about starred_rivers;
-- it applies here unchanged.
--
-- ── Why gauge_latest and not gauge_readings ─────────────────────────────────
-- gauge_readings is append-only history: 689k rows and 187 MB for 259 stations,
-- about 271 bytes a row. Appending 16,500 stations hourly would write ~145M
-- rows and ~40 GB a year of readings nobody grades. gauge_latest holds ONE row
-- per station, overwritten in place, so the whole national tier costs ~16,500
-- rows forever. Curated stations keep writing history to gauge_readings exactly
-- as they do today, because that history is what the condition ladder, the
-- hydrograph and the alert debounce all read.
--
-- ── search_path on the new functions ────────────────────────────────────────
-- PostGIS lives in the `extensions` schema on this project, not public. The
-- existing spatial RPCs (get_mo_surface_water_dataset, nearest_access_points_
-- to_point) carry no search_path at all, which 00186 left alone precisely
-- because `search_path = ''` cannot resolve the `&&` and `<->` OPERATORS
-- without OPERATOR(extensions.&&) noise. Pinning `public, extensions` is the
-- middle ground: not caller-mutable, and the operators still resolve. Anything
-- added here that does NOT touch PostGIS should still be pinned to ''.

-- ── gauge_stations: the tier flag and the metadata a national map needs ─────

alter table public.gauge_stations
    -- "Eddy has rated this against a river." Backfilled below; the DEFAULT is
    -- false so a bulk import can never accidentally claim curation.
    add column if not exists curated boolean not null default false,
    add column if not exists state_code text,
    add column if not exists county text,
    add column if not exists huc text,
    add column if not exists site_type_code text,
    -- The OGC monitoring-locations collection carries non-USGS agencies (state
    -- health departments, irrigation districts). Recorded so the importer's
    -- filter is auditable rather than invisible.
    add column if not exists agency_code text,
    -- ['00060','00065'] — which parameters this site actually reports LIVE.
    -- Populated from latest-continuous, not from the period of record: a site
    -- that stopped telemetering in 1997 is not a gauge you can float on.
    add column if not exists parameter_codes text[],
    add column if not exists waterbody_name text,
    -- NWS thresholds for stations with no curated ladder. The CURATED ladder
    -- stays on river_gauges — one station can rate two rivers differently
    -- (07014000 is primary for both huzzah and courtois), so the ladder is a
    -- property of the pairing. These four are properties of the station.
    add column if not exists nwps_action_stage_ft numeric(10, 2),
    add column if not exists nwps_flood_stage_ft numeric(10, 2),
    add column if not exists nwps_moderate_stage_ft numeric(10, 2),
    add column if not exists nwps_major_stage_ft numeric(10, 2),
    add column if not exists first_seen_at timestamptz,
    add column if not exists last_seen_at timestamptz;

-- ── Make (provider, site_id_external) a TOTAL key before bulk upserting on it ─
--
-- 00145 added the pair and its unique index, but one usgs row still carries a
-- NULL site_id_external (07050500, Kings River near Berryville — a CURATED
-- gauge). Postgres treats NULLs as distinct in a unique index, so an upsert
-- with onConflict:'provider,site_id_external' would not match that row: it
-- would INSERT a second Kings River, and then fail the usgs_site_id unique
-- constraint partway through a 16,500-row import. Backfill first.
update public.gauge_stations
   set site_id_external = usgs_site_id
 where provider = 'usgs'
   and site_id_external is null
   and usgs_site_id is not null;

-- Every station wired to a river is curated, by definition. This is the same
-- set /api/gauges already filters to, so the flag starts life agreeing with the
-- behaviour shipped builds observe.
update public.gauge_stations gs
   set curated = true
 where not gs.curated
   and exists (
        select 1 from public.river_gauges rg where rg.gauge_station_id = gs.id
      );

-- Partial: the curated set is ~46 rows out of ~16,500, and every existing query
-- in the app wants exactly those.
create index if not exists idx_gauge_stations_curated
    on public.gauge_stations (curated)
    where curated;

-- /api/search runs `ilike '%q%'` over gauge_stations.name (search/route.ts:216).
-- That is a sequential scan the moment this table stops being 288 rows.
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_gauge_stations_name_trgm
    on public.gauge_stations using gin (name extensions.gin_trgm_ops);

create index if not exists idx_gauge_stations_site_external_trgm
    on public.gauge_stations using gin (site_id_external extensions.gin_trgm_ops);

-- ── gauge_latest: one row per station, overwritten, never appended ──────────

create table if not exists public.gauge_latest (
    gauge_station_id uuid primary key
        references public.gauge_stations(id) on delete cascade,
    reading_timestamp timestamptz not null,
    gauge_height_ft numeric(10, 2),
    discharge_cfs numeric(12, 2),
    -- USGS qualifier codes (ice-affected, estimated, equipment fault). Same
    -- shape as gauge_readings.qualifiers (00143) so classifyQualifiers() in
    -- src/lib/usgs/gauges.ts works against both without a second code path.
    qualifiers text[],
    -- 0-100 against this site's day-of-year history, computed at ingest from
    -- usgs_daily_percentiles so serving needs no join and no arithmetic.
    -- NULL means we hold no statistics for this site — a neutral pin, never a
    -- guess. See shared/flow-band.ts.
    flow_percentile smallint check (flow_percentile between 0 and 100),
    fetched_at timestamptz not null default now()
);

-- 16.5k rows rewritten every hour is ~400k dead tuples a day on a table small
-- enough that default autovacuum thresholds (20% of a tiny table) would let it
-- bloat for weeks. fillfactor leaves page room for HOT updates, so most
-- rewrites never touch the primary key index at all.
alter table public.gauge_latest set (
    fillfactor = 70,
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.01
);

alter table public.gauge_latest enable row level security;

-- Public reference data, written by the cron via the service role. Mirrors
-- usgs_daily_percentiles (00185).
drop policy if exists gauge_latest_select_all on public.gauge_latest;
create policy gauge_latest_select_all on public.gauge_latest
    for select using (true);

-- ── gauges_in_bbox: the map's viewport query ────────────────────────────────
--
-- An RPC rather than a PostgREST filter for two things PostgREST cannot
-- express: the `&&` operator that uses idx_gauge_stations_location, and
-- st_x/st_y. The second matters more than it looks — it means this path never
-- goes near parseWKBHex() in /api/gauges/route.ts, the hand-rolled EWKB parser
-- that returns {lng:0,lat:0} on failure. Null island is a bug you can absorb
-- across 46 gauges and cannot across 16,500.
--
-- Ordering is curated-first, then discharge-desc: when the cap bites it drops
-- the smallest creeks, and it can NEVER drop a gauge Eddy has rated. `total` is
-- a window count so the caller can say "300 of 1,240" instead of truncating
-- silently — the same disclosure MO_SITES_CAP makes in mo-sites.ts.

create or replace function public.gauges_in_bbox(
    p_west double precision,
    p_south double precision,
    p_east double precision,
    p_north double precision,
    p_limit integer default 300,
    p_curated_only boolean default false
)
returns table (
    id uuid,
    site_id text,
    name text,
    curated boolean,
    lng double precision,
    lat double precision,
    discharge_cfs numeric,
    gauge_height_ft numeric,
    reading_timestamp timestamptz,
    qualifiers text[],
    flow_percentile smallint,
    total bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
    with matched as (
        select
            gs.id,
            coalesce(gs.usgs_site_id, gs.site_id_external) as site_id,
            gs.name,
            gs.curated,
            st_x(gs.location) as lng,
            st_y(gs.location) as lat,
            gl.discharge_cfs,
            gl.gauge_height_ft,
            gl.reading_timestamp,
            gl.qualifiers,
            gl.flow_percentile
        from public.gauge_stations gs
        join public.gauge_latest gl on gl.gauge_station_id = gs.id
        where gs.active
          and (not p_curated_only or gs.curated)
          and gs.location && st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
    )
    select
        m.id,
        m.site_id,
        m.name,
        m.curated,
        m.lng,
        m.lat,
        m.discharge_cfs,
        m.gauge_height_ft,
        m.reading_timestamp,
        m.qualifiers,
        m.flow_percentile,
        count(*) over () as total
    from matched m
    order by m.curated desc, m.discharge_cfs desc nulls last
    limit greatest(1, least(p_limit, 1000));
$$;

grant execute on function public.gauges_in_bbox(
    double precision, double precision, double precision, double precision, integer, boolean
) to anon, authenticated, service_role;

-- ── gauge_points: cursor pagination over every station's coordinates ────────
--
-- gauges_in_bbox caps at 1,000 rows ON PURPOSE — it answers a viewport for a
-- phone. Scripts need the opposite: all ~14,000 stations, in a stable order,
-- a page at a time. Keyset pagination on the primary key rather than OFFSET so
-- a station inserted mid-walk cannot make the walk skip or repeat a row.
--
-- Exists because PostgREST cannot select st_x(location); without it a bulk
-- reader would have to pull the WKB and parse it in TypeScript, which is the
-- hand-rolled parseWKBHex path /api/gauges is stuck with and nothing new
-- should join.

create or replace function public.gauge_points(
    p_after uuid default null,
    p_limit integer default 1000
)
returns table (
    id uuid,
    site_id text,
    curated boolean,
    lng double precision,
    lat double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
    select
        gs.id,
        coalesce(gs.usgs_site_id, gs.site_id_external) as site_id,
        gs.curated,
        st_x(gs.location) as lng,
        st_y(gs.location) as lat
    from public.gauge_stations gs
    where gs.active
      and (p_after is null or gs.id > p_after)
    order by gs.id
    limit greatest(1, least(p_limit, 5000));
$$;

grant execute on function public.gauge_points(uuid, integer)
    to anon, authenticated, service_role;

-- ── search_gauges: /api/search, once the table is 16,500 rows ───────────────
--
-- Curated first — a gauge Eddy has rated is a better answer than one it has
-- not — then by distance when the caller passes a point, then by name.
--
-- Coordinates come back because a search result can now be a gauge the client
-- has never fetched. /api/search's current `coordinates: null` is justified by
-- a comment saying the client already holds every gauge from /api/gauges, and
-- that stops being true here.
--
-- Distance is measured on geography, not on 4326 degrees: a degree of longitude
-- is 54 miles in south Texas and 34 in northern Maine, and ordering "nearest
-- gauges" by degrees would quietly mis-rank the whole country north-south.
-- The cast forgoes the GiST index, which costs nothing — the ILIKE filter has
-- already cut the set to a handful before ordering runs.

create or replace function public.search_gauges(
    p_query text,
    p_limit integer default 10,
    p_near_lng double precision default null,
    p_near_lat double precision default null
)
returns table (
    id uuid,
    site_id text,
    name text,
    curated boolean,
    lng double precision,
    lat double precision,
    discharge_cfs numeric,
    gauge_height_ft numeric,
    reading_timestamp timestamptz,
    flow_percentile smallint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
    select
        gs.id,
        coalesce(gs.usgs_site_id, gs.site_id_external) as site_id,
        gs.name,
        gs.curated,
        st_x(gs.location) as lng,
        st_y(gs.location) as lat,
        gl.discharge_cfs,
        gl.gauge_height_ft,
        gl.reading_timestamp,
        gl.flow_percentile
    from public.gauge_stations gs
    left join public.gauge_latest gl on gl.gauge_station_id = gs.id
    where gs.active
      and (
            gs.name ilike '%' || p_query || '%'
         or gs.usgs_site_id ilike p_query || '%'
         or gs.site_id_external ilike p_query || '%'
      )
    order by
        gs.curated desc,
        case
            when p_near_lng is null or p_near_lat is null then null
            else gs.location::geography <-> st_setsrid(st_makepoint(p_near_lng, p_near_lat), 4326)::geography
        end nulls last,
        gs.name
    limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.search_gauges(
    text, integer, double precision, double precision
) to anon, authenticated, service_role;
