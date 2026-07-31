-- Feedback writes go through POST /api/feedback only.
--
-- The route owns the abuse controls and contract checks: IP rate limiting,
-- required contact information, length limits, email validation, the allowed
-- feedback types, and context shaping. A direct PostgREST INSERT bypasses all
-- of them, so the table must not retain an INSERT policy for anon or
-- authenticated clients. The server route uses the service-role client, which
-- bypasses RLS after those checks have passed.
--
-- This also replaces both generations of policy names used by migrations
-- 00029 and 00037. Production drift left only the older generation installed;
-- dropping every known name makes this migration idempotent in either state.

alter table if exists public.feedback enable row level security;

alter table public.feedback
    drop constraint if exists feedback_feedback_type_check;

alter table public.feedback
    add constraint feedback_feedback_type_check
    check (feedback_type in (
        'inaccurate_data',
        'missing_access_point',
        'suggestion',
        'bug_report',
        'other',
        'partner',
        'gauge_recalibration'
    ));

drop policy if exists feedback_insert_policy on public.feedback;
drop policy if exists feedback_select_policy on public.feedback;
drop policy if exists feedback_update_policy on public.feedback;
drop policy if exists "Anyone can submit feedback" on public.feedback;
drop policy if exists "Admins can view feedback" on public.feedback;
drop policy if exists "Admins can manage feedback" on public.feedback;
drop policy if exists feedback_admin_select_policy on public.feedback;
drop policy if exists feedback_admin_update_policy on public.feedback;
drop policy if exists feedback_admin_delete_policy on public.feedback;

-- No INSERT policy by design. Only the API's service-role client writes rows.

create policy feedback_admin_select_policy
    on public.feedback for select
    to authenticated
    using (is_admin());

create policy feedback_admin_update_policy
    on public.feedback for update
    to authenticated
    using (is_admin())
    with check (is_admin());

create policy feedback_admin_delete_policy
    on public.feedback for delete
    to authenticated
    using (is_admin());
