// src/middleware.ts
// Next.js middleware for Supabase auth session management,
// centralized admin API route protection, and x402 AI agent payment enforcement (content pages)

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { paymentMiddleware } from 'x402-next';
import { isAiAgent, getContentPageRoutes, X402_PAY_TO, X402_FACILITATOR_URL } from '@/lib/x402-config';

// x402 middleware for content pages only (API routes use per-route withX402)
const x402ContentMiddleware = X402_PAY_TO
  ? paymentMiddleware(X402_PAY_TO as `0x${string}`, getContentPageRoutes(), { url: X402_FACILITATOR_URL as `${string}://${string}` })
  : null;

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

  // x402 payment enforcement for AI agents on content pages
  // API routes are handled per-route via withX402Route wrapper
  if (x402ContentMiddleware &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/admin')) {
    const userAgent = request.headers.get('user-agent');
    if (isAiAgent(userAgent)) {
      return x402ContentMiddleware(request);
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
