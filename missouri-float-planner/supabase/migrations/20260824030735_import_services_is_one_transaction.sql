-- The services import commits as a whole or not at all.
--
-- APPLIED to production 2026-08-24 as 20260824030735. The filename carries the
-- version production recorded, not the one it was drafted under.
--
-- Proven, not assumed: a two-operation plan whose second operation referenced a
-- slug that does not exist raised, and the first operation's insert did not
-- survive it — 0 probe rows, table unchanged at 197.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
--
-- import-services-csv.ts validates every row before it writes any, which fixed
-- the failure where a bad row at line 40 landed after 39 others were already
-- in. It did not make the WRITE atomic. Past validation the script still looped
-- over rows issuing separate PostgREST calls against nearby_services and
-- service_rivers, so a dropped connection, a statement timeout or a constraint
-- violation halfway through left some rows updated, some not, and the river
-- links of one service applied without the row they belong to.
--
-- The mitigation was real but partial: updates are additive, the script reads
-- every row back and names what did not land, and re-running is safe. That
-- makes a partial write recoverable. It does not make it not happen, and a
-- reviewer reading "nothing is written until every row validates" could
-- reasonably hear a guarantee the code did not provide.
--
-- ── WHY THE PLANNING IS STILL IN TYPESCRIPT ────────────────────────────────
--
-- This function deliberately does NOT decide anything. Presence-aware merging,
-- set-union on arrays, is_primary protection and the whole insert-vs-update
-- question stay in import-services-csv.ts, where 36 tests cover them and where
-- the diff a human reviews is generated. Reimplementing that here would create
-- a second set of merge semantics to keep in step, which is the class of bug
-- this branch has spent its time removing.
--
-- What arrives is a plan that has already been decided and shown to a person:
-- a jsonb array of operations. All this does is apply them inside one
-- transaction, because a plpgsql function body is atomic — if any statement
-- raises, every statement in the call is rolled back.
--
-- ── THE PLAN SHAPE ─────────────────────────────────────────────────────────
--
--   [{ "action":        "insert" | "update",
--      "slug":          "bass-river-resort",
--      "payload":       { column: value, ... },   -- only claimed columns
--      "link_adds":     ["courtois", "huzzah"],
--      "link_removes":  ["meramec"],              -- --overwrite only
--      "primary_river": "courtois" | null,        -- --overwrite only
--      "insert_primary":"courtois" | null }]      -- is_primary for a new row
--
-- Returns a tally so the caller can assert what happened:
--   { "inserted": n, "updated": n, "links_added": n, "links_removed": n,
--     "primary_flips": n }

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
  v_inserted      int := 0;
  v_updated       int := 0;
  v_links_added   int := 0;
  v_links_removed int := 0;
  v_flips         int := 0;
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
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'links_added', v_links_added, 'links_removed', v_links_removed,
    'primary_flips', v_flips);
end;
$$;

comment on function public.import_services(jsonb) is
  'Applies an already-decided services import plan in one transaction. Deliberately makes no merge decisions: presence-aware merging, array union and is_primary protection live in scripts/import-services-csv.ts, which is tested and which generates the diff a human reviews before this is called. A plpgsql body is atomic, so a failure part-way rolls the whole plan back rather than leaving some rows written and some not.';

revoke execute on function public.import_services(jsonb) from public, anon, authenticated;
grant execute on function public.import_services(jsonb) to service_role;
