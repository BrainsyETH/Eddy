-- 00211_apple_refresh_tokens.sql
-- Apple refresh tokens, kept so an account deletion can revoke them.
--
-- App Store Guideline 5.1.1(v) has required apps that offer Sign in with Apple
-- AND account deletion to call Apple's token revocation endpoint since June
-- 2022. Revoking needs a token, and the app had none: signInWithApple used the
-- identityToken and discarded credential.authorizationCode, which is the only
-- thing exchangeable for a refresh token — and it expires in about five
-- minutes, so it cannot be stored and exchanged later at deletion time. The
-- exchange happens at sign-in; this table holds the result until it is needed.
--
-- ── Why its own table and not a column on profiles ────────────────────────
--
-- profiles holds display fields and is readable by the owner under RLS. This is
-- a credential. social_tokens (00165) is the exact precedent: RLS enabled with
-- NO anon or authenticated policy at all, so only createAdminClient() — which
-- bypasses RLS — can read it, and the browser anon key never can. A column on
-- profiles would put a live Apple refresh token behind a policy designed for
-- display names.
--
-- One row per user, replaced on each sign-in: Apple issues a new refresh token
-- per authorization code, and only the newest is worth keeping.

CREATE TABLE IF NOT EXISTS apple_refresh_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE apple_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Service-role only, mirroring social_tokens. No anon/authenticated policy is
-- the point of the table, not an omission.
DROP POLICY IF EXISTS "Service role can manage apple_refresh_tokens" ON apple_refresh_tokens;
CREATE POLICY "Service role can manage apple_refresh_tokens"
  ON apple_refresh_tokens FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- The ON DELETE CASCADE above is a backstop, not the mechanism. Revocation
-- reads this row BEFORE auth.admin.deleteUser runs (see account-deletion.ts);
-- the cascade only guarantees nothing is left behind if that path is ever
-- bypassed.
COMMENT ON TABLE apple_refresh_tokens IS
  'Apple OAuth refresh tokens, service-role only. Read at account deletion to call Apple''s /auth/revoke (Guideline 5.1.1(v)).';
