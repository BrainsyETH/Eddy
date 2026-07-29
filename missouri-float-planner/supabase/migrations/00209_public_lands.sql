-- 00209_public_lands.sql
-- Public land boundaries, from the USGS Protected Areas Database (PAD-US).
--
-- ── The question this answers ──────────────────────────────────────────────
-- "Can I camp on that gravel bar?" is the most common question a float raises
-- that Eddy has never been able to touch. The Ozarks answer is a patchwork:
-- Mark Twain National Forest, Ozark National Scenic Riverway, a dozen MDC
-- conservation areas and private ground between them, none of it visible from
-- the water and none of it on any map in this product.
--
-- ── What a polygon here does NOT mean ──────────────────────────────────────
-- It is OWNERSHIP, not permission. This is the single most important thing
-- about this table and every consumer has to carry it:
--
--   * Public land does not imply a legal right to be on the water beside it,
--     nor to portage across the bank, nor to camp.
--   * `public_access` is the agency's own classification, and 'RA' (restricted)
--     is extremely common on exactly the conservation areas people assume are
--     open. It is recorded so a consumer can say so, not so it can be ignored.
--   * The boundaries are the agency's, at the agency's precision. They are not
--     a survey and must never be drawn as if a paddler could use one to decide
--     where to step.
--
-- The map layer's own description says this out loud; see MAP_LAYERS.
--
-- ── Why a table and not a third-party tile service ─────────────────────────
-- The USGS ArcGIS tile services either 404 or answer "Token Required", and the
-- ones that work are Forest-Service-only — a quarter of the picture here, with
-- no MDC conservation areas and no NPS. The queryable PAD-US feature layer has
-- all of it, so the data is fetched once by scripts/ingestion/import-padus.ts
-- and served from here. That also makes it the only form that could ever go
-- into an offline pack, which a third-party tile URL never could.
--
-- ── Geometry is stored whole and served simplified ─────────────────────────
-- Measured on one Current River corridor: 256 polygons, 89,444 vertices, 1.9 MB
-- of GeoJSON. Mark Twain National Forest alone is 59,080 points. Nothing sends
-- that to a phone. The full geometry lives here because it is cheap at rest and
-- because throwing away precision at ingest cannot be undone; public_lands_in_bbox
-- below simplifies per request, at a tolerance the caller picks from its zoom.

