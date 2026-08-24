-- The river-facts import commits as a whole or not at all.
--
-- APPLIED to production 2026-08-24 as 20260824185611.
--
-- 20260824030735 made the services import atomic and then this second importer
-- was written the old way: a loop of one .update() per link, exiting on the
-- first error. A failure part-way — a dropped connection, a constraint, a
-- permission — leaves the earlier links decorated and the rest not, which is
-- the failure validate-before-write does not cover.
--
-- Same shape as import_services deliberately, so both importers behave the
-- same way and there is one pattern to understand: the script decides
-- everything and prints a diff a human reads, then hands the finished plan
-- over in a single call. This function makes no merge decisions.
--
--   [{ "id": "<service_rivers.id>",
--      "patch": { "verified_source": "...", "checked_at": "2026-08-24",
--                 "services_offered": [...], "routes": [...],
--                 "seasonal_notes": "..." } }, ...]
--
-- The column list is built from the patch keys, so a column the plan does not
-- mention keeps its stored value rather than being nulled — the same
-- presence-aware rule the CSV importer applies.
--
-- Atomicity proved after applying, not assumed: a two-item plan whose second
-- item named a nonexistent link raised, and the first item's write — which
-- would have succeeded on its own — did not survive. 0 probe rows left.

create or replace function public.apply_service_river_facts(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_op      jsonb;
  v_patch   jsonb;
  v_id      uuid;
  v_cols    text;
  v_updated int := 0;
begin
  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'apply_service_river_facts: plan must be a json array, got %',
      jsonb_typeof(p_plan);
  end if;

  for v_op in select * from jsonb_array_elements(p_plan) loop
    v_id    := nullif(v_op->>'id', '')::uuid;
    v_patch := coalesce(v_op->'patch', '{}'::jsonb);

    if v_id is null then
      raise exception 'apply_service_river_facts: an operation has no link id: %', v_op;
    end if;

    -- Decorating a link, never creating one. A missing link means the CSV
    -- claims a business works water it is not recorded as serving, and that is
    -- the services import's decision to make, not this one's.
    if not exists (select 1 from public.service_rivers where id = v_id) then
      raise exception 'apply_service_river_facts: no service_rivers row with id %', v_id;
    end if;

    select string_agg(quote_ident(k), ', ')
      into v_cols
      from jsonb_object_keys(v_patch) as k
     where k not in ('id', 'service_id', 'river_id', 'is_primary');

    if v_cols is null then
      raise exception 'apply_service_river_facts: link % has an empty patch', v_id;
    end if;

    execute format(
      'update public.service_rivers sr set (%s) = '
      || '(select %s from jsonb_populate_record(sr::public.service_rivers, $2)) '
      || 'where sr.id = $1',
      v_cols, v_cols)
    using v_id, v_patch;
    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object('updated', v_updated);
end;
$$;

comment on function public.apply_service_river_facts(jsonb) is
  'Applies an already-decided river-facts plan in one transaction. Decorates existing service_rivers links only — it never creates one, because linking a business to water is the services import''s decision. Builds its column list from the patch keys so an unmentioned column keeps its stored value. Validation, offering resolution and route parsing live in scripts/import-service-river-facts.ts, which is tested and which prints the diff a human reviews before this is called.';

revoke execute on function public.apply_service_river_facts(jsonb) from public, anon, authenticated;
grant execute on function public.apply_service_river_facts(jsonb) to service_role;
