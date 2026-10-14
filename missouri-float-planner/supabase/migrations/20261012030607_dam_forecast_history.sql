-- 20261012030607_dam_forecast_history.sql
--
-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-10-12 and RECORDED as
-- 20261012030607. Ledger: supabase/production-migrations.txt.
--
-- Every distinct dam generation forecast and SWPA schedule Eddy served, kept so
-- forecast accuracy can be measured against what the powerhouse then did.
--
-- ── Why this reverses "yesterday's copy is worthless" ──────────────────────
--
-- dams.ts and dam_snapshots both argue that an old forecast has no value, and
-- for SERVING that is still true: nothing here is read by a route. What the old
-- argument missed is evaluation. dam_metric_readings keeps 730 days of what the
-- turbines actually did; without the forecasts that preceded those hours there
-- is no way to say how often "no generation scheduled" was wrong, by how much,
-- or how that changes with lead time. ADR 0013 records the decision.
--
-- ── One row per VERSION, not per hourly rebuild ────────────────────────────
--
-- The snapshot cron rebuilds hourly, but a district republishes roughly daily.
-- record_dam_forecasts compares each incoming version's hash with the latest
-- stored version for that dam and source: unchanged extends last_seen_at,
-- changed inserts a new row. A forecast that goes A -> B -> A is three rows,
-- so "what was Eddy showing at time T" is always the row whose
-- [first_seen_at, last_seen_at] covers T.
--
-- The hash is computed by the caller over a canonical form that excludes
-- fetch-time fields (retrievedAt) and the hourly slice of the current window
-- (see src/lib/data/dam-forecast-history.ts). The payload is stored as served.
--
-- Retention matches dam_metric_readings (730 days): a forecast older than the
-- observations it would be scored against has nothing left to be compared with.

create table public.dam_forecast_history (
  dam_id        text        not null,
  source        text        not null check (source in ('cwms_generation_forecast', 'swpa_schedule')),
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  content_hash  text        not null check (length(content_hash) between 8 and 128),
  payload       jsonb       not null check (jsonb_typeof(payload) in ('object', 'array')),
  primary key (dam_id, source, first_seen_at),
  check (last_seen_at >= first_seen_at)
);

comment on table public.dam_forecast_history is
  'Each distinct generation forecast (CWMS) and schedule (SWPA) per dam, with the interval Eddy served it. Written by /api/cron/sync-dam-snapshots through record_dam_forecasts; read only for forecast-accuracy analysis, never by a route. Retained 730 days to match dam_metric_readings. See ADR 0013.';

alter table public.dam_forecast_history enable row level security;
revoke all on public.dam_forecast_history from public, anon, authenticated;
grant all on public.dam_forecast_history to service_role;

-- p_rows: [{ dam_id, source, content_hash, payload }]. One call per cron run;
-- the cron's own lock serialises runs, and the row lock below covers a manual
-- re-run racing a scheduled one.
create function public.record_dam_forecasts(p_rows jsonb, p_seen_at timestamptz)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  latest public.dam_forecast_history;
  inserted int := 0;
  extended int := 0;
  pruned int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'Invalid forecast batch';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    select * into latest from public.dam_forecast_history
      where dam_id = item->>'dam_id' and source = item->>'source'
      order by first_seen_at desc limit 1
      for update;
    if found and latest.content_hash = item->>'content_hash' then
      if p_seen_at > latest.last_seen_at then
        update public.dam_forecast_history set last_seen_at = p_seen_at
          where dam_id = latest.dam_id and source = latest.source and first_seen_at = latest.first_seen_at;
        extended := extended + 1;
      end if;
    elsif not found or p_seen_at > latest.first_seen_at then
      insert into public.dam_forecast_history(dam_id, source, first_seen_at, last_seen_at, content_hash, payload)
        values (item->>'dam_id', item->>'source', p_seen_at, p_seen_at, item->>'content_hash', item->'payload');
      inserted := inserted + 1;
    end if;
  end loop;
  delete from public.dam_forecast_history where last_seen_at < p_seen_at - interval '730 days';
  get diagnostics pruned = row_count;
  return jsonb_build_object('inserted', inserted, 'extended', extended, 'pruned', pruned);
end $$;

revoke all on function public.record_dam_forecasts(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.record_dam_forecasts(jsonb, timestamptz) to service_role;
