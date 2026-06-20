-- Atomic post-claim as an RPC.
--
-- 00136 added posting_claimed_at and the post-clip cron claimed a clip with a
-- PostgREST `.or()` filter on an UPDATE:
--   .update({ posting_claimed_at }).eq('id', id)
--   .or('posting_claimed_at.is.null,posting_claimed_at.lt.<iso>')
-- That request never executed server-side (the cron 500'd at the claim before
-- writing anything), so once the claim shipped, no backlog clip was ever posted.
--
-- Running the same conditional update inside a function keeps the claim atomic
-- (a concurrent run's update matches 0 rows) and sidesteps PostgREST filter
-- translation entirely. Returns true if this call claimed the clip, false if a
-- live claim already holds it. A claim older than p_stale_minutes is treated as
-- stale and reclaimed, so a crashed run can't strand a clip forever.
-- Idempotent so it is safe to re-run.

create or replace function public.claim_clip_for_posting(
  p_clip_id uuid,
  p_stale_minutes int default 15
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed int;
begin
  update clip_library
     set posting_claimed_at = now()
   where id = p_clip_id
     and (posting_claimed_at is null
          or posting_claimed_at < now() - make_interval(mins => p_stale_minutes));
  get diagnostics v_claimed = row_count;
  return v_claimed > 0;
end;
$$;

-- Only the service role (cron / admin server clients) may claim.
revoke all on function public.claim_clip_for_posting(uuid, int) from public;
grant execute on function public.claim_clip_for_posting(uuid, int) to service_role;
