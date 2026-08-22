-- 20260815180000_access_point_services_policies_call_is_admin.sql
--
-- Rewrite the three admin-gated policies on access_point_services so they call
-- is_admin() instead of inlining the user_roles lookup. Closes the
-- `admin_policies_use_is_admin` invariant finding trust_schema_invariants()
-- has raised since 20260811140000 created them — that migration predates
-- nothing: 20260804235408 had already converted every then-existing admin
-- policy and stated why, and these three were written in the old form anyway.
--
-- The argument is 20260804235408's, unchanged: the two forms look identical
-- and are not. is_admin() is SECURITY DEFINER with a pinned search_path, so it
-- reads user_roles with the definer's rights and keeps answering when
-- user_roles' own SELECT policy is tightened. The inline subquery is evaluated
-- as the calling user and starts silently returning false at exactly that
-- moment — in the direction of locking admins out of a table that still looks
-- correctly gated.
--
-- The substitution is exact: is_admin() is the inlined predicate character for
-- character. access_point_services_select (qual TRUE, public reference data)
-- gates on nothing and is not touched. The UPDATE policy carries only USING in
-- 20260811140000 and keeps only USING here.

DROP POLICY IF EXISTS access_point_services_insert ON public.access_point_services;
CREATE POLICY access_point_services_insert ON public.access_point_services
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS access_point_services_update ON public.access_point_services;
CREATE POLICY access_point_services_update ON public.access_point_services
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS access_point_services_delete ON public.access_point_services;
CREATE POLICY access_point_services_delete ON public.access_point_services
  FOR DELETE USING (public.is_admin());
