// src/lib/admin-auth.ts
// Server-side admin authentication utilities
// All admin API routes must call requireAdminAuth() before processing requests

import { NextRequest, NextResponse } from 'next/server';

/**
 * Verifies the admin Authorization header against the server-side ADMIN_API_SECRET.
 * Returns null if authorized, or a 401 NextResponse if not.
 *
 * Usage in admin API routes:
 *   const authError = requireAdminAuth(request);
 *   if (authError) return authError;
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  // Server-side only secrets — NEVER use NEXT_PUBLIC_ prefixed vars (they leak to client bundle)
  const secret = process.env.ADMIN_API_SECRET || process.env.ADMIN_PASSWORD;

  if (!secret) {
    console.error('[Admin Auth] No admin secret configured (set ADMIN_API_SECRET or ADMIN_PASSWORD)');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null;
}
