-- A service that is linked to any river has exactly one primary river.
--
-- APPLIED to production 2026-08-24 as 20260824124650.
--
-- The primary-river flip was two statements: clear every is_primary for the
-- service, then set the one being promoted. If the service was not already
-- linked to the river being promoted — which happens whenever a re-import
-- re-points a primary at a river whose link add was skipped as already
-- present, or was never in the plan at all — the clear ran, the set matched
-- nothing, and the service was left with ZERO primary rivers and no error.
-- The river pages read is_primary to decide which river a business belongs
-- to, so the row simply stopped appearing anywhere.
--
-- Two guards, both inside the existing transaction:
--
--   1. A precondition: refuse to promote a river the service is not linked to,
--      naming both, before anything is cleared.
--   2. A postcondition after every operation: if the service has any river
--      links at all it must end with exactly one primary. This catches the
--      general shape, not just the path above.
--
-- Reproduced before and after: a plan promoting riverview-ranch to
-- spring-river-mo without the link left `primaries before=1 after=0` and
-- returned success; it now raises
-- `import_services: riverview-ranch is not linked to spring-river-mo`.

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
      insert into public.service_rivers (service_id, river_id, is_primary)
      values (v_id, v_river_id, v_river_slug = coalesce(v_op->>'insert_primary', ''))
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
  'Applies an already-decided services import plan in one transaction, including the field-level provenance for every column it writes, and asserts that a service with river links ends with exactly one primary river. Deliberately makes no merge decisions: presence-aware merging, array union and is_primary protection live in scripts/import-services-csv.ts, which is tested and which generates the diff a human reviews before this is called. A plpgsql body is atomic, so a failure part-way rolls the whole plan back rather than leaving some rows written and some not — and a field source cannot outlive the write it describes.';

revoke execute on function public.import_services(jsonb) from public, anon, authenticated;
grant execute on function public.import_services(jsonb) to service_role;
