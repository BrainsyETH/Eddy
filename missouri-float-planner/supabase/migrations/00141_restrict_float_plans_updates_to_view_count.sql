-- 00141_restrict_float_plans_updates_to_view_count.sql
-- SECURITY FIX: stop anonymous users from overwriting arbitrary float-plan data.
--
-- 00004_rls_policies.sql created `Anyone can update float plan view count` as
-- `FOR UPDATE USING (true) WITH CHECK (true)`. RLS row predicates can't restrict
-- WHICH columns are written, so any visitor holding the public anon key could
-- overwrite another user's saved plan (river, access points, vessel, etc.) — not
-- just the view counter the policy name implies.
--
-- The only legitimate anon write is the view-count bump in
-- src/app/api/plan/[shortCode]/route.ts, which updates exactly two columns:
-- view_count and last_viewed_at. We enforce that with column-level UPDATE
-- privileges (independent of, and additive to, RLS). Plan creation (INSERT) and
-- all admin/cron writes (service role) are unaffected.

-- Remove blanket UPDATE on every column for the public roles...
REVOKE UPDATE ON float_plans FROM anon, authenticated;

-- ...and grant back UPDATE on only the view-tracking columns.
GRANT UPDATE (view_count, last_viewed_at) ON float_plans TO anon, authenticated;

-- The existing RLS UPDATE policy still applies for row visibility; column
-- privileges now constrain the payload. (Service role bypasses both.)
