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
  // Support both new ADMIN_API_SECRET and legacy NEXT_PUBLIC_ADMIN_PASSWORD
  const secret = process.env.ADMIN_API_SECRET || process.env.ADMIN_PASSWORD || process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

  if (!secret) {
    // In development without a secret configured, allow access with a warning
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Admin Auth] No admin secret configured — allowing request in development mode');
      return null;
    }
    console.error('[Admin Auth] No admin secret configured (ADMIN_API_SECRET, ADMIN_PASSWORD, or NEXT_PUBLIC_ADMIN_PASSWORD)');
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
