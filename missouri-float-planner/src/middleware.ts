// src/middleware.ts
// Next.js middleware for Supabase auth session management,
// centralized admin API route protection, and x402 AI agent payment enforcement

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { paymentMiddleware } from 'x402-next';
import { isAiAgent, getX402Routes, X402_PAY_TO, X402_FACILITATOR_URL } from '@/lib/x402-config';

// Create x402 payment middleware instance (only active when wallet is configured)
const x402Middleware = X402_PAY_TO
  ? paymentMiddleware(X402_PAY_TO as `0x${string}`, getX402Routes(), { url: X402_FACILITATOR_URL as `${string}://${string}` })
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

  // x402 payment enforcement for AI agents
  // Only applies to non-admin routes when an AI agent User-Agent is detected
  if (x402Middleware &&
      !pathname.startsWith('/api/admin') &&
      !pathname.startsWith('/api/cron') &&
      !pathname.startsWith('/api/og/')) {
    const userAgent = request.headers.get('user-agent');
    if (isAiAgent(userAgent)) {
      return x402Middleware(request);
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
