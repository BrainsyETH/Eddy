-- These maintenance RPCs are called only by server/cron service-role clients.
-- Supabase grants anon/authenticated directly, independently of PUBLIC.
REVOKE EXECUTE ON FUNCTION public.claim_clip_for_posting(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_jacks_fork_nps_campgrounds()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_clip_for_posting(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_jacks_fork_nps_campgrounds() TO service_role;

-- public/extensions are not client-writable. Put pg_temp explicitly last so
-- a caller's temporary relation cannot shadow the maintenance tables.
-- The campground linker resolves PostGIS functions/types in extensions.
ALTER FUNCTION public.claim_clip_for_posting(uuid, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.link_jacks_fork_nps_campgrounds()
  SET search_path = public, extensions, pg_temp;
