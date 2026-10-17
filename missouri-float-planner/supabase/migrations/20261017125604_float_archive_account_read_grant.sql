-- Both archive RPCs are SECURITY INVOKER and service_role-only. Their permanent
-- account check reads these two auth.users columns. Production grants neither,
-- so uploads and sharing changes fail with 42501 despite valid authentication.
-- Keep the check and invoker privileges; do not expose email/password columns
-- or grant anything to anon/authenticated.
grant select (id, is_anonymous) on auth.users to service_role;
