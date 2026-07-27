-- 00194_ios_starred_gauges.sql
-- Starred gauges, alongside starred rivers (Favorites tab).
--
-- Same contract as 00181 in every respect: local-first on device, synced once
-- the user has ANY Supabase session — anonymous included, so a star survives
-- the anonymous → Sign-in-with-Apple upgrade on the same uid.
--
-- ── Why a second table and not a polymorphic starred_items ──────────────────
-- The obvious consolidation is one table with a `kind` column and a nullable id
-- per kind. It costs more than it saves here:
--
--   * starred_rivers carries a REAL foreign key to rivers(id), and the POST
--     route depends on it — it maps Postgres 23503 to a 404 "River not found"
--     rather than writing a row pointing at nothing. A polymorphic table cannot
--     hold a FK to two different parents, so that check would have to be
--     re-implemented as a trigger: strictly more code doing strictly less than
--     the database already does declaratively.
--   * starred_rivers is live and read by shipped app builds. Migrating it under
--     them buys a schema shape nobody is asking for.
--
-- Two four-column tables and one extra request on sync is the cheaper
-- duplication.

create table if not exists public.starred_gauges (
    user_id uuid not null references auth.users(id) on delete cascade,
    gauge_station_id uuid not null references public.gauge_stations(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, gauge_station_id)
);

-- Mirrors idx_starred_rivers_river. Star counts per gauge are a curation signal
-- in their own right — which stations people actually watch — and deliberately
-- NOT unioned with river stars, which answer a different question.
create index if not exists idx_starred_gauges_gauge on public.starred_gauges(gauge_station_id);

alter table public.starred_gauges enable row level security;

-- `(select auth.uid())` rather than a bare auth.uid(), matching 00181: the
-- subquery form is evaluated once as an initplan instead of per row.
create policy starred_gauges_select_own on public.starred_gauges
    for select using (user_id = (select auth.uid()));

create policy starred_gauges_insert_own on public.starred_gauges
    for insert with check (user_id = (select auth.uid()));

create policy starred_gauges_delete_own on public.starred_gauges
    for delete using (user_id = (select auth.uid()));
