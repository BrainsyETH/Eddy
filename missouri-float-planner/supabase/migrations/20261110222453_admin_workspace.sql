-- Named administrator access is separate from public profiles/user metadata.
create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete restrict,
  name text not null check(length(name) between 1 and 100),
  email text not null,
  role text not null check(role in ('owner','editor','moderator')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.admin_memberships enable row level security;
revoke all on public.admin_memberships from anon, authenticated;
grant all on public.admin_memberships to service_role;

-- Serialize changes so concurrent demotions cannot remove the final owner.
create function public.set_admin_membership(p_email text,p_name text,p_role text,p_active boolean,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; current_row public.admin_memberships; result public.admin_memberships;
begin
  perform pg_advisory_xact_lock(hashtext('eddy-admin-memberships'));
  if p_role not in ('owner','editor','moderator') or length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid administrator details'; end if;
  select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null and deleted_at is null;
  if target is null then raise exception 'Use the email of an existing, verified Eddy account'; end if;
  select * into current_row from public.admin_memberships where user_id=target;
  if current_row.user_id is not null and (p_expected is null or current_row.updated_at::text::timestamptz <> p_expected::timestamptz) then raise exception 'Access changed. Reload before saving'; end if;
  if current_row.role='owner' and current_row.active and (p_role<>'owner' or not p_active) and not exists(select 1 from public.admin_memberships where user_id<>target and role='owner' and active) then raise exception 'Keep at least one active owner'; end if;
  if not exists(select 1 from public.admin_memberships where role='owner' and active) and (p_role<>'owner' or not p_active) then raise exception 'Add an active owner first'; end if;
  insert into public.admin_memberships(user_id,name,email,role,active) values(target,trim(p_name),lower(trim(p_email)),p_role,p_active)
    on conflict(user_id) do update set name=excluded.name,email=excluded.email,role=excluded.role,active=excluded.active,updated_at=clock_timestamp() returning * into result;
  return jsonb_build_object('before',to_jsonb(current_row),'after',to_jsonb(result));
end $$;
revoke all on function public.set_admin_membership(text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.set_admin_membership(text,text,text,boolean,text) to service_role;

create table public.admin_jobs (
  id uuid primary key,
  kind text not null,
  state text not null check(state in ('queued','running','completed','partial','failed','unknown')),
  actor_id uuid,
  input jsonb not null default '{}',
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_jobs enable row level security;
revoke all on public.admin_jobs from anon,authenticated;
grant all on public.admin_jobs to service_role;
create index admin_jobs_created on public.admin_jobs(created_at desc);

create table public.admin_incidents (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  recovered_at timestamptz,
  occurrences integer not null default 1,
  summary text not null
);
alter table public.admin_incidents enable row level security;
revoke all on public.admin_incidents from anon,authenticated;
grant all on public.admin_incidents to service_role;
create unique index admin_incidents_open_job on public.admin_incidents(job) where recovered_at is null;
create function public.record_admin_incident(p_job text,p_ok boolean,p_summary text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('eddy-incident:'||p_job));
  if p_ok then update public.admin_incidents set recovered_at=now(),last_seen_at=now() where job=p_job and recovered_at is null;
  else insert into public.admin_incidents(job,summary) values(p_job,left(p_summary,500)) on conflict(job) where recovered_at is null do update set last_seen_at=now(),occurrences=public.admin_incidents.occurrences+1,summary=excluded.summary;
  end if;
end $$;
revoke all on function public.record_admin_incident(text,boolean,text) from public,anon,authenticated;
grant execute on function public.record_admin_incident(text,boolean,text) to service_role;

-- Search the full moderation queue before pagination, including related names.
create function public.admin_report_matches(p_search text default '',p_status text default 'all',p_type text default 'all')
returns table(id uuid,status text,created_at timestamptz) language sql stable security invoker set search_path='' as $$
 select c.id,c.status,c.created_at from public.community_reports c
 left join public.rivers r on r.id=c.river_id
 left join public.river_hazards h on h.id=c.hazard_id
 where (p_status='all' or c.status=p_status) and (p_type='all' or c.type=p_type)
 and (p_search='' or position(lower(p_search) in lower(coalesce(c.description,'')||' '||coalesce(r.name,'')||' '||coalesce(h.name,'')))>0)
$$;
revoke all on function public.admin_report_matches(text,text,text) from public,anon,authenticated;
grant execute on function public.admin_report_matches(text,text,text) to service_role;
