-- 20260822143308_backfill_marks_and_snap_diagnostics_acl.sql
--
-- APPLIED 2026-08-22 to the FloatMe project (ilefwfpvphadsbptiaur) via the
-- management API, which recorded it as version 20260822143308. This file was renamed
-- from 20260821120000_backfill_marks_and_snap_diagnostics_acl.sql
-- so the recorded version matches the filename; scripts/check-migration-drift.ts
-- enforces exact local==remote equality past the legacy baseline, and the
-- original header said to do exactly this once applied.
--
-- Every assertion below ran as part of that apply and passed; had any raised,
-- the whole migration would have rolled back.
--
-- Closes both ERROR-level findings from `get_advisors(type: security)`:
--
--   rls_disabled_in_public   public.dam_history_backfill_marks
--   security_definer_view    public.gauge_snap_diagnostics
--
-- Both were surfaced by an external POI audit that reported the first as a
-- read-exposure issue and missed the second. Checking the ACLs says the first
-- is considerably worse than "readable", and the second is not really about
-- SECURITY DEFINER at all. See docs/AR_POI_AUDIT_RECONCILIATION_2026-08-21.md.
--
-- ── Why dam_history_backfill_marks is a live hole, not defence in depth ────
--
-- 20260810201000 revoked a comparable grant shape on cron_runs and was careful
-- to say it was NOT closing a live hole: cron_runs has RLS enabled with zero
-- policies, so the grants were inert and the change was belt-and-braces.
--
-- This one does not have that second mechanism. RLS is DISABLED here, so the
-- grants are the only thing standing, and they grant everything:
--
--   dam_history_backfill_marks   INSERT/SELECT/UPDATE/DELETE/TRUNCATE/
--                                REFERENCES/TRIGGER to anon AND authenticated
--
-- What that table is matters. 20260816112125 created it, and it has no
-- application call sites at all — `grep -rn dam_history_backfill_marks src/
-- scripts/ shared/` returns nothing; the only references anywhere in the repo
-- are inside the migration that created it. Its entire job is to be the guard
-- row for a NON-IDEMPOTENT, destructive repair. That migration's own header:
--
--   "Idempotency: NOT idempotent by construction — running it twice shifts
--    twice. It is guarded on a marker row instead."
--
-- The repair shifts every row in dam_metric_readings back one hour, and the
-- only thing preventing a second application is:
--
--   IF EXISTS (SELECT 1 FROM dam_history_backfill_marks
--              WHERE mark = 'period_ending_shift_1h') THEN ... RETURN;
--
-- An unauthenticated caller holding DELETE and TRUNCATE on that table can
-- remove the marker. The next apply then re-runs the shift and moves the whole
-- dam-metric history another hour off — silently, because from the migration's
-- point of view the repair simply had not been applied yet. A dam release
-- schedule displayed an hour wrong is a safety-relevant number on this app.
--
-- ── Why gauge_snap_diagnostics needs both halves too ──────────────────────
--
-- The advisor names it as a SECURITY DEFINER view, which reads like a modelling
-- nit. The ACL is what makes it real. On production today:
--
--   relkind      v
--   owner        postgres
--   reloptions   NULL          -- security_invoker unset, so it runs as owner
--   grants       INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
--                to anon AND authenticated
--
-- A definer view owned by postgres, readable by anon, means an anonymous caller
-- reads it with postgres's rights and RLS on the underlying tables does not
-- apply. That is the exposure; "SECURITY DEFINER" is only how it happens.
--
-- Same two-part fix, and the order matters: revoke first so the window where
-- it is an invoker view with anon grants never exists.
--
-- No application code reads it. `grep -rn gauge_snap_diagnostics src/ scripts/`
-- finds only generated-type references in src/types/database.ts, which name it
-- as a referencedRelation and compile whether or not it is readable.
--
-- ── Why both a PUBLIC revoke and a named-role revoke ──────────────────────
--
-- Restating what 20260804193216 and 20260810201000 were written for, because
-- `revoke all ... from public` reads like it closes the door and does not.
-- Supabase ships ALTER DEFAULT PRIVILEGES granting on new public objects to
-- anon and authenticated DIRECTLY, and a direct grant is not a PUBLIC grant.
-- Revoking only one leaves the other in the ACL.
--
-- ── What keeps the service role working ───────────────────────────────────
--
-- Not "the service role bypasses grants" — it does not. Verified on production:
--
--   role             rolsuper   rolbypassrls
--   postgres         f          t
--   service_role     f          t
--   anon             f          f
--   authenticated    f          f
--
-- BYPASSRLS bypasses row-level security only; privileges still apply. So the
-- revoke below MUST name public, anon and authenticated explicitly and must not
-- use an unqualified `revoke all ... from all` shape — stripping service_role's
-- grant would break the dam-history path, and RLS-bypass would not save it.
--
-- Conversely, enabling RLS with zero policies is safe for the paths that must
-- keep working: postgres (the role a migration applies as) and service_role
-- both carry rolbypassrls, so 20260816112125's guard SELECT still sees the
-- marker row. anon and authenticated do not, so they are denied twice over.
--
-- ── No explicit BEGIN/COMMIT ──────────────────────────────────────────────
--
-- Deliberate, and the same call 20260816112125 made for this same table:
-- "both the Supabase CLI and the management API wrap a migration in one
-- transaction already... Nesting our own would only risk committing theirs
-- early."
--
-- ── Verification ──────────────────────────────────────────────────────────
--
-- Pre-state, read-only against production before writing this (every cell
-- confirmed true):
--
--   role            marks SELECT  marks DELETE  marks TRUNCATE  view SELECT
--   anon            t             t             t               t
--   authenticated   t             t             t               t
--   service_role    t             t             t               t
--   postgres        t             t             t               t
--
-- After applying, re-run the same query. anon and authenticated must be f in
-- every column; service_role and postgres must stay t:
--
--   select r.rolname,
--     has_table_privilege(r.rolname,'public.dam_history_backfill_marks','SELECT')   as marks_select,
--     has_table_privilege(r.rolname,'public.dam_history_backfill_marks','DELETE')   as marks_delete,
--     has_table_privilege(r.rolname,'public.dam_history_backfill_marks','TRUNCATE') as marks_truncate,
--     has_table_privilege(r.rolname,'public.gauge_snap_diagnostics','SELECT')       as view_select
--   from (values ('anon'),('authenticated'),('service_role'),('postgres')) r(rolname);
--
-- Then `get_advisors(type: security)` should report zero ERROR-level findings.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
--
-- Exact inverse of what is below, restoring the ACL recorded above:
--
--   alter table public.dam_history_backfill_marks disable row level security;
--   grant all on table public.dam_history_backfill_marks to anon, authenticated;
--   alter view public.gauge_snap_diagnostics set (security_invoker = false);
--   grant all on table public.gauge_snap_diagnostics to anon, authenticated;
--
-- Nothing here is lossy: no rows are read, written, or deleted by this
-- migration, so a rollback restores the prior state exactly.

