-- Give every gauge search result the publisher that owns its station.
--
-- Version 1.0 can already open a USACE-backed gauge, but search_gauges returns
-- no provider. The API and app therefore fall back to USGS wording for a value
-- published by the Corps. Adding provider to the RPC lets 1.1 preserve the
-- station's provenance while its optional wire field remains compatible with
-- a 1.0 backend during a staggered deploy.
--
-- The national USGS snapshot lives in gauge_latest. Curated non-USGS stations
-- may only have gauge_readings, so the lateral fallback also prevents an
-- otherwise-current release from arriving as an empty search result. The API
-- still overlays loadCurrentReadings for curated stations because that tier can
-- be fresher even when gauge_latest has a row.
--
-- Return columns changed, so PostgreSQL requires dropping both overloads before
-- recreating them. p_offset stays required on the five-argument implementation;
-- defaulting it makes PostgREST unable to distinguish these overloads.

drop function if exists public.search_gauges(
  text, integer, double precision, double precision
);
drop function if exists public.search_gauges(
  text, integer, integer, double precision, double precision
);

create function public.search_gauges(
    p_query text,
    p_limit integer,
    p_offset integer,
    p_near_lng double precision default null,
    p_near_lat double precision default null
)
returns table (
    id uuid,
    site_id text,
    provider text,
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
        coalesce(gs.provider, 'usgs') as provider,
        gs.name,
        gs.curated,
        st_x(gs.location) as lng,
        st_y(gs.location) as lat,
        coalesce(gl.discharge_cfs, historical.discharge_cfs) as discharge_cfs,
        coalesce(gl.gauge_height_ft, historical.gauge_height_ft) as gauge_height_ft,
        coalesce(gl.reading_timestamp, historical.reading_timestamp) as reading_timestamp,
        gl.flow_percentile
    from public.gauge_stations gs
    left join public.gauge_latest gl on gl.gauge_station_id = gs.id
    left join lateral (
        select
            gr.discharge_cfs,
            gr.gauge_height_ft,
            gr.reading_timestamp
        from public.gauge_readings gr
        where gl.gauge_station_id is null
          and gr.gauge_station_id = gs.id
        order by gr.reading_timestamp desc
        limit 1
    ) historical on true
    where gs.active
      and (
            coalesce(p_query, '') = ''
         or gs.name ilike '%' || p_query || '%'
         or gs.usgs_site_id ilike p_query || '%'
         or gs.site_id_external ilike p_query || '%'
      )
    order by
        gs.curated desc,
        case
            when p_near_lng is null or p_near_lat is null then null
            else gs.location::geography <-> st_setsrid(
                st_makepoint(p_near_lng, p_near_lat), 4326
            )::geography
        end nulls last,
        gs.name,
        gs.id
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_gauges(
  text, integer, integer, double precision, double precision
) is
  'Searches active stations with publisher provenance and the latest available reading.';

grant execute on function public.search_gauges(
  text, integer, integer, double precision, double precision
) to anon, authenticated, service_role;

-- Preserve the signature used by 1.0 and by /api/gauges/[siteId].
create function public.search_gauges(
    p_query text,
    p_limit integer default 10,
    p_near_lng double precision default null,
    p_near_lat double precision default null
)
returns table (
    id uuid,
    site_id text,
    provider text,
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
    select *
    from public.search_gauges(p_query, p_limit, 0, p_near_lng, p_near_lat);
$$;

grant execute on function public.search_gauges(
  text, integer, double precision, double precision
) to anon, authenticated, service_role;
