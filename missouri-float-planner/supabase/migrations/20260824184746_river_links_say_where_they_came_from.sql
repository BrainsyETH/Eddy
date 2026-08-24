-- A river link records where it came from.
--
-- APPLIED to production 2026-08-24 as 20260824184746.
--
-- 20260824121253 gave service_rivers verified_source and checked_at, and then
-- only the river-facts importer ever filled them. import_services inserts a
-- link as (service_id, river_id, is_primary) and nothing else, so every link
-- the main importer has ever created claims a business serves a river with no
-- record of what said so. 221 of 230 production links were in that state.
--
-- "This business serves the Niangua" is a claim, and the page the CSV row
-- cited is what established it — the same source that already attributes every
-- column the row writes. So the plan carries link_source and link_checked_at,
-- and a newly inserted link takes them. An EXISTING link is never touched:
-- its provenance may name a river page this row never read.
--
-- Proved with a rollback probe: a new link took the plan's source and date
-- while an existing link kept a sentinel source and a 2020 date untouched;
-- 0 probe rows survived.
--
-- The backfill is deliberately partial. 120 of the 221 links belong to a
-- service with a real, dated source, and those are filled from it. 86 belong
-- to a service whose source is a placeholder — csv_import and friends — and
-- stamping that on a link would manufacture provenance rather than record it,
-- which is the exact failure service_field_sources has a CHECK against. Those
-- stay null and stay honest. 129 links now carry a source; 101 do not.

create or replace function public.import_services(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_op            jsonb;
  v_payload       jsonb;
  v_slug          text;
  v_id            uuid;
  v_cols          text;
  v_river_id      uuid;
  v_river_slug    text;
  v_fs            jsonb;
  v_primaries     int;
  v_link_source   text;
  v_link_checked  date;
  v_inserted      int := 0;
  v_updated       int := 0;
  v_links_added   int := 0;
  v_links_removed int := 0;
  v_flips         int := 0;
  v_sources       int := 0;
  v_n             int := 0;
begin
  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'import_services: plan must be a json array, got %', jsonb_typeof(p_plan);
  end if;

  for v_op in select * from jsonb_array_elements(p_plan) loop
    v_slug    := v_op->>'slug';
    v_payload := coalesce(v_op->'payload', '{}'::jsonb);

    if v_slug is null or v_slug = '' then
      raise exception 'import_services: an operation has no slug: %', v_op;
    end if;

    v_link_source  := nullif(v_op->>'link_source', '');
    v_link_checked := nullif(v_op->>'link_checked_at', '')::date;

    -- The column list comes from the payload keys, so a column the plan does
    -- not mention keeps its default on insert and its stored value on update.
    select string_agg(quote_ident(k), ', ')
      into v_cols
      from jsonb_object_keys(v_payload) as k
     where k not in ('updated_at', 'id');

    if v_op->>'action' = 'insert' then
      if v_cols is null then
        raise exception 'import_services: insert for % has an empty payload', v_slug;
      end if;
      execute format(
        'insert into public.nearby_services (%s) '
        || 'select %s from jsonb_populate_record(null::public.nearby_services, $1) '
        || 'returning id',
        v_cols, v_cols)
      using v_payload into v_id;
      v_inserted := v_inserted + 1;

    elsif v_op->>'action' = 'update' then
      select id into v_id from public.nearby_services where slug = v_slug;
      if v_id is null then
        raise exception 'import_services: no service with slug % to update', v_slug;
      end if;

      if v_cols is not null then
        execute format(
          'update public.nearby_services ns set (%s, updated_at) = '
          || '(select %s, now() from jsonb_populate_record(ns::public.nearby_services, $2)) '
          || 'where ns.id = $1',
          v_cols, v_cols)
        using v_id, v_payload;
        v_updated := v_updated + 1;
      end if;

    else
      raise exception 'import_services: unknown action % for %', v_op->>'action', v_slug;
    end if;

    for v_river_slug in
      select jsonb_array_elements_text(coalesce(v_op->'link_adds', '[]'::jsonb))
    loop
      select id into v_river_id from public.rivers where slug = v_river_slug;
      if v_river_id is null then
        raise exception 'import_services: unknown river slug % for %', v_river_slug, v_slug;
      end if;
      -- A NEW link carries the source that said this business serves this
      -- river. An existing link is left alone: its provenance may name a river
      -- page this row never read, and do-nothing must stay do-nothing.
      insert into public.service_rivers
        (service_id, river_id, is_primary, verified_source, checked_at)
      values (v_id, v_river_id, v_river_slug = coalesce(v_op->>'insert_primary', ''),
              v_link_source, v_link_checked)
      on conflict (service_id, river_id) do nothing;
      get diagnostics v_n = row_count;
      v_links_added := v_links_added + v_n;
    end loop;

    for v_river_slug in
      select jsonb_array_elements_text(coalesce(v_op->'link_removes', '[]'::jsonb))
    loop
      select id into v_river_id from public.rivers where slug = v_river_slug;
      if v_river_id is null then
        raise exception 'import_services: unknown river slug % for %', v_river_slug, v_slug;
      end if;
      delete from public.service_rivers
       where service_id = v_id and river_id = v_river_id;
      get diagnostics v_n = row_count;
      v_links_removed := v_links_removed + v_n;
    end loop;

    if v_op->>'primary_river' is not null then
      select id into v_river_id from public.rivers where slug = v_op->>'primary_river';
      if v_river_id is null then
        raise exception 'import_services: unknown primary river % for %',
          v_op->>'primary_river', v_slug;
      end if;
      -- The service must ALREADY be linked to the river being promoted. Without
      -- this the clear-all below runs, the set-one matches nothing, and the
      -- service is left with zero primary rivers and no error raised.
      if not exists (
        select 1 from public.service_rivers
         where service_id = v_id and river_id = v_river_id
      ) then
        raise exception 'import_services: % is not linked to % — cannot make it primary',
          v_slug, v_op->>'primary_river';
      end if;
      update public.service_rivers set is_primary = false where service_id = v_id;
      update public.service_rivers set is_primary = true
       where service_id = v_id and river_id = v_river_id;
      v_flips := v_flips + 1;
    end if;

    -- Whatever this operation did to the links, the invariant has to hold when
    -- it is done: a service with any river links has exactly one primary. The
    -- flip above is two statements, and a linked service that somehow ends with
    -- none or several is a directory that cannot say which river a business is
    -- mainly on.
    select count(*) into v_primaries
      from public.service_rivers where service_id = v_id and is_primary;
    if v_primaries <> 1 and exists (
      select 1 from public.service_rivers where service_id = v_id
    ) then
      raise exception 'import_services: % would be left with % primary river(s), expected exactly 1',
        v_slug, v_primaries;
    end if;

    for v_fs in
      select * from jsonb_array_elements(coalesce(v_op->'field_sources', '[]'::jsonb))
    loop
      insert into public.service_field_sources (service_id, field, source, checked_at)
      values (v_id, v_fs->>'field', v_fs->>'source', (v_fs->>'checked_at')::date)
      on conflict (service_id, field) do update
        set source = excluded.source,
            checked_at = excluded.checked_at,
            updated_at = now();
      v_sources := v_sources + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'links_added', v_links_added, 'links_removed', v_links_removed,
    'primary_flips', v_flips, 'field_sources', v_sources);
