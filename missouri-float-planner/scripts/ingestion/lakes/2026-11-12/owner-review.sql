-- Owner review of the remaining Table Rock and Truman launch candidates, 2026-11-12.
-- Target: Eddy production ilefwfpvphadsbptiaur. Applied once; see README.md here.
--
-- Every statement is pinned to exact ids and to the staging timestamp the 40
-- pending rows still carried (2026-11-09 23:01:50.648269+00), so a later human
-- edit makes the whole transaction fail rather than be overwritten. Row counts
-- are asserted all-or-none. One admin_activity_log record per changed row.
--
--   * 3 coordinate corrections supplied by the owner (Cricket Creek, Holiday Island, Berry Bend)
--   * 2 duplicate pairs merged (Shawnee Bend, Osage Bluff): sources combined, one row deleted each
--   * 35 launches approved with method trailer
--   * 3 Beaver-tailwater ramps (Beaver Lake Dam Site, Bertrand, Houseman) left pending:
--     the owner wants them as White River access points, which needs a Beaver tailwater
--     reach Eddy does not carry yet.
begin;

do $$
declare
  staged constant timestamptz := '2026-11-09 23:01:50.648269+00';
  now_ts constant timestamptz := now();
  batch constant text := 'owner-review-20261112';
  basis constant text := 'Owner spot-checked a sample on imagery, supplied corrected coordinates, and instructed approval of the remainder';
  n int;
  r record;
begin
  -- Precondition: the 40 pending rows are exactly as staged.
  select count(*) into n from public.lake_launches where not approved and updated_at = staged;
  if n <> 40 then raise exception 'expected 40 untouched pending launches, found %', n; end if;

  -- 1. Owner coordinate corrections.
  update public.lake_launches l set
    latitude = c.lat, longitude = c.lon,
    sources = l.sources || jsonb_build_array(jsonb_build_object(
      'provider', 'Eddy owner review', 'type', 'Coordinate correction',
      'reviewed_at', now_ts, 'previous', jsonb_build_object('latitude', l.latitude, 'longitude', l.longitude))),
    review_note = 'Owner corrected the pin to the ramp on 2026-11-12. Earlier note: ' || l.review_note,
    updated_at = now_ts
  from (values
    ('77253e55-f264-4729-bf59-41cc58775b8e'::uuid, 36.482388::float8, -93.300557::float8),  -- Cricket Creek
    ('d0228072-a31d-42d4-b03d-9a5afbac4c63'::uuid, 36.490067::float8, -93.760638::float8),  -- Holiday Island
    ('1222a0e3-c1d0-43ac-9764-2ec230713b7a'::uuid, 38.20004::float8,  -93.50789::float8)     -- Berry Bend
  ) as c(id, lat, lon)
  where l.id = c.id and l.updated_at = staged and not l.approved;
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'coordinate corrections: expected 3 rows, got %', n; end if;

  -- 2. Duplicates. Keep shawnee-bend (pin nearest the water) and take the Corps agency;
  --    keep osage-bluff (Corps). Both survivors carry the merged source's record.
  update public.lake_launches k set
    managing_agency = coalesce(k.managing_agency, d.managing_agency),
    sources = k.sources || d.sources,
    review_note = 'Owner confirmed ' || d.slug || ' as a duplicate of this place on 2026-11-12; its source is merged here. ' || k.review_note,
    updated_at = now_ts
  from public.lake_launches d
  where (k.id, d.id) in (
      ('da14e983-b862-4ba6-84c3-cbe43a081334'::uuid, 'f61778db-ddd0-4567-860b-3e63aac3097e'::uuid),  -- shawnee-bend <- shawnee-bend-2
      ('0e593b7b-e83c-4cd4-9794-59a8b0ffeb47'::uuid, '7390f670-9802-40f8-8457-5549aa301931'::uuid))  -- osage-bluff <- osage-bluff-marina
    and k.updated_at = staged and d.updated_at = staged and not k.approved and not d.approved;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'duplicate merge: expected 2 rows, got %', n; end if;

  for r in select * from public.lake_launches
           where id in ('f61778db-ddd0-4567-860b-3e63aac3097e', '7390f670-9802-40f8-8457-5549aa301931') loop
    insert into public.admin_activity_log (action, entity_type, entity_id, entity_name, details)
    values ('lake_launch_delete', 'lake_launch', r.id, r.name, jsonb_build_object(
      'batch', batch, 'reason', 'owner-confirmed duplicate', 'merged_into',
      case r.slug when 'shawnee-bend-2' then 'shawnee-bend' else 'osage-bluff' end,
      'before', to_jsonb(r), 'approval_authority', 'owner', 'applied_by', 'Claude Code'));
  end loop;
  delete from public.lake_launches
  where id in ('f61778db-ddd0-4567-860b-3e63aac3097e', '7390f670-9802-40f8-8457-5549aa301931')
    and updated_at = staged and not approved;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'duplicate delete: expected 2 rows, got %', n; end if;

  -- 3. Approve everything still pending except the three Beaver-tailwater ramps.
  update public.lake_launches set
    approved = true, approved_at = now_ts, launch_methods = array['trailer'],
    review_note = case slug
      when 'truman-state-park' then 'Owner approved 2026-11-12. Campground ramp: Missouri State Parks limits it to campers March-November; the public four-lane ramp is truman-state-park-marina. ' || review_note
      else 'Owner approved 2026-11-12. ' || review_note end,
    updated_at = now_ts
  where not approved
    and (updated_at = staged or updated_at = now_ts)
    and slug not in ('beaver-lake-dam-site-boat-ramp', 'bertrand-boat-ramp', 'houseman-boat-ramp');
  get diagnostics n = row_count;
  if n <> 35 then raise exception 'approval: expected 35 rows, got %', n; end if;

  insert into public.admin_activity_log (action, entity_type, entity_id, entity_name, details)
  select 'lake_launch_approve', 'lake_launch', id, name, jsonb_build_object(
    'batch', batch, 'basis', basis, 'approval_authority', 'owner', 'applied_by', 'Claude Code',
    'approved', true, 'approved_at', approved_at, 'launch_methods', launch_methods, 'lake_slug', lake_slug,
    'latitude', latitude, 'longitude', longitude, 'access_point_id', access_point_id)
  from public.lake_launches where approved_at = now_ts;

  -- Postcondition.
  select count(*) into n from public.lake_launches;
  if n <> 44 then raise exception 'expected 44 launches after the merge, found %', n; end if;
  select count(*) into n from public.lake_launches where approved;
  if n <> 41 then raise exception 'expected 41 approved launches, found %', n; end if;
end $$;

commit;
