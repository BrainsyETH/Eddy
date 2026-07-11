// src/lib/supabase/admin.ts
// Service role Supabase client for admin operations and cron jobs
// WARNING: This bypasses RLS - use only in server-side code

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use untyped client for admin operations to avoid strict type issues
// In production, you should regenerate types after running migrations
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin credentials');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      // Force every admin DB read to bypass Next.js's fetch Data Cache.
      // supabase-js issues its requests through Next's patched global fetch,
      // which caches responses by (method + URL) — and does so even inside
      // `dynamic = 'force-dynamic'` routes, because force-dynamic governs
      // route rendering, not the fetch cache. Any query with STABLE arguments
      // (e.g. the live-conditions overlay's latest-readings lookup, keyed only
      // by a fixed station-id list) therefore gets frozen at first call and
      // served stale for the entire deployment. That silently aged gauge
      // readings past the staleness threshold ~a day after each deploy and
      // blanked every "Eddy Says" quote. Admin reads are real-time by nature,
      // so no-store is both the fix and the correct default here.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
