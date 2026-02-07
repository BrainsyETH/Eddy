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
  const secret = process.env.ADMIN_API_SECRET;

  if (!secret) {
    // In development without a secret configured, allow access with a warning
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Admin Auth] ADMIN_API_SECRET not set — allowing request in development mode');
      return null;
    }
    console.error('[Admin Auth] ADMIN_API_SECRET is not configured');
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
