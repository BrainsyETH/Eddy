-- Preserve the quoted range in share previews. Old plans have no range;
-- do not invent one from their stored average. Share RPC returns the full row.
alter table public.float_plans
  add column if not exists estimated_float_min_minutes integer,
  add column if not exists estimated_float_max_minutes integer;
alter table public.float_plans drop constraint if exists float_plan_time_range_valid;
alter table public.float_plans add constraint float_plan_time_range_valid check (
  (estimated_float_min_minutes is null and estimated_float_max_minutes is null)
  or (estimated_float_min_minutes is not null and estimated_float_max_minutes is not null
      and estimated_float_min_minutes > 0
      and estimated_float_max_minutes >= estimated_float_min_minutes)
);
