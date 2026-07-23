#!/usr/bin/env bash
set -euo pipefail

database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# This repository predates Supabase's timestamp migration convention and has
# several intentionally duplicated numeric prefixes. Apply the canonical
# filename order directly against a fresh Supabase Postgres instance so every
# SQL dependency is still verified without rewriting production history.
while IFS= read -r migration; do
  echo "Applying ${migration}"
  psql "${database_url}" -v ON_ERROR_STOP=1 -f "${migration}"
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)

psql "${database_url}" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'float_plans' and column_name = 'user_id'
  ) then raise exception 'float_plans.user_id is missing'; end if;
  if to_regclass('public.revenuecat_webhook_events') is null then
    raise exception 'revenuecat_webhook_events is missing';
  end if;
  if to_regclass('public.push_deliveries') is null then
    raise exception 'push_deliveries is missing';
  end if;
end $$;
SQL
