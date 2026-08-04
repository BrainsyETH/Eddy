-- APPLIED to production 2026-08-04 as 20260804162015, renamed from its
-- authoring timestamp to match what schema_migrations recorded. See the header
-- of 20260804141538_trust_ledger.sql.
--
-- It found two real failures on first run, which is the point:
--   feedback_no_public_mutation_grants — anon and authenticated still hold
--     INSERT/UPDATE/DELETE on public.feedback. RLS blocks them today, so this
--     is the missing half of the defence, not a live hole.
--   admin_policies_use_is_admin — 10 policies across community_reports,
--     nearby_services and service_rivers inline the user_roles lookup.
-- Both are reported rather than fixed here; the remedy is a forward migration
-- with an owner, per the audit's own instruction.
--
-- ── What this is ──────────────────────────────────────────────────────────
--
-- docs/legacy-schema-security-audit.md ends with an instruction that has been
-- outstanding since it was written:
--
--   "Turn each confirmed critical invariant into a catalog-level automated
--    check when the linked database test harness is available."
--
-- This is that. The four invariants it names become a function the trust ledger
-- calls hourly, so a policy or grant that drifts is a finding rather than
-- something nobody looks at until the next release audit.
--
-- ── Why the catalog and not the migration text ────────────────────────────
--
-- The repo already has two checks in this space —
-- scripts/security/segment-cache-policy.test.ts and workflow-action-pins.test.ts
-- — and both assert on FILE CONTENTS. A migration saying `revoke all ... from
-- anon` proves the intent was written down. It cannot prove the statement
-- reached production, and the reason this audit exists at all is that local
-- migration history and production history diverged before 00212.
--
-- Only pg_class, pg_policies and pg_constraint know what is actually true.
--
-- ── SECURITY DEFINER, deliberately ────────────────────────────────────────
--
-- information_schema.role_table_grants filters to grants the CALLING role is
-- party to, so service_role asking about anon's grants gets a truthful-looking
-- empty answer. That failure mode — a security check that reports "no problem"
-- because it cannot see the problem — is the exact shape this whole subsystem
-- exists to avoid, so the function runs as owner and reads pg_class.relacl
-- through aclexplode() instead, which is not filtered.
--
-- Execution is revoked from anon and authenticated. The output names weak spots
-- in the schema, which is precisely the list an attacker would like.

create or replace function public.trust_schema_invariants()
returns table (invariant_key text, ok boolean, detail text)
language plpgsql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
    v_present boolean;
    v_count integer;
    v_detail text;