end;
$$;

comment on function public.import_services(jsonb) is
  'Applies an already-decided services import plan in one transaction: the row, its river links with their provenance, and the field-level source for every column it writes. Asserts that a service with river links ends with exactly one primary river. Deliberately makes no merge decisions: presence-aware merging, array union and is_primary protection live in scripts/import-services-csv.ts, which is tested and which generates the diff a human reviews before this is called. A plpgsql body is atomic, so a failure part-way rolls the whole plan back rather than leaving some rows written and some not — and a source cannot outlive the write it describes.';

revoke execute on function public.import_services(jsonb) from public, anon, authenticated;
grant execute on function public.import_services(jsonb) to service_role;

-- Backfill, only where the owning service cites something citable.
UPDATE public.service_rivers sr
   SET verified_source = ns.verified_source,
       checked_at      = ns.last_verified_at::date
  FROM public.nearby_services ns
 WHERE ns.id = sr.service_id
   AND sr.verified_source IS NULL
   AND ns.last_verified_at IS NOT NULL
   AND ns.verified_source IS NOT NULL
   AND lower(btrim(ns.verified_source)) NOT IN
       ('csv_import', 'unknown', 'n/a', 'knowledge_base', '');

DO $$
DECLARE
  v_placeholders int;
BEGIN
  SELECT count(*) INTO v_placeholders
    FROM public.service_rivers sr
   WHERE sr.verified_source IS NOT NULL
     AND lower(btrim(sr.verified_source)) IN
         ('csv_import', 'unknown', 'n/a', 'knowledge_base', '');
  IF v_placeholders > 0 THEN
    RAISE EXCEPTION '% link(s) were given a placeholder source', v_placeholders;
  END IF;
END $$;