create table if not exists public.public_lands (
    id uuid primary key default gen_random_uuid(),
    /**
     * PAD-US's GlobalID — the per-feature GUID, and the natural key for
     * re-import.
     *
     * NOT Source_PAID, which is the obvious-looking choice and is wrong: it
     * identifies the source DATASET, not the parcel. Measured on one Current
     * River corridor, 256 features carried 18 distinct Source_PAID values —
     * 184 of them the single string 'OZAR' — plus 48 nulls. Keying on it would
     * have collapsed the corridor to 60 rows and silently dropped three
     * quarters of the boundaries, with a successful-looking import.
     *
     * Not OBJECTID either: it is an ArcGIS row number and is reassigned when
     * the layer is republished, so every re-import would insert everything
     * again. GlobalID is stable within a published version; across a major
     * PAD-US version it may not be, which is a re-import to plan rather than a
     * reason to prefer either of the other two.
     */
    padus_id text not null unique,
    unit_name text not null,
    -- The agency's own strings, kept verbatim rather than mapped to an Eddy
    -- vocabulary. 'USFS', 'NPS', 'UNK' — and UNK is common and honest: PAD-US
    -- genuinely does not know the manager for many state conservation areas.
    manager_name text,
    manager_type text,
    -- 'NF', 'WSR', 'SCA'… the designation, which is what actually tells a
    -- reader whether they are looking at a national forest or a state
    -- conservation area.
    designation text,
    /**
     * The agency's access classification, verbatim.
     *
     * 'OA' open, 'RA' restricted, 'XA' closed, 'UK' unknown. NOT collapsed into
     * a boolean: "restricted" covers permit-only, daylight-only, seasonal and
     * hunting-only, and flattening those into "closed" or "open" would be
     * inventing a fact about somewhere a person might drive to.
     */
    public_access text,
    gis_acres numeric,
    state_code text,
    -- MultiPolygon rather than Polygon: a national forest is not contiguous and
    -- neither are most conservation areas.
    geometry geometry(MultiPolygon, 4326) not null,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

-- The only index that matters: every read is a viewport query.
create index if not exists idx_public_lands_geometry
    on public.public_lands using gist (geometry);

create index if not exists idx_public_lands_access
    on public.public_lands (public_access);

alter table public.public_lands enable row level security;

-- Public read, service-role write. Same posture as gauge_latest (00196): this
-- is reference data, it is published by a federal agency, and nothing about it
-- is per-user.
drop policy if exists public_lands_select_all on public.public_lands;
create policy public_lands_select_all on public.public_lands
    for select using (true);

comment on table public.public_lands is
    'USGS PAD-US protected-area boundaries. OWNERSHIP, NOT PERMISSION — see the migration header before building anything on this.';
comment on column public.public_lands.public_access is
    'PAD-US Pub_Access verbatim: OA open, RA restricted, XA closed, UK unknown. Never collapse to a boolean.';

-- ── public_lands_in_bbox: the map's viewport query ──────────────────────────
--
-- An RPC for the same reason gauges_in_bbox is one: PostgREST cannot express
-- the `&&` operator that uses the GiST index above, and it cannot call
-- ST_SimplifyPreserveTopology or ST_AsGeoJSON.
--
-- SIMPLIFYPRESERVETOPOLOGY, not ST_Simplify. Plain simplification can collapse
-- a narrow strip — a river corridor parcel is exactly that shape — into an
-- invalid ring or nothing at all, and a boundary that vanishes at one zoom and
-- reappears at another reads as a bug about land ownership. The topological
-- variant is slower and cannot produce that.
--
-- The tolerance is the CALLER's, because only the caller knows its zoom, and a
-- tolerance that looks right over a whole state erases a 40-acre access parcel.
-- Clamped here anyway so a bad caller cannot ask for a full-precision statewide
-- query and pull megabytes through the API.
create or replace function public.public_lands_in_bbox(
    p_west double precision,
    p_south double precision,
    p_east double precision,
    p_north double precision,
    p_tolerance double precision default 0.0005,
    p_limit integer default 400
)
returns table (
    id uuid,
    unit_name text,
    manager_name text,
    manager_type text,
    designation text,
    public_access text,
    gis_acres numeric,
    geojson text,
    total bigint
)
language sql
stable
security invoker
-- public, extensions: PostGIS lives in `extensions` on this project and `&&`
-- cannot resolve under search_path = ''. Same ruling as 00196.
set search_path = public, extensions
as $$
    with box as (
        select st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as g
    ),
    hits as (
        select
            pl.id,
            pl.unit_name,
            pl.manager_name,
            pl.manager_type,
            pl.designation,
            pl.public_access,
            pl.gis_acres,
            pl.geometry,
            count(*) over () as total
        from public.public_lands pl, box
        where pl.geometry && box.g
        -- Largest first, so when the cap bites it drops the small parcels and
        -- never the national forest somebody is actually looking at.
        order by pl.gis_acres desc nulls last
        limit greatest(1, least(p_limit, 1000))
    )
    select
        hits.id,
        hits.unit_name,
        hits.manager_name,
        hits.manager_type,
        hits.designation,
        hits.public_access,
        hits.gis_acres,
        -- CLIPPED to the viewport before simplifying. Mark Twain National
        -- Forest is 59,080 points statewide and a phone looking at eight miles
        -- of river needs the handful of them that are on screen.
        st_asgeojson(
            st_simplifypreservetopology(
                st_intersection(hits.geometry, box.g),
                greatest(0.00005, least(p_tolerance, 0.05))
            )
        ) as geojson,
        hits.total
    from hits, box
    -- An intersection can come back empty when a polygon only touches the box
    -- edge; an empty geometry is not a boundary and must not be drawn.
    where not st_isempty(st_intersection(hits.geometry, box.g));
$$;

grant execute on function public.public_lands_in_bbox(
    double precision, double precision, double precision, double precision,
    double precision, integer
) to anon, authenticated, service_role;
