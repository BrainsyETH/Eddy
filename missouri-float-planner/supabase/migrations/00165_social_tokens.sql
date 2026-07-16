-- 00165_social_tokens.sql
-- OAuth token store for social platforms whose auth is not a static env token.
--
-- Facebook/Instagram use a long-lived Page token from env (META_PAGE_ACCESS_TOKEN),
-- so they need no row here. TikTok uses OAuth2 with a short-lived access token
-- (~24h) and a rotating refresh token (~365d) that MUST be persisted and updated
-- on every refresh — hence a table. One row per platform (the connected account).
--
-- These are secrets: RLS denies everyone and only the service-role client
-- (createAdminClient, which bypasses RLS) may read/write, matching the lockdown
-- applied to the other social_* tables in 00140.

CREATE TABLE IF NOT EXISTS social_tokens (
  platform TEXT PRIMARY KEY CHECK (platform IN ('tiktok')),
  -- Stable per-user identifier returned by the provider (TikTok open_id).
  open_id TEXT,
  access_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token TEXT NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  -- Comma-separated granted scopes (e.g. "video.upload").
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE social_tokens ENABLE ROW LEVEL SECURITY;

-- Service-role only (mirrors 00140). No anon/authenticated policy → the browser
-- anon key can never read these tokens.
DROP POLICY IF EXISTS "Service role can manage social_tokens" ON social_tokens;
CREATE POLICY "Service role can manage social_tokens"
  ON social_tokens FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
