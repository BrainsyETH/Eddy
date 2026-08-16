-- Let the gauge search's probe row through at the advertised maximum page size.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
-- /api/search advertises `limit` up to MAX_LIMIT = 100 and detects "there is
-- another page" by asking for one row more than it intends to return
-- (`probe = limit + 1`), returning the extra row's existence as `hasMore`.
--
-- This function clamped at exactly 100. At the advertised maximum the probe
-- asked for 101 and got 100, so `results.length > limit` could never be true:
-- `hasMore` was hard-false and paging stopped after the first hundred gauges
-- with roughly fourteen thousand still behind it. Silent — a caller reading a
-- truncated corpus has no way to tell it apart from having reached the end.
--
-- The phone is unaffected (SEARCH_PAGE_SIZE is 50); this is the documented API
-- contract failing at the exact value it documents.
--
-- ── Why 101 and not "a bigger number" ──────────────────────────────────────
-- The clamp is a work bound and should stay one. Stating it as the page size
-- PLUS THE PROBE ROW keeps the two numbers tied together, so raising
-- MAX_LIMIT without revisiting this fails loudly here rather than quietly
-- capping the corpus again.
--
-- Signature, ordering, columns and grants are unchanged; only the clamp moves.
-- The 4-arg overload delegates to this body and inherits the fix.

create or replace function public.search_gauges(
    p_query text,
    p_limit integer default 10,
    p_offset integer default 0,
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
  'Active stations with publisher provenance and their gauge_latest snapshot — the only reading tier this function consults. A curated station may have a newer reading in gauge_readings; the API overlays it via loadCurrentReadings rather than joining it here. Row cap is 101: the API''s 100-row page plus the caller''s hasMore probe row.';
