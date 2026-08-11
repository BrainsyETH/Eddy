-- APPLIED to production (ilefwfpvphadsbptiaur) 2026-08-11, recorded as version
-- 20260811144902, which is why this file carries that name. Verified after:
-- zero remaining PUBLIC/anon/authenticated grants on the three functions or on
-- cron_runs.
--
-- Closes the grant shape TRUST_LEDGER_V1_PLAN.md flagged while checking
-- trust_apply_reconcile's ACL and deliberately left alone: "Not fixed here — it
-- predates this work and deserves its own change." This is that change.
--
-- Still true on production when this was written, 2026-08-10:
--
--   try_cron_lock            EXECUTE to PUBLIC, anon, authenticated
--   release_cron_lock        EXECUTE to PUBLIC, anon, authenticated
--   validate_river_data      EXECUTE to PUBLIC, anon, authenticated
--   cron_runs                INSERT/SELECT/UPDATE/DELETE/TRUNCATE to anon
--                            and authenticated
--
-- All four functions in that survey are SECURITY INVOKER, so an anon caller
-- executes them with anon's own privileges and RLS still applies.
--
-- ── Why this is not a live hole, and why it is worth closing anyway ──────
--
-- cron_runs has RLS enabled with ZERO policies, which denies everything to any
-- non-bypassing role. An anon call to try_cron_lock inserts nothing and returns
-- false. Nothing here is exploitable today.
--
-- That is one mechanism holding, which is the exact argument 20260731223406 and
-- 20260804181529 were written against: RLS alone leaves a table one accidental
-- permissive policy away from exposure, and a grant that nothing needs is a
-- standing invitation to write that policy. A cron lock is a better target than
-- most — holding trust_tick or update-gauges stops the safety-relevant path
-- without breaking anything visibly, so the failure would look like silence
-- rather than like an error.
--
-- ── get_river_geometry_json is deliberately NOT in this list ─────────────
--
-- The plan named it alongside the other three. Checking the call sites the way
-- 20260804181529 checked feedback's says it does not belong there:
--
--   src/app/api/rivers/[slug]/route.ts:39   createClient()  -> ANON
--   src/app/api/admin/rivers/route.ts:52    createAdminClient()
--   src/lib/trust/checks/river-geometry.ts  service role, via trust-tick
--
-- The first is the public river detail endpoint, and `createClient()` from
-- lib/supabase/server.ts builds an SSR client on NEXT_PUBLIC_SUPABASE_ANON_KEY.
-- Revoking anon's EXECUTE would return an error object from PostgREST rather
-- than throwing, which that route handles by falling back to rivers.geom and
-- logging a warning — so every public river page would quietly lose the
-- function it was written to use, on the same code path whose earlier silent
-- failure is baseline defect `geometry-rpc-missing`.
--
-- anon EXECUTE on it is correct by design: it is a read-only geometry getter
-- for public pages, SECURITY INVOKER, so RLS on rivers still governs what comes
-- back. It stays.
--
-- The other three have no such caller. Verified before writing this:
--
--   try_cron_lock / release_cron_lock   six call sites, all createAdminClient()
--     trust-tick, update-gauges, post-social, sync-gauge-latest, push-receipts,
--     admin/trust/run
--   validate_river_data                 trust check via trust-tick's admin
--     client; scripts/validate-data.ts on SUPABASE_SERVICE_ROLE_KEY;
--     scripts/ingestion/activate-rivers.ts on createAdminClient()
--
-- cron_runs is never touched as a table anywhere in src/ — no `from('cron_runs')`
-- exists. It is reached only through the two lock functions, which the service
-- role calls.
--
-- ── What keeps the service role working, which is NOT what it looks like ─
--
-- The tempting sentence is "the service role bypasses grants anyway". It does
-- not. service_role has rolbypassrls = true and rolsuper = FALSE, and BYPASSRLS
-- bypasses row-level security only — privileges still apply. What actually lets
-- the service role call these is an EXPLICIT grant, present on production today:
--
--   try_cron_lock        -=EXECUTE, anon, authenticated, postgres, service_role
--   release_cron_lock    -=EXECUTE, anon, authenticated, postgres, service_role
--   validate_river_data  -=EXECUTE, anon, authenticated, postgres, service_role
--   cron_runs            anon, authenticated, postgres, service_role
--
-- So the revoke below MUST name public, anon and authenticated and must not use
-- an unqualified `revoke all ... from all` shape: stripping service_role's grant
-- would stop every cron in this repo, and RLS-bypass would not save it. Verified
-- on scratch PostgreSQL 16 against this exact ACL — after applying, the three
-- functions and the table read `postgres, service_role`, anon is refused on all
-- four objects, and service_role still executes each one.
--
-- ── Why both a PUBLIC revoke and a named-role revoke ────────────────────
--
-- This is the trap 20260804193216 was written for and it is worth restating,
-- because `revoke all ... from public` reads like it closes the door and does
-- not. Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new public
-- functions to anon and authenticated DIRECTLY, and a direct grant is not a
-- PUBLIC grant. Revoking only one of the two leaves an ACL that still carries
-- the other, and `schema_feedback_no_public_mutation_grants` reports exactly
-- that state at HIGH.
--
-- ── What confirms this worked ───────────────────────────────────────────
--
-- trust_schema_invariants() already asserts this class of invariant and runs
-- daily as the schema_invariants check, so the ledger is the verification
-- surface rather than a runbook step. After applying, the ACLs should read as
-- service_role-only (or empty, since the service role bypasses grants).

revoke all on function public.try_cron_lock(text, integer) from public;
revoke all on function public.try_cron_lock(text, integer) from anon, authenticated;

revoke all on function public.release_cron_lock(text) from public;
revoke all on function public.release_cron_lock(text) from anon, authenticated;

revoke all on function public.validate_river_data() from public;
revoke all on function public.validate_river_data() from anon, authenticated;

revoke all on table public.cron_runs from public;
revoke all on table public.cron_runs from anon, authenticated;
