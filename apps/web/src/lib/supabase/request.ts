// src/lib/supabase/request.ts
// Auth-aware Supabase client for route handlers that serve both the web app
// (cookie sessions) and the mobile app (Authorization: Bearer <access_token>).

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import { createClient } from './server';

/**
 * Returns a Supabase client whose auth context matches the caller:
 * - `Authorization: Bearer` header (mobile) → header-forwarding client so
 *   PostgREST evaluates RLS as that user.
 * - otherwise → the cookie-based server client (web sessions, or anonymous).
 */
export async function createClientForRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient();
}

/** Resolves the authenticated user for a request, or null if anonymous. */
export async function getUserForRequest(request: NextRequest) {
  const supabase = await createClientForRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
