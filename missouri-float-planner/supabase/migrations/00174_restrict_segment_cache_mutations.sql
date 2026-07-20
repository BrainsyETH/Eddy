-- Restrict segment-cache integrity operations to the service role.
--
-- Migration 00006 described service-role-only writes but accidentally created
-- permissive INSERT/UPDATE/DELETE policies. RLS policies and SQL grants are
-- both tightened here so the public Supabase key cannot poison route geometry
-- or distance results.

-- Production no longer has this legacy cache table, while older deployments
-- may still carry it. Guard every object so the migration is safe in both
-- schemas and still closes the permissions wherever the cache exists.
DO $$
BEGIN
  IF to_regclass('public.segment_cache') IS NOT NULL THEN
    DROP POLICY IF EXISTS segment_cache_insert ON public.segment_cache;
    DROP POLICY IF EXISTS segment_cache_update ON public.segment_cache;
    DROP POLICY IF EXISTS segment_cache_delete ON public.segment_cache;

    REVOKE INSERT, UPDATE, DELETE ON TABLE public.segment_cache FROM anon, authenticated;
    GRANT SELECT ON TABLE public.segment_cache TO anon, authenticated;
  END IF;
END
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. These
-- helpers mutate the cache, so keep them callable only by trusted server code.
DO $$
BEGIN
  IF to_regprocedure('public.cache_segment(uuid,uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.cache_segment(UUID, UUID) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.cache_segment(UUID, UUID) TO service_role;
  END IF;

  IF to_regprocedure('public.invalidate_segment_cache(uuid,uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.invalidate_segment_cache(UUID, UUID) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.invalidate_segment_cache(UUID, UUID) TO service_role;
  END IF;
END
$$;