begin
    -- ── feedback: RLS is on ───────────────────────────────────────────────
    select c.relrowsecurity into v_present
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'feedback';

    return query select
        'feedback_rls_enabled',
        coalesce(v_present, false),
        case when v_present then 'row level security is enabled'
             when v_present is null then 'public.feedback does not exist'
             else 'RLS is DISABLED — every policy on this table is inert' end;

    -- ── feedback: no INSERT path for the publishable key ──────────────────
    -- 20260731010000_feedback_api_only.sql removes the INSERT policy on
    -- purpose: writes go through /api/feedback with the service role. An INSERT
    -- policy reappearing means the anon key can write again.
    select count(*), coalesce(string_agg(policyname, ', '), '')
      into v_count, v_detail
      from pg_policies
     where schemaname = 'public' and tablename = 'feedback'
       and cmd in ('INSERT', 'ALL')
       and (roles::text[] && array['anon','authenticated','public']);

    return query select
        'feedback_no_public_insert_policy',
        v_count = 0,
        case when v_count = 0 then 'no INSERT policy exposed to anon/authenticated'
             else 'INSERT reachable with the publishable key via: ' || v_detail end;

    -- ── feedback: the type CHECK still admits gauge_recalibration ─────────
    -- src/lib/feedback-types.test.ts asserts the TS constant matches the
    -- migration TEXT. This asserts the constraint the database enforces, which
    -- is the half that can drift.
    select count(*) into v_count
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'feedback' and con.contype = 'c'
       and pg_get_constraintdef(con.oid, true) like '%gauge_recalibration%';

    return query select
        'feedback_type_check_has_gauge_recalibration',
        v_count > 0,
        case when v_count > 0 then 'feedback_type CHECK admits gauge_recalibration'
             else 'no CHECK on feedback admits gauge_recalibration — submissions of that type will be rejected' end;

    -- ── feedback: defence in depth, not RLS alone ─────────────────────────
    -- Read from relacl rather than information_schema; see the header.
    select count(*), coalesce(string_agg(distinct r.rolname || ':' || a.privilege_type, ', '), '')
      into v_count, v_detail
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public' and c.relname = 'feedback'
       and r.rolname in ('anon', 'authenticated')
       and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE');

    return query select
        'feedback_no_public_mutation_grants',
        v_count = 0,
        case when v_count = 0 then 'anon and authenticated hold no write grants'
             else 'write grants still held (' || v_detail || '). RLS is what currently blocks them, so the table is one permissive policy away from exposure — the same both-halves argument as 20260731223406' end;

    -- ── segment_cache: no public mutation path ────────────────────────────
    -- 00174 guarded itself with to_regclass because production may not have
    -- this table. Absent is a pass, and says so rather than silently counting 0.
    if to_regclass('public.segment_cache') is null then
        return query select
            'segment_cache_no_public_mutation',
            true,
            'public.segment_cache does not exist in this database';
    else
        select count(*) into v_count
          from (
            select 1 from pg_policies
             where schemaname = 'public' and tablename = 'segment_cache'
               and cmd in ('INSERT','UPDATE','DELETE','ALL')
               and (roles::text[] && array['anon','authenticated','public'])
            union all
            select 1 from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              cross join lateral aclexplode(c.relacl) a
              join pg_roles r on r.oid = a.grantee
             where n.nspname = 'public' and c.relname = 'segment_cache'
               and r.rolname in ('anon','authenticated')
               and a.privilege_type in ('INSERT','UPDATE','DELETE')
          ) s;

        return query select
            'segment_cache_no_public_mutation',
            v_count = 0,
            case when v_count = 0 then 'no public mutation policy or grant'
                 else v_count::text || ' public mutation path(s) present' end;
    end if;

    -- ── admin policies call the canonical function ────────────────────────
    -- An inlined `exists (select 1 from user_roles ...)` is not equivalent to
    -- is_admin(), which is SECURITY DEFINER and therefore bypasses RLS on
    -- user_roles. The inline form only works while user_roles' own SELECT
    -- policy keeps its `user_id = auth.uid()` branch; tighten that and every
    -- inlined check silently returns false while the is_admin() ones keep
    -- working. Silent, and in the direction of locking admins out.
    select count(*), coalesce(string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname), '')
      into v_count, v_detail
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%user_roles%'
       and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%admin%'
       and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) not like '%is_admin()%';

    return query select
        'admin_policies_use_is_admin',
        v_count = 0,
        case when v_count = 0 then 'every admin-gated policy calls is_admin()'
             else v_count::text || ' policy(ies) inline the user_roles lookup instead of calling is_admin(): ' || v_detail end;

    -- ── alert subscription kinds match the API's union ────────────────────
    -- AlertSubscriptionKind in src/types/api.ts is 'floatable' | 'safety' |
    -- 'all'. A constraint narrower than the union rejects valid API input; one
    -- wider accepts values no client can render.
    select count(*) into v_count
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'alert_subscriptions'
       and con.contype = 'c' and con.conname like '%kind%'
       and pg_get_constraintdef(con.oid, true) like '%floatable%'
       and pg_get_constraintdef(con.oid, true) like '%safety%'
       and pg_get_constraintdef(con.oid, true) like '%all%';

    return query select
        'alert_subscription_kind_matches_api',
        v_count > 0,
        case when v_count > 0 then 'kind CHECK admits floatable, safety and all'
             else 'alert_subscriptions kind CHECK does not match AlertSubscriptionKind in src/types/api.ts' end;
end;
$$;

comment on function public.trust_schema_invariants() is
    'Catalog-level assertions for docs/legacy-schema-security-audit.md. Read by the trust ledger; returns one row per invariant.';

-- The output is a list of the schema''s weak spots. Service role only.
revoke all on function public.trust_schema_invariants() from public, anon, authenticated;
grant execute on function public.trust_schema_invariants() to service_role;
