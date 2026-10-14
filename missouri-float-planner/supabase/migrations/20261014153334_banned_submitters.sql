-- Submitters a moderator has removed from community reporting.
--
-- App Store Guideline 1.2: an app that shows user-generated content must be
-- able to block abusive users from the service. River photos are the only UGC
-- the app shows, and the iOS app now requires Sign in with Apple to submit
-- one, so a submission carries an account a moderator can ban.
--
-- Two keys, either sufficient:
--   user_id             the Supabase account at the time of the ban.
--   apple_subject_hash  SHA-256 of the Apple `sub`. Deleting the account and
--                       signing in again creates a new user_id under the same
--                       Apple ID; this is what keeps the ban.
-- user_id deliberately has no foreign key to auth.users: an FK would cascade
-- the ban away with the account it was meant to outlive.
--
-- Server-only: read and written by /api/reports and the admin ban route with
-- the service role. No client role has any privilege or policy.

CREATE TABLE IF NOT EXISTS public.banned_submitters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  apple_subject_hash text,
  source_report_id uuid,
  reason text,
  banned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT banned_submitters_has_key
    CHECK (user_id IS NOT NULL OR apple_subject_hash IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS banned_submitters_user_id_key
  ON public.banned_submitters (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS banned_submitters_apple_subject_hash_key
  ON public.banned_submitters (apple_subject_hash) WHERE apple_subject_hash IS NOT NULL;

ALTER TABLE public.banned_submitters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.banned_submitters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.banned_submitters TO service_role;
