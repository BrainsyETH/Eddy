-- Give every gauge search result the publisher that owns its station.
--
-- Version 1.0 can already open a USACE-backed gauge, but search_gauges returns
-- no provider. The API and app therefore fall back to USGS wording for a value
-- published by the Corps. Adding provider to the RPC lets 1.1 preserve the
-- station's provenance while its optional wire field remains compatible with
-- a 1.0 backend during a staggered deploy.
--
-- ── The reading join is unchanged, deliberately ────────────────────────────
-- An earlier draft of this migration added a lateral fallback onto
-- gauge_readings for stations with no gauge_latest row, on the theory that a
-- curated non-USGS release would otherwise search as an empty row. It would
-- not: BOTH callers of this function already merge the two tiers in the API.
-- /api/search overlays loadCurrentReadings for every curated row, and
-- /api/gauges/[siteId] calls it unconditionally — and loadCurrentReadings reads
-- gauge_latest AND gauge_readings and keeps the newer timestamp. So the
-- fallback covered a population that was already covered; it could require
-- correlated lookups across the browse path's candidate rows, which is the one
-- query where every active station is a candidate; and it had no age bound, so
-- a station whose gauge_latest row disappeared could surface an arbitrarily old
-- reading as its search number. The first and third of those are certain from
-- reading the callers. The middle one is a planner question nobody measured —
-- which is itself the argument, since the redundancy means there was never a
-- reason to spend an EXPLAIN finding out.
--
-- This migration changes one thing: the provider column. If a station ever does
-- need a second reading tier here, it belongs in the ingestion that leaves
-- gauge_latest empty, not in the read path that works around it.
--
-- Return columns changed, so PostgreSQL requires dropping both overloads before
-- recreating them.
--
-- ── p_offset MUST NOT BE GIVEN A DEFAULT ───────────────────────────────────
-- Carried forward verbatim in substance from 00207, because this file now IS
-- the definition anyone will read, and the invariant is not a style choice.
--
-- PostgREST resolves an RPC by ARGUMENT NAME, keeping a candidate only when
-- every parameter the caller omitted has a default:
--
--   {p_query, p_limit}            -> the 4-arg form only; the 5-arg needs
--                                    p_offset, so it is not a candidate
--   {p_query, p_limit, p_offset}  -> the 5-arg form only; the 4-arg has no
--                                    parameter by that name
--
-- Both are unambiguous, which is why /api/search's paged call and
-- /api/gauges/[siteId]'s two-argument lookup can share one function name.
--
-- Default p_offset to 0 and {p_query, p_limit} suddenly matches BOTH. PostgREST
-- cannot choose, and it fails the request — taking out /api/search AND the
-- gauge detail screen at once, the latter of which answers 500 rather than
-- degrading. If a default ever looks tempting, add a separately named function
-- instead.
--
-- The same care does not extend to POSITIONAL callers, and must not start:
-- `search_gauges('x', 10, 0, 1.0)` resolves to the FIVE-argument form, because
-- an untyped `0` matches p_offset's integer exactly. Every caller today goes
-- through PostgREST with named arguments. Keep it that way.

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
        gl.discharge_cfs,
        gl.gauge_height_ft,
        gl.reading_timestamp,
        gl.flow_percentile
    from public.gauge_stations gs
    left join public.gauge_latest gl on gl.gauge_station_id = gs.id
    where gs.active
      -- Empty or null query = browse. Stated as a branch rather than left to
      -- `ilike '%%'`, so the intent is legible and a future index hint has
      -- somewhere to go.
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
        -- A total order, so paging cannot repeat or skip a row. Name alone is
        -- not unique — the USGS has several "Dry Creek" — and an unstable tail
        -- on page 3 shows the same station twice and hides another.
        gs.id
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_gauges(
  text, integer, integer, double precision, double precision
) is
  'Active stations with publisher provenance and their gauge_latest snapshot — the only reading tier this function consults. A curated station may have a newer reading in gauge_readings; the API overlays it via loadCurrentReadings rather than joining it here.';

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
