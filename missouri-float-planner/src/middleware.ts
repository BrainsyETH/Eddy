// src/middleware.ts
// Next.js middleware for Supabase auth session management
// and centralized admin API route protection

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Centralized admin API auth check (excludes login route only)
  if (pathname.startsWith('/api/admin') &&
      pathname !== '/api/admin/login') {
    const secret = process.env.ADMIN_API_SECRET || process.env.ADMIN_PASSWORD;
    if (!secret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Extract token and do basic validation
    // Full token validation (HMAC + expiry) still happens in requireAdminAuth() per-route
    const token = authHeader.substring(7);
    if (!token || token.length < 1) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match all paths except static files and image files
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|api/og/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
