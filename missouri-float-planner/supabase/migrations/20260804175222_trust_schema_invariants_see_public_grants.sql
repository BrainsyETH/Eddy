-- APPLIED to production 2026-08-04 as 20260804175222.
--
-- ── The blind spot this closes ───────────────────────────────────────────
--
-- 20260804162015 checked write grants with:
--
--     cross join lateral aclexplode(c.relacl) a
--     join pg_roles r on r.oid = a.grantee
--     where r.rolname in ('anon','authenticated')
--
-- aclexplode() represents the pseudo-role PUBLIC as grantee 0. There is no
-- pg_roles row with oid 0, so that INNER join silently dropped every PUBLIC
-- grant, and `GRANT INSERT ON feedback TO PUBLIC` — which reaches anon, because
-- anon is a member of PUBLIC like every other role — passed the check clean.
--
-- The original file's own header argues at length that a security check
-- reporting "no problem" because it cannot SEE the problem is the exact failure
-- this subsystem exists to avoid. It then reproduced that failure by a
-- different mechanism fifteen lines further down.
--
-- Fixed by a LEFT join with grantee 0 accepted explicitly, and PUBLIC named in
-- the output rather than rendered as an empty string.
--
-- Verified against production inside a rolled-back transaction: with a real
-- `grant insert on public.feedback to public` in place, the invariant returns
-- ok=false and the detail reads "PUBLIC:INSERT". Before this change it returned
-- ok=true.

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
    -- LEFT join, and grantee 0 accepted explicitly. aclexplode() represents the
    -- pseudo-role PUBLIC as grantee 0, which has no pg_roles row, so an inner
    -- join silently drops it: GRANT INSERT ... TO PUBLIC passed this check clean.
    select count(*), coalesce(string_agg(distinct coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ', '), '')
      into v_count, v_detail
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      left join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public' and c.relname = 'feedback'
       and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))
       and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE');

    return query select
        'feedback_no_public_mutation_grants',
        v_count = 0,
        case when v_count = 0 then 'no write grants to anon, authenticated or PUBLIC'
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
              left join pg_roles r on r.oid = a.grantee
             where n.nspname = 'public' and c.relname = 'segment_cache'
               and (a.grantee = 0 or r.rolname in ('anon','authenticated'))
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
    'Catalog-level assertions for docs/legacy-schema-security-audit.md. Read by the trust ledger; returns one row per invariant. Grant checks accept aclexplode grantee 0 (PUBLIC) explicitly.';

-- The output is a list of the schema''s weak spots. Service role only.
revoke all on function public.trust_schema_invariants() from public, anon, authenticated;
grant execute on function public.trust_schema_invariants() to service_role;
