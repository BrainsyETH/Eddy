/** Read-only catalog gate. Function privileges include inherited PUBLIC grants.
 * These four existing RPCs intentionally form part of the public API; adding
 * another requires review here, rather than inheriting Supabase's defaults.
 */
export const CLIENT_ACCESS_SQL = `
WITH exposed_definers AS (
  SELECT p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), problems AS (
  SELECT 'Unexpected public SECURITY DEFINER RPC: ' || signature AS problem
  FROM exposed_definers WHERE signature NOT IN (
    'is_admin()',
    'get_float_plan_by_code(text, boolean)',
    'float_plan_code_available(text)',
    'increment_plan_view_count(text)'
  )
  UNION ALL
  SELECT 'Client report write privileges remain: ' || role_name
  FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  WHERE has_any_column_privilege(role_name, 'public.community_reports', 'INSERT')
     OR has_any_column_privilege(role_name, 'public.community_reports', 'UPDATE')
  UNION ALL
  SELECT 'Client report write policy remains: ' || policyname
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'community_reports'
    AND cmd IN ('INSERT', 'UPDATE', 'ALL')
    AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  UNION ALL
  SELECT 'Report RLS is disabled'
  WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.community_reports'::regclass)
  UNION ALL
  SELECT 'Service role cannot write reports'
  WHERE NOT has_table_privilege('service_role', 'public.community_reports', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.community_reports', 'UPDATE')
  UNION ALL
  SELECT 'Maintenance RPC missing, misconfigured, or unavailable to service role: ' || signature
  FROM (VALUES
    ('public.claim_clip_for_posting(uuid,integer)', 'search_path=public, pg_temp'),
    ('public.link_jacks_fork_nps_campgrounds()', 'search_path=public, extensions, pg_temp')
  ) AS required(signature, path)
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(signature)
  WHERE p.oid IS NULL OR NOT p.prosecdef
     OR NOT coalesce(path = ANY(p.proconfig), false)
     OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
  UNION ALL
  SELECT 'Client can create objects in trusted schema: ' || schema_name || ' / ' || role_name
  FROM (VALUES ('public'), ('extensions')) AS schemas(schema_name)
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
  WHERE has_schema_privilege(role_name, schema_name, 'CREATE')
)
SELECT coalesce(json_agg(problem ORDER BY problem), '[]'::json) AS client_access_problems FROM problems;
`;

/** CLI transports may wrap the query rows. Refuse missing/unrecognised output. */
export function parseClientAccessProblems(value: unknown): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      try { return parseClientAccessProblems(item); } catch { /* inspect the next wrapper */ }
    }
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('client_access_problems' in record) {
      const rows = record.client_access_problems;
      if (Array.isArray(rows) && rows.every(item => typeof item === 'string')) return rows;
      throw new Error('Invalid client access check result');
    }
    for (const nested of Object.values(record)) {
      try { return parseClientAccessProblems(nested); } catch { /* inspect the next wrapper */ }
    }
  }
  throw new Error('Client access check did not return catalog assertions');
}