-- ── dam_history_backfill_marks ────────────────────────────────────────────
revoke all on table public.dam_history_backfill_marks from public;
revoke all on table public.dam_history_backfill_marks from anon, authenticated;

alter table public.dam_history_backfill_marks enable row level security;

comment on table public.dam_history_backfill_marks is
  'One row per one-shot repair applied to dam_metric_readings. Exists so a '
  'non-idempotent data correction can be re-run safely as a no-op. Reachable '
  'only by roles with BYPASSRLS (postgres, service_role): RLS is on with zero '
  'policies and anon/authenticated hold no grants, because deleting a marker '
  'row here would let a destructive one-shot repair run a second time.';

-- ── gauge_snap_diagnostics ────────────────────────────────────────────────
-- Revoke before flipping to invoker, so there is no instant at which it is an
-- invoker view that anon can still address.
revoke all on table public.gauge_snap_diagnostics from public;
revoke all on table public.gauge_snap_diagnostics from anon, authenticated;

alter view public.gauge_snap_diagnostics set (security_invoker = true);

-- ── Assertions ────────────────────────────────────────────────────────────
-- These abort the apply rather than reporting after the fact.
DO $$
DECLARE
  bad text;
BEGIN
  -- 1. anon and authenticated are refused on both objects, every privilege.
  SELECT string_agg(format('%s lacks-refusal on %s/%s', r.rolname, o.obj, p.priv), '; ')
    INTO bad
  FROM (values ('anon'),('authenticated')) r(rolname)
  CROSS JOIN (values
    ('public.dam_history_backfill_marks'),
    ('public.gauge_snap_diagnostics')
  ) o(obj)
  CROSS JOIN (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
  WHERE has_table_privilege(r.rolname, o.obj, p.priv);

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'grant revoke incomplete: %', bad;
  END IF;

  -- 2. service_role and postgres keep working. This is the half an
  --    unqualified `revoke ... from all` would have broken, and RLS-bypass
  --    would NOT have covered for it.
  SELECT string_agg(format('%s lost SELECT on %s', r.rolname, o.obj), '; ')
    INTO bad
  FROM (values ('service_role'),('postgres')) r(rolname)
  CROSS JOIN (values
    ('public.dam_history_backfill_marks'),
    ('public.gauge_snap_diagnostics')
  ) o(obj)
  WHERE NOT has_table_privilege(r.rolname, o.obj, 'SELECT');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'revoke went too far: %', bad;
  END IF;

  -- 3. RLS is actually on. The advisor's finding, restated as an invariant.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'dam_history_backfill_marks'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is still disabled on dam_history_backfill_marks';
  END IF;

  -- 4. Zero policies, on purpose. A permissive policy added later would undo
  --    this without touching the grants, which is the failure mode
  --    20260810201000 warned about; assert the shape now so the next person
  --    adding one has to think about it.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dam_history_backfill_marks'
  ) THEN
    RAISE EXCEPTION 'dam_history_backfill_marks gained a policy; it is meant to have none';
  END IF;

  -- 5. The view runs as its invoker.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'gauge_snap_diagnostics'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'gauge_snap_diagnostics is still a SECURITY DEFINER view';
  END IF;

  -- 6. The guard row this whole migration exists to protect is still there.
  --    If it vanished between the audit and this apply, the destructive
  --    repair in 20260816112125 is armed again and someone needs to know
  --    before it is re-applied.
  IF NOT EXISTS (
    SELECT 1 FROM public.dam_history_backfill_marks
    WHERE mark = 'period_ending_shift_1h'
  ) THEN
    RAISE EXCEPTION
      'period_ending_shift_1h marker is missing — do NOT re-apply 20260816112125 until this is understood';
  END IF;
END $$;
