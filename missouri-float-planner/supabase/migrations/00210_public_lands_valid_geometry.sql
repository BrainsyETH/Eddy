-- 00210_public_lands_valid_geometry.sql
-- Make public_lands geometry valid by construction.
--
-- ── The bug this fixes ─────────────────────────────────────────────────────
-- 85 of the first 1,760 PAD-US parcels imported are not OGC-valid — self-
-- intersecting rings, mostly, which is ordinary for agency boundary data
-- digitised from many sources over decades. PostGIS stores them happily and
-- GEOS refuses to operate on them:
--
--   ERROR: lwgeom_intersection_prec: GEOS Error: TopologyException:
--          side location conflict at -94.38936 34.68973
--
-- public_lands_in_bbox calls ST_Intersection and ST_SimplifyPreserveTopology on
-- every row it returns, so a single invalid parcel anywhere in a viewport made
-- the WHOLE query throw. Not a degraded layer — a 500, for every user looking
-- anywhere near it. Found by pointing the RPC at the envelope of the largest
-- invalid parcel before the layer was built on top of it.
--
-- ── Why a trigger and not a fix in the importer ────────────────────────────
-- The importer writes GeoJSON through PostgREST and cannot call ST_MakeValid on
-- the way past. It could be taught to, and that would leave the invariant
-- resting on one client remembering — while any future importer, backfill or
-- manual insert reintroduces the same 500. The column should be incapable of
-- holding geometry the read path cannot handle.
--
-- ── Why the CollectionExtract dance ────────────────────────────────────────
-- ST_MakeValid repairs a bowtie by splitting it, and the result of repairing a
-- MultiPolygon can be a GeometryCollection containing stray lines and points
-- where rings degenerated. The column is typed MultiPolygon and would reject
-- that outright, so: extract only the polygonal parts (type 3), then re-wrap as
-- MULTIPOLYGON. Dropping the stray lines is correct — a boundary that collapsed
-- to a line has no area and was never a parcel.

create or replace function public.public_lands_normalize_geometry()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
    if new.geometry is not null and not st_isvalid(new.geometry) then
        new.geometry := st_multi(
            st_collectionextract(st_makevalid(new.geometry), 3)
        );
    end if;
    return new;
end;
$$;

drop trigger if exists public_lands_normalize_geometry on public.public_lands;
create trigger public_lands_normalize_geometry
    before insert or update of geometry on public.public_lands
    for each row
    execute function public.public_lands_normalize_geometry();

-- The 85 already stored. `where not st_isvalid` rather than a blanket rewrite:
-- ST_MakeValid on an already-valid polygon is a no-op that still rewrites every
-- row and its index entry, for nothing.
update public.public_lands
   set geometry = st_multi(st_collectionextract(st_makevalid(geometry), 3))
 where not st_isvalid(geometry);

-- A repair can legitimately empty a parcel whose every ring was degenerate.
-- Such a row is not a boundary and must not sit in a table the map reads.
delete from public.public_lands where st_isempty(geometry);

comment on function public.public_lands_normalize_geometry() is
    'Repairs invalid PAD-US polygons on write. public_lands_in_bbox calls ST_Intersection, which throws on invalid input — see migration 00210.';
