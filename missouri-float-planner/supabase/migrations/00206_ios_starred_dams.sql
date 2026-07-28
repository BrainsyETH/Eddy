-- 00206_ios_starred_dams.sql
-- Starred dams, alongside starred rivers (00181) and starred gauges (00194).
--
-- Same contract as both: local-first on device, synced once the user has ANY
-- Supabase session — anonymous included, so a star survives the anonymous →
-- Sign-in-with-Apple upgrade on the same uid. Starring is the investment
-- mechanic that comes BEFORE any paywall ask, so it must never require an
-- account.
--
-- ── Why this one has no foreign key, and the other two do ───────────────────
-- 00194 explains at length why starred_rivers and starred_gauges are separate
-- tables rather than one polymorphic starred_items: both carry a REAL foreign
-- key, and the routes lean on it (a Postgres 23503 becomes a 404 "River not
-- found" rather than a row pointing at nothing).
--
-- A dam cannot have that key, and the reason is not an oversight to be fixed
-- later. Dams are READ-THROUGH, not stored: src/lib/data/dams.ts fetches them
-- from USACE CWMS and SWPA on request and deliberately keeps no table, no cron
-- and no retention job. Their identity lives in the registry in
-- src/lib/flow-providers/usace-registry.ts, as a slug — 'swl-clearwater-dam' —
-- not as a uuid in a table this database owns. Nine of the ten have no row of
-- any kind here; only Clearwater exists, and only as a gauge_stations entry
-- created by 00198 for its tailwater release.
--
-- So `dam_id` is text, and referential integrity is the API route's job:
-- POST /api/me/starred-dams validates the id against the registry before
-- inserting, which is the same 404-for-an-unknown-parent behaviour the other
-- two get from the database, implemented where the parent actually lives.
--
-- The consequence to know about: a dam removed from the registry leaves rows
-- behind. That is preferable to the alternative. These are ten federal
-- projects, they do not churn, and a cascade keyed on a source file would mean
-- a code edit silently deleting user data.

create table if not exists public.starred_dams (
    user_id uuid not null references auth.users(id) on delete cascade,
    -- The USACE registry slug. See above for why this is not a foreign key.
    dam_id text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, dam_id)
);

-- Mirrors idx_starred_rivers_river and idx_starred_gauges_gauge. Star counts
-- per dam are a signal in their own right — which releases people actually
-- watch — and are the thing that would justify wiring the other nine dams up
-- for alerts.
create index if not exists idx_starred_dams_dam on public.starred_dams(dam_id);

alter table public.starred_dams enable row level security;

-- `(select auth.uid())` rather than a bare auth.uid(), matching 00181 and
-- 00194: the subquery form is evaluated once as an initplan instead of per row.
create policy starred_dams_select_own on public.starred_dams
    for select using (user_id = (select auth.uid()));

create policy starred_dams_insert_own on public.starred_dams
    for insert with check (user_id = (select auth.uid()));

create policy starred_dams_delete_own on public.starred_dams
    for delete using (user_id = (select auth.uid()));
