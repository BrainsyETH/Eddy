-- 00207_search_gauges_paging.sql
--
-- Paging and browsing for search_gauges (00196).
--
-- ── What was wrong ─────────────────────────────────────────────────────────
-- The phone's Search tab could reach 45 gauges out of 14,264. Not because
-- anything filtered them out, but because there was no way to ask for the
-- forty-sixth: search_gauges took a limit and no offset, so the last row of the
-- first page was the last row there was. With an empty field the tab fell back
-- to /api/gauges — the curated list — and that is where the 45 came from.
--
-- Two changes, both additive:
--
--   p_offset      pages past the first screenful.
--   empty p_query stops meaning "match everything by accident" and starts
--                 meaning BROWSE — no name filter, ordered curated-first then
--                 by name, so a list can be scrolled rather than only searched.
--
-- The empty case already "worked" — `name ilike '%%'` matches every row — but
-- only for the first `p_limit` of them, in an order nobody had thought about.
-- Making it explicit is what lets the caller page through it.
--
-- ── Why a new signature rather than an ALTER ───────────────────────────────
-- The app ships through App Store review and the website does not, so a build
-- calling the 4-argument form will be live for weeks after this deploys. Adding
-- a defaulted parameter to the existing function would change its identity and
-- break that caller. The old signature is left in place, untouched, and simply
-- delegates.
--
-- ── The ceiling moved, and not by much ─────────────────────────────────────
-- 50 -> 100 per page. This is a name ILIKE over 14k rows with no trigram index;
-- 100 is comfortably inside what the query planner does in single-digit
-- milliseconds, and paging means nobody needs a bigger page anyway.

create or replace function public.search_gauges(
    p_query text,
    p_limit integer,
    p_offset integer,
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
            else gs.location::geography <-> st_setsrid(st_makepoint(p_near_lng, p_near_lat), 4326)::geography
        end nulls last,
        gs.name,
        -- A total order, so paging cannot repeat or skip a row. Name alone is
        -- not unique — the USGS has several "Dry Creek" — and an unstable tail
        -- on page 3 shows the same station twice and hides another.
        gs.id
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.search_gauges(
    text, integer, integer, double precision, double precision
) to anon, authenticated, service_role;

-- The 00196 signature, preserved for builds already in the field. Delegates so
-- there is one query, not two that can drift.
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
    select * from public.search_gauges(p_query, p_limit, 0, p_near_lng, p_near_lat);
$$;

grant execute on function public.search_gauges(
    text, integer, double precision, double precision
) to anon, authenticated, service_role;
