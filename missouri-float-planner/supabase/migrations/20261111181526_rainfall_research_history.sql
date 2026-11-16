-- Private research only. No app reads, public rainfall amounts or predictions.
create table public.rainfall_research_basins (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  gauge_id uuid not null references public.gauge_stations(id),
  usgs_site_id text not null check (usgs_site_id ~ '^[0-9]{8,15}$'),
  geometry jsonb not null,
  forecast_points jsonb not null check (jsonb_array_length(forecast_points) between 1 and 9),
  provenance jsonb not null,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','reviewed','rejected')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index rainfall_research_one_active_basin on public.rainfall_research_basins(gauge_id) where enabled;

create table public.rainfall_research_captures (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('basins','mrms','nws','gauges')),
  source_key text not null,
  valid_start timestamptz,
  valid_end timestamptz,
  source_updated_at timestamptz,
  basin_set_hash text not null check (basin_set_hash ~ '^[a-f0-9]{64}$'),
  object_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_count integer not null check (byte_count between 1 and 16777216),
  metadata jsonb not null,
  fetched_at timestamptz not null default now(),
  check (valid_end is null or valid_start is null or valid_end > valid_start)
);
create index rainfall_research_capture_time on public.rainfall_research_captures(kind, valid_end desc);
create index rainfall_research_capture_basin_set on public.rainfall_research_captures(basin_set_hash);

create table public.rainfall_research_grid_cache (
  point_key text primary key,
  grid_url text not null check (grid_url ~ '^https://api[.]weather[.]gov/gridpoints/[A-Z]{3}/[0-9]+,[0-9]+$'),
  resolved_at timestamptz not null default now()
);

alter table public.rainfall_research_basins enable row level security;
alter table public.rainfall_research_captures enable row level security;
alter table public.rainfall_research_grid_cache enable row level security;
revoke all on public.rainfall_research_basins, public.rainfall_research_captures, public.rainfall_research_grid_cache from public, anon, authenticated, service_role;
grant select, insert, update on public.rainfall_research_basins, public.rainfall_research_grid_cache to service_role;
-- Capture rows are immutable. Retries use ON CONFLICT DO NOTHING.
grant select, insert on public.rainfall_research_captures to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rainfall-research', 'rainfall-research', false, 16777216, array['application/gzip'])
on conflict (id) do nothing;

do $$ begin
  if exists (select 1 from storage.buckets where id = 'rainfall-research' and public) then
    raise exception 'rainfall-research bucket must be private';
  end if;
end $$;

comment on table public.rainfall_research_captures is
  'Private original-source archive for later rain/gauge studies. No automatic expiry. Units, basin review and forecast sampling remain research quality; never feed public amounts directly.';
