-- 00140_restrict_social_rls_to_service_role.sql
-- SECURITY FIX: lock down the social-automation tables to the service role.
--
-- The policies created in 00058_social_media.sql were `FOR ALL USING (true)
-- WITH CHECK (true)` with no role restriction, so they defaulted to the PUBLIC
-- role (anon + authenticated). Because the anon key ships in the browser bundle
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), anyone could read/insert/update/delete rows
-- in these tables via PostgREST — including injecting content into
-- social_custom_content (which the auto-poster weaves into Instagram/Facebook
-- captions) and tampering with social_config.
--
-- All legitimate writes go through the service-role client (createAdminClient),
-- which BYPASSES RLS, so scoping these policies to service_role does not affect
-- the app. This mirrors the correct pattern already used by eddy_updates
-- (00052) and gauge_updates (00124).

-- ── social_posts ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on social_posts" ON social_posts;
CREATE POLICY "Service role can manage social_posts"
  ON social_posts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── social_config ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on social_config" ON social_config;
CREATE POLICY "Service role can manage social_config"
  ON social_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── social_custom_content ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access on social_custom_content" ON social_custom_content;
CREATE POLICY "Service role can manage social_custom_content"
  ON social_custom_content FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
