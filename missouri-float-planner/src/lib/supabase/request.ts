// src/lib/supabase/request.ts
// Bearer-token Supabase client for native-app API routes (/api/me/*).
//
// The Expo client authenticates with `Authorization: Bearer <access-jwt>` —
// there are no session cookies in the mobile path, so the SSR client in
// ./server.ts does not apply. This client forwards the caller's JWT to
// PostgREST, so RLS policies (auth.uid(), is_anonymous claim) enforce
// ownership at the database — routes never need to filter by user id for
// safety, only for clarity.
//
// Usage mirrors requireAdminAuth (src/lib/admin-auth.ts): call requireUser()
// (or requirePermanentUser()) first; a NextResponse return is the error to
// send back, otherwise you have { supabase, user }.
//
// NOTE: the client is intentionally untyped (like createAdminClient) until
// the Phase 0 tables land in the generated src/types/database.ts — regenerate
// with `npm run db:gen-types` after applying migrations 00180–00185, then
// this can be tightened to SupabaseClient<Database>.

import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export function createClientFromRequest(request: NextRequest): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const authHeader = request.headers.get('authorization');

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export interface AuthedRequest {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Authenticate a Bearer-token request. Returns the RLS-scoped client and the
 * verified user, or a ready-to-send 401 response.
 *
 *   const auth = await requireUser(request);
 *   if (auth instanceof NextResponse) return auth;
 *   const { supabase, user } = auth;
 */
export async function requireUser(request: NextRequest): Promise<AuthedRequest | NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = createClientFromRequest(request);
  const token = authHeader.slice('bearer '.length).trim();

  // getUser(token) verifies the JWT against Supabase Auth (signature +
  // expiry + revocation), not just locally — a forged or stale token
  // never reaches a query.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  return { supabase, user: data.user };
}

/**
 * Like requireUser, but additionally rejects anonymous sessions. Use for
 * routes tied to purchase/push identity (device tokens, alert subscriptions,
 * entitlements) — mirrors the is_permanent_user() RLS predicate, but fails
 * with a distinct code the app can turn into a sign-in prompt.
 */
export async function requirePermanentUser(request: NextRequest): Promise<AuthedRequest | NextResponse> {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.is_anonymous) {
    return NextResponse.json(
      { error: 'Sign in required', code: 'permanent_account_required' },
      { status: 403 }
    );
  }

  return auth;
}
