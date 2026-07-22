-- 00181_ios_starred_rivers.sql
-- iOS Phase 0: starred rivers (Favorites tab).
--
-- Local-first on device; syncs to this table once the user has ANY Supabase
-- session — anonymous sessions included, so stars survive the anonymous →
-- Sign-in-with-Apple upgrade without a re-sync (same uid). This is the one
-- per-user table that deliberately does NOT require a permanent user.

create table if not exists public.starred_rivers (
    user_id uuid not null references auth.users(id) on delete cascade,
    river_id uuid not null references public.rivers(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, river_id)
);

-- Star counts per river double as the data-driven curation priority signal
-- (strategy doc, "Two-tier coverage").
create index if not exists idx_starred_rivers_river on public.starred_rivers(river_id);

alter table public.starred_rivers enable row level security;

create policy starred_rivers_select_own on public.starred_rivers
    for select using (user_id = (select auth.uid()));

create policy starred_rivers_insert_own on public.starred_rivers
    for insert with check (user_id = (select auth.uid()));

create policy starred_rivers_delete_own on public.starred_rivers
    for delete using (user_id = (select auth.uid()));
