-- Take the default back off p_offset, which is what makes the overload pair
-- resolvable — and un-breaks every gauge detail screen in the app.
--
-- ── What broke ─────────────────────────────────────────────────────────────
-- 20260816233337_search_gauges_probe_headroom.sql fixed a real bug (the row
-- clamp made /api/search's hasMore probe unsatisfiable at the advertised page
-- size) and, in restating the signature to do it, gave p_limit and p_offset
-- defaults they had never had:
--
--     p_limit integer default 10,
--     p_offset integer default 0,
--
-- 20260811130000 says at length why p_offset must not have one, and this is
-- exactly the failure it predicted. PostgREST resolves an RPC by ARGUMENT NAME,
-- keeping a candidate only when every parameter the caller omitted has a
-- default. With p_offset defaulted, a `{p_query, p_limit}` call matches BOTH
-- the 4-arg compatibility form and the 5-arg paged one, PostgREST cannot
-- choose, and it fails the request outright (PGRST203).
--
-- Two callers pass exactly those two arguments:
--
--   /api/gauges/[siteId]  — its ONLY station lookup. The route logs
--                           "search_gauges failed" and answers 500, so the app
--                           got nothing for any gauge, of either tier.
--   /api/search           — only on its unpaged retry path, which is why search
--                           itself stayed up: the paged call names p_offset and
--                           resolves to the 5-arg form unambiguously.
--
-- The user-visible shape of it was a lie rather than an error. The phone's
-- Levels tab reads `thresholds` off that response and, finding none, said
-- "Eddy has not rated this station against a river yet" — under a pin already
-- wearing the verdict that ladder had just produced. Jacks Fork at Alley Spring
-- (07065495) is rated against the Jacks Fork in cfs and denied its own rating.
--
-- ── Why a drop and not a replace ───────────────────────────────────────────
-- CREATE OR REPLACE FUNCTION can ADD a parameter default but not REMOVE one —
-- PostgreSQL answers "cannot remove parameter defaults from existing function"
-- and points at DROP. Both statements run in one transaction, so the 4-arg
-- form, whose body calls this one positionally, is never left pointing at
-- nothing.
--
-- The body is 20260816233337's, unchanged, clamp and all. Only the two defaults
-- go. Grants are re-stated because a dropped function takes its ACL with it.

drop function if exists public.search_gauges(
  text, integer, integer, double precision, double precision
);

create function public.search_gauges(
    p_query text,
    -- NO DEFAULTS ON THESE TWO. p_offset's absence is what tells PostgREST the
    -- two forms apart; p_limit's keeps the pair symmetrical with the 4-arg
    -- form, which owns the defaulted spelling. If a default here ever looks
    -- tempting, add a separately named function instead.
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
    -- 100 is the API's advertised page size; the +1 is the caller's probe row,
    -- which is how it knows another page exists. Clamping at 100 made hasMore
    -- unsatisfiable at exactly the maximum the API documents.
    limit greatest(1, least(p_limit, 101))
    offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_gauges(
  text, integer, integer, double precision, double precision
) is
  'Active stations with publisher provenance and their gauge_latest snapshot — the only reading tier this function consults. A curated station may have a newer reading in gauge_readings; the API overlays it via loadCurrentReadings rather than joining it here. Row cap is 101: the API''s 100-row page plus the caller''s hasMore probe row. p_limit and p_offset carry no defaults on purpose — the 4-arg overload is the one a two-argument PostgREST call must resolve to.';

grant execute on function public.search_gauges(
  text, integer, integer, double precision, double precision
) to anon, authenticated, service_role;
