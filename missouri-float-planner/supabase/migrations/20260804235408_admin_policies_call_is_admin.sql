-- APPLIED to production 2026-08-04 as 20260804235408.
--
-- Rewrite the ten admin-gated policies that inline the user_roles lookup so
-- they call is_admin() instead. Closes the `admin_policies_use_is_admin`
-- invariant, which trust_schema_invariants() has reported since 20260804162015.
--
-- ── Why this is not cosmetic ────────────────────────────────────────────
--
-- The two forms look identical and are not:
--
--   EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
--   is_admin()
--
-- is_admin() is SECURITY DEFINER, so it reads user_roles with the definer's
-- rights and RLS on that table does not apply to it. The inline form is an
-- ordinary subquery evaluated as the calling user, so it sees only the rows
-- user_roles' own SELECT policy lets through. That works today purely because
-- that policy still carries a `user_id = auth.uid()` branch.
--
-- Tighten user_roles — the obvious hardening, since a table of who is an admin
-- is not something a user needs to read — and every inline check starts
-- returning false while every is_admin() one keeps working. Silent, and in the
-- direction of locking admins out of tables that still look correctly gated.
-- Nothing errors; the rows just stop being there.
--
-- ── The substitution is exact ───────────────────────────────────────────
--
-- Checked against production rather than assumed. is_admin() is:
--
--   RETURN EXISTS (SELECT 1 FROM user_roles
--                   WHERE user_id = auth.uid() AND role = 'admin');
--
-- which is the inlined predicate character for character. So every policy below
-- keeps its exact meaning and only changes how the admin test is reached. The
-- non-admin branches (`status = 'verified'`, `auth.uid() = user_id`, the
-- service_status list) are reproduced unchanged.
--
-- Three policies on these tables are deliberately NOT touched, because they do
-- not gate on admin at all and the invariant does not name them:
--   community_reports_insert  — with_check (auth.uid() IS NOT NULL)
--   service_rivers_select     — qual `true`, this table is public reference data
--
-- ── Why is_admin() gets its search_path pinned here ─────────────────────
--
-- It is SECURITY DEFINER with no `SET search_path`, and this migration makes it
-- the single gate for ten more policies. A definer function that resolves
-- `user_roles` through the caller's search_path is the standard shape of a
-- privilege-escalation bug.
--
-- It is NOT a live hole: only pg_database_owner holds CREATE on schema public
-- on this database, so anon and authenticated cannot plant a shadowing
-- user_roles to be found first. Verified before writing this, and stated so
-- nobody reads the fix as evidence of a breach. It is the second half of the
-- defence, and worth adding in the same change that widens what depends on it —
-- the same both-halves argument 20260731223406 makes for the social tables.

-- ---------------------------------------------------------------------------
-- is_admin(), unchanged in behaviour, pinned in resolution.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
    );
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS
    'True when the calling user holds the admin role. SECURITY DEFINER so it reads user_roles regardless of that table''s RLS — policies must call this rather than inlining the lookup, or they silently return false once user_roles is tightened. search_path pinned: a definer function must not resolve its tables through the caller''s path.';

-- ---------------------------------------------------------------------------
-- community_reports
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS community_reports_select ON public.community_reports;
CREATE POLICY community_reports_select ON public.community_reports
    FOR SELECT
    USING (status = 'verified'::text OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS community_reports_update ON public.community_reports;
CREATE POLICY community_reports_update ON public.community_reports
    FOR UPDATE
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS community_reports_delete ON public.community_reports;
CREATE POLICY community_reports_delete ON public.community_reports
    FOR DELETE
    USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- nearby_services
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS nearby_services_select ON public.nearby_services;
CREATE POLICY nearby_services_select ON public.nearby_services
    FOR SELECT
    USING (
        status = ANY (ARRAY['active'::service_status,
                            'seasonal'::service_status,
                            'unverified'::service_status])
        OR public.is_admin()
    );

DROP POLICY IF EXISTS nearby_services_insert ON public.nearby_services;
CREATE POLICY nearby_services_insert ON public.nearby_services
    FOR INSERT
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS nearby_services_update ON public.nearby_services;
CREATE POLICY nearby_services_update ON public.nearby_services
    FOR UPDATE
    USING (public.is_admin());

DROP POLICY IF EXISTS nearby_services_delete ON public.nearby_services;
CREATE POLICY nearby_services_delete ON public.nearby_services
    FOR DELETE
    USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- service_rivers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS service_rivers_insert ON public.service_rivers;
CREATE POLICY service_rivers_insert ON public.service_rivers
    FOR INSERT
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS service_rivers_update ON public.service_rivers;
CREATE POLICY service_rivers_update ON public.service_rivers
    FOR UPDATE
    USING (public.is_admin());

DROP POLICY IF EXISTS service_rivers_delete ON public.service_rivers;
CREATE POLICY service_rivers_delete ON public.service_rivers
    FOR DELETE
    USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Assert the invariant this migration exists to close, in the same transaction
-- that changed it. A migration that reports success while leaving the finding
-- open is the shape this subsystem keeps finding in itself.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_remaining integer;
    v_detail text;
BEGIN
    SELECT count(*), coalesce(string_agg(tablename || '.' || policyname, ', '), '')
      INTO v_remaining, v_detail
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%user_roles%'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%admin%'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) NOT LIKE '%is_admin()%';

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'admin_policies_use_is_admin still fails: % policy(ies) inline the lookup: %',
            v_remaining, v_detail;
    END IF;
END $$;

-- Confirmed on production after applying, rather than trusted from this file:
--   select invariant_key, ok, detail from public.trust_schema_invariants()
--    where invariant_key = 'admin_policies_use_is_admin';
-- returned ok = true, 'every admin-gated policy calls is_admin()'.
