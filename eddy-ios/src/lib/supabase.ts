// eddy-ios/src/lib/supabase.ts
// The Supabase client used for AUTH ONLY.
//
// Data still goes through the Next.js API — /api/me/* forwards the JWT to
// PostgREST so the same RLS policies apply either way, and routing through the
// backend keeps one implementation of shaping, rate limiting and cache policy
// instead of two. What the app cannot do without a Supabase client is obtain a
// token in the first place, which is all this is for.
//
// Sessions persist in the KEYCHAIN and refresh in the background, so a user who
// starred rivers six months ago still owns them on next launch — and so a
// paying subscriber who reinstalls still owns their subscription, since
// RevenueCat is keyed on this user id. See src/lib/secure-session-store.ts for
// why that storage choice is load-bearing rather than incidental.

import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { secureSessionStore } from '@/lib/secure-session-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when the app was built without Supabase credentials. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/**
 * The shared client, or null when unconfigured.
 *
 * Returning null rather than throwing is deliberate: everything the app does
 * today works without an account, so a missing key must degrade to local-only,
 * not break launch.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (client) return client;

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: secureSessionStore,
      persistSession: true,
      autoRefreshToken: true,
      // No URL to read a session out of on native — leaving this on makes the
      // client wait on a redirect callback that never arrives.
      detectSessionInUrl: false,
    },
  });

  // Supabase refreshes tokens on a timer, and iOS suspends timers in the
  // background. Without this the first request after a long backgrounding goes
  // out with an expired token and 401s.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client?.auth.startAutoRefresh();
    else client?.auth.stopAutoRefresh();
  });

  return client;
}
