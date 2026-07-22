-- 00185_usgs_daily_percentiles.sql
-- iOS Phase 0: snapshot table for USGS day-of-year discharge percentiles.
--
-- The percentile ladder (p10/p25/p50/p75/p90, src/lib/usgs/gauges.ts) that
-- powers "% of normal" framing comes from the LEGACY USGS statistics service,
-- which is slated for decommission in early 2027 with no confirmed modern
-- equivalent (strategy doc, "External risk"). This table lets us snapshot the
-- statistics into our own DB before the service disappears; readers fall back
-- to it when the live service goes away. Ingestion script is a follow-up —
-- landing the schema now so the snapshot can run any time.

create table if not exists public.usgs_daily_percentiles (
    site_no text not null,
    parameter_code text not null default '00060',  -- discharge cfs
    day_of_year smallint not null check (day_of_year between 1 and 366),
    p05 numeric,
    p10 numeric,
    p20 numeric,
    p25 numeric,
    p50 numeric,
    p75 numeric,
    p80 numeric,
    p90 numeric,
    p95 numeric,
    -- Provenance: years of record behind the statistic, when reported.
    begin_year smallint,
    end_year smallint,
    count_years smallint,
    source text not null default 'usgs_legacy_stat_service',
    snapshotted_at timestamptz not null default now(),
    primary key (site_no, parameter_code, day_of_year)
);

alter table public.usgs_daily_percentiles enable row level security;

-- Public reference data; written by ingestion scripts via service role.
create policy usgs_daily_percentiles_select_all on public.usgs_daily_percentiles
    for select using (true);
