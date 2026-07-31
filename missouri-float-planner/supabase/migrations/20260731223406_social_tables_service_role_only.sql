-- APPLIED to production 2026-07-31 as 20260731223406. The filename carries that
-- exact version because the drift gate compares local filenames against
-- supabase_migrations.schema_migrations — a file named for the timestamp it was
-- authored at, rather than the one it was recorded under, reads as two separate
-- migrations and reports permanent drift.
--
-- social_config, social_custom_content and social_posts were writable with the
-- publishable anon key.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- Each carried exactly one policy, named "Service role full access on <table>",
-- declared FOR ALL TO public with `USING (true) WITH CHECK (true)`. The name
-- described the intent; the predicate did not implement it. `true` admits every
-- role the table is granted to, and anon holds SELECT, INSERT, UPDATE and
-- DELETE on all three — so anyone holding the publishable key could read,
-- rewrite or delete the social posting configuration and the scheduled-post
-- queue through PostgREST.
--
-- That key is not a secret. It is EXPO_PUBLIC_SUPABASE_ANON_KEY, Metro inlines
-- it into the shipped bundle by design, and it is extractable from any install.
-- The protection was supposed to come from RLS, and RLS was permitting
-- everything.
--
-- ── Why these three and not the other two ──────────────────────────────────
--
-- social_tokens and social_weekly_reviews carry the SAME policy name against
-- the correct predicate, `auth.role() = 'service_role'`. Two shapes under one
-- name is how this survived review: reading either of the correct ones tells
-- you the pattern is right, and nothing points at the three that diverged. This
-- migration brings the three into line with the two rather than inventing a
-- third convention.
--
-- ── Why revoking the grants is not enough on its own, and vice versa ───────
--
-- Both halves are applied. RLS alone would leave a table one accidental
-- permissive policy away from exposure; revoking alone would leave a policy
-- that lies about its intent for the next reader. Neither is load-bearing by
-- itself, which is the point.
--
-- ── Blast radius of the fix ───────────────────────────────────────────────
--
-- Every reader of these tables is an /api/admin/social/* route using
-- createAdminClient() — the service-role client, which bypasses RLS entirely
-- and is unaffected by anything below. No anon or authenticated code path
-- touches them, so this removes access that nothing was using.

alter table if exists public.social_config enable row level security;
alter table if exists public.social_custom_content enable row level security;
alter table if exists public.social_posts enable row level security;

drop policy if exists "Service role full access on social_config" on public.social_config;
drop policy if exists "Service role full access on social_custom_content" on public.social_custom_content;
drop policy if exists "Service role full access on social_posts" on public.social_posts;

create policy "Service role full access on social_config"
    on public.social_config for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create policy "Service role full access on social_custom_content"
    on public.social_custom_content for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

create policy "Service role full access on social_posts"
    on public.social_posts for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- Defence in depth. The service role is not affected: it bypasses both grants
-- and policies.
revoke all on public.social_config from anon, authenticated;
revoke all on public.social_custom_content from anon, authenticated;
revoke all on public.social_posts from anon, authenticated;
