-- 00184_float_plans_private_read.sql
-- iOS Phase 0: close the world-readable float_plans SELECT.
--
-- A saved float predicts where a person will physically be, so owned plans
-- must not be world-readable (strategy doc, backend step 2). user_id and
-- owner-scoped INSERT/DELETE landed earlier (prod migration
-- float_plans_user_ownership); this migration finishes the job:
--
--   * SELECT: anonymous plans (user_id IS NULL — every plan saved by the
--     accountless web today) stay share-by-link readable, unchanged. Owned
--     plans are readable only by their owner.
--   * Share-by-code reads go through get_float_plan_by_code(), a SECURITY
--     DEFINER lookup: knowing the unguessable short_code IS the capability,
--     for owned plans too — that is what "share" means. It also increments
--     view_count atomically, which the old anon-client UPDATE silently
--     stopped doing when the permissive UPDATE policy was dropped.
--   * plan/save's short-code collision loop needs to see ALL rows (owned
--     ones included) — float_plan_code_available() covers that without
--     leaking anything but code existence.

drop policy if exists "Float plans are viewable by everyone" on public.float_plans;

create policy "Anonymous plans public, owned plans owner-only"
    on public.float_plans for select
    using (user_id is null or user_id = (select auth.uid()));

-- Share-link lookup. Returns the full row for a known short_code regardless
-- of ownership; optionally bumps the view counter (only the page-view path
-- passes true — OG images and metadata lookups must not inflate counts).
create or replace function public.get_float_plan_by_code(
    p_short_code text,
    p_increment_view boolean default false
)
returns setof public.float_plans
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_increment_view then
        update public.float_plans
        set view_count = coalesce(view_count, 0) + 1,
            last_viewed_at = now()
        where short_code = p_short_code;
    end if;

    return query
    select * from public.float_plans where short_code = p_short_code;
end;
$$;

grant execute on function public.get_float_plan_by_code(text, boolean) to anon, authenticated;

-- Collision check for the save loop (short_code is UNIQUE; this just keeps
-- the retry loop working now that owned rows are invisible to anon SELECT).
create or replace function public.float_plan_code_available(p_short_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select not exists (
        select 1 from public.float_plans where short_code = p_short_code
    );
$$;

grant execute on function public.float_plan_code_available(text) to anon, authenticated;
