import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Cookie-free public reader. Uses the anon key, preserving public RLS policies.
 * Keep live API/admin readers on their existing no-store clients.
 */
export function createPublicReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing public Supabase configuration');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

/** For descriptive public tables only; mutations and RPCs are never cached. */
export function createPublicCatalogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing public Supabase configuration');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        return fetch(input, method === 'GET' || method === 'HEAD'
          ? { ...init, cache: 'force-cache', next: { revalidate: 300 } }
          : { ...init, cache: 'no-store' });
      },
    },
  });
}
