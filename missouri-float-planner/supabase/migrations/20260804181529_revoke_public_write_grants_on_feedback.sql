-- APPLIED to production 2026-08-04 as 20260804181529.
--
-- Closes the `feedback_no_public_mutation_grants` invariant, which
-- trust_schema_invariants() has been reporting since it shipped.
--
-- ── Why this is safe ────────────────────────────────────────────────────
--
-- Every writer to public.feedback goes through the service role, which bypasses
-- both grants and RLS:
--   /api/feedback            (public submit)     createAdminClient()
--   /api/feedback/[id]                           createAdminClient()
--   /api/admin/feedback/[id] (admin triage)      createAdminClient()
--   eddy-ios                 posts to /api/feedback, never the table
--
-- Checked specifically because the admin UPDATE and DELETE policies target
-- `authenticated`, and revoking a grant makes a policy inert — if admin triage
-- ran as `authenticated` rather than as the service role, this would have
-- broken it. It does not.
--
-- ── Why it was worth doing anyway ───────────────────────────────────────
--
-- RLS was already blocking these; 20260731010000 removed the INSERT policy so
-- writes go through the API. So this is the second half of the defence rather
-- than a live hole — the argument 20260731223406 makes for the social tables:
-- RLS alone leaves a table one accidental permissive policy away from exposure.

revoke insert, update, delete on public.feedback from anon, authenticated;
revoke insert, update, delete on public.feedback from public;
