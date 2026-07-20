// src/proxy.ts
// Next.js request proxy for Supabase auth session management and centralized
// admin API route protection. x402 payments remain enforced per API route.

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { hasAdminCredential } from '@/lib/admin-session';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public river guide pages are identical for every visitor and served via
  // ISR. Avoid session cookie work that would make these responses private.
  if (pathname === '/rivers' || pathname.startsWith('/rivers/')) {
    return NextResponse.next();
  }

  // Centralized admin API presence check (the full HMAC/expiry check still
  // runs inside every privileged route via requireAdminAuth()).
  if (pathname.startsWith('/api/admin') && pathname !== '/api/admin/login') {
    const secret = process.env.ADMIN_API_SECRET || process.env.ADMIN_PASSWORD;
    if (!secret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      );
    }

    // This is intentionally a cheap presence gate. Every privileged route
    // performs the full HMAC, expiry, and same-origin validation through
    // requireAdminAuth(). Browser sessions use the HttpOnly cookie; trusted
    // scripts may continue to use a Bearer token.
    if (!hasAdminCredential(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|api/og/|api/usgs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
