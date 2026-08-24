-- The import records where each field came from, in the same transaction.
--
-- APPLIED to production 2026-08-24 as 20260824115114.
--
-- 20260824030735 made the import atomic. This adds field-level provenance to
-- the same call, deliberately inside the same transaction: a source row written
-- separately could survive a rolled-back write and go on claiming a value the
-- service never took.
--
-- The plan gains one optional key per operation:
--
--   "field_sources": [{ "field": "phone",
--                       "source": "https://operator.example/contact",
--                       "checked_at": "2026-08-24" }, ...]
--
-- Fields the CSV does not attribute individually inherit the row's
-- verified_source, so every column written gets a source rather than only the
-- interesting ones. Re-importing updates a field's source in place.

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

    -- The column list is built from the payload's own keys on both paths. On
    -- INSERT that is what lets id, created_at and updated_at take their
    -- defaults: selecting the whole populated record instead would pass them
    -- explicitly as NULL, and an explicit NULL defeats a column default.
    -- updated_at is set explicitly below, so a payload carrying it would put
    -- the column in the SET list twice and the statement would not parse.
    select string_agg(quote_ident(k), ', ')
      into v_cols
      from jsonb_object_keys(v_payload) as k
     where k not in ('updated_at', 'id');

    if v_op->>'action' = 'insert' then
      if v_cols is null then
        raise exception 'import_services: insert for % has an empty payload', v_slug;
      end if;
      -- jsonb_populate_record maps the payload onto the table's own row type,
      -- so a value of the wrong type raises here rather than being coerced.
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

      -- Exactly the claimed columns and no others, which is what keeps "an
      -- absent cell makes no claim" true on this side of the wire too.
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

    -- ── river links ────────────────────────────────────────────────────────
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
      -- Count what was actually inserted, not what was offered: a link that
      -- already existed is a no-op and reporting it as added would overstate.
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
      update public.service_rivers set is_primary = false where service_id = v_id;
      update public.service_rivers set is_primary = true
       where service_id = v_id and river_id = v_river_id;
      v_flips := v_flips + 1;
    end if;

    -- Field-level provenance, written in the same transaction as the field it
    -- describes. A source recorded separately could survive a rolled-back write
    -- and claim a value the row never took.
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
  'Applies an already-decided services import plan in one transaction, including the field-level provenance for every column it writes. Deliberately makes no merge decisions: presence-aware merging, array union and is_primary protection live in scripts/import-services-csv.ts, which is tested and which generates the diff a human reviews before this is called. A plpgsql body is atomic, so a failure part-way rolls the whole plan back rather than leaving some rows written and some not — and a field source cannot outlive the write it describes.';

revoke execute on function public.import_services(jsonb) from public, anon, authenticated;
grant execute on function public.import_services(jsonb) to service_role;
