-- Drop the orphaned public RPC increment_plan_view_count(text).
--
-- Created in 00035 as SECURITY DEFINER without a pinned search_path and
-- granted to anon. Nothing calls it any more — get_float_plan_by_code(text,
-- boolean) replaced it — so its only remaining use was letting anyone holding
-- the public key inflate any shared plan's view_count. It is also the last
-- definer function without SET search_path.
--
-- Removed from the reviewed public RPC allowlist in
-- scripts/lib/client-access-contract.ts in the same change, so `make check-db`
-- reports it as unexpected until this migration is applied.

drop function if exists public.increment_plan_view_count(text);
