-- Private account backup. No GPS traces. Tombstones prevent stale devices from
-- resurrecting deletions; their payload is erased immediately.
create table public.float_archive_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  consent_version uuid not null default gen_random_uuid()
);
create table public.float_archive (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  kind text not null check (kind in ('saved', 'completed')),
  payload jsonb,
  deleted boolean not null default false,
  contributing boolean not null default false,
  consent_version uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check ((deleted and payload is null and not contributing) or
    (not deleted and payload is not null and jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536)),
  check (not contributing or (kind = 'completed' and consent_version is not null))
);
create index float_archive_contributions on public.float_archive(updated_at desc, user_id, id)
  where contributing and not deleted;
alter table public.float_archive enable row level security;
alter table public.float_archive_preferences enable row level security;
revoke all on public.float_archive, public.float_archive_preferences from public, anon, authenticated;
grant select on public.float_archive, public.float_archive_preferences to authenticated;
grant all on public.float_archive, public.float_archive_preferences to service_role;
create policy own_float_archive on public.float_archive for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_permanent_user()));
create policy own_float_archive_preferences on public.float_archive_preferences for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_permanent_user()));

-- Only our authenticated API calls these service-only functions. Locking the
-- preference row orders consent withdrawal against uploads in other requests.
create function public.write_float_archive(p_user uuid, p_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare pref public.float_archive_preferences; item jsonb;
begin
  if not exists (select 1 from auth.users where id=p_user and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20 then
    raise exception 'Invalid batch';
  end if;
  insert into public.float_archive_preferences(user_id) values(p_user) on conflict do nothing;
  select * into pref from public.float_archive_preferences where user_id=p_user for update;
  for item in select value from jsonb_array_elements(p_rows) loop
    if (item->>'deleted')::boolean then
      insert into public.float_archive(user_id,id,kind,payload,deleted)
        values(p_user,item->>'id',item->>'kind',null,true)
      on conflict (user_id,id) do update set payload=null, deleted=true,
        contributing=false, consent_version=null, updated_at=now();
    else
      insert into public.float_archive(user_id,id,kind,payload,contributing,consent_version)
        values(p_user,item->>'id',item->>'kind',item->'payload',
          coalesce(item->>'kind'='completed' and pref.enabled and
            item->>'contributionVersion'=pref.consent_version::text,false),
          case when pref.enabled and item->>'contributionVersion'=pref.consent_version::text
            then pref.consent_version else null end)
      on conflict (user_id,id) do update set payload=excluded.payload, updated_at=now()
        where not float_archive.deleted and float_archive.kind='saved' and excluded.kind='saved';
    end if;
  end loop;
end $$;
create function public.set_float_contribution(p_user uuid, p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare pref public.float_archive_preferences;
begin
  if not exists (select 1 from auth.users where id=p_user and not is_anonymous) then
    raise exception 'Permanent account required';
  end if;
  insert into public.float_archive_preferences(user_id) values(p_user) on conflict do nothing;
  select * into pref from public.float_archive_preferences where user_id=p_user for update;
  if pref.enabled <> p_enabled or not p_enabled then
    update public.float_archive_preferences set enabled=p_enabled, consent_version=gen_random_uuid()
      where user_id=p_user returning * into pref;
  end if;
  if not p_enabled then
    update public.float_archive set contributing=false, consent_version=null where user_id=p_user;
  end if;
  return jsonb_build_object('enabled',pref.enabled,'version',pref.consent_version);
end $$;
revoke all on function public.write_float_archive(uuid,jsonb), public.set_float_contribution(uuid,boolean) from public, anon, authenticated;
grant execute on function public.write_float_archive(uuid,jsonb), public.set_float_contribution(uuid,boolean) to service_role;
