-- 00186_ios_function_hardening.sql
-- iOS Phase 0: harden the functions introduced in 00180–00184, per the
-- Supabase security advisor:
--
--   * Pin search_path on the new functions (mutable search_path warning).
--     All of them reference only schema-qualified objects, so '' is safe.
--   * handle_new_user() is SECURITY DEFINER and exists only as the
--     auth.users trigger — trigger firing does not require EXECUTE for the
--     calling role, so revoke direct RPC execution from clients entirely.
--
-- get_float_plan_by_code / float_plan_code_available deliberately REMAIN
-- executable by anon: knowing the unguessable short_code is the share-link
-- capability. (Advisor flags them; accepted.)

alter function public.is_permanent_user() set search_path = '';
alter function public.update_profiles_updated_at() set search_path = '';
alter function public.update_entitlements_updated_at() set search_path = '';
alter function public.update_alert_subscriptions_updated_at() set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
