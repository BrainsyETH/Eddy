// src/proxy.ts
// Next.js request proxy for Supabase auth session management and centralized
// admin API route protection. x402 payments remain enforced per API route.

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

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

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || authHeader.length <= 'Bearer '.length) {
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
