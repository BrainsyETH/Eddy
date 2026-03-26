// src/middleware.ts
// Next.js middleware for Supabase auth session management,
// centralized admin API route protection, and x402 AI agent payment enforcement (content pages)

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAiAgent, X402_PAY_TO, X402_NETWORK } from '@/lib/x402-config';

// Content page paths that should be gated for AI agents
const GATED_CONTENT_PREFIXES = ['/rivers', '/blog', '/gauges'];

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
  if (X402_PAY_TO &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/admin') &&
      GATED_CONTENT_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    const userAgent = request.headers.get('user-agent');
    if (isAiAgent(userAgent)) {
      return NextResponse.json(
        {
          x402Version: 1,
          error: 'Payment Required',
          message: 'This content requires payment via the x402 protocol. See /.well-known/x402 for pricing details.',
          accepts: [{
            scheme: 'exact',
            network: X402_NETWORK,
            payTo: X402_PAY_TO,
            maxAmountRequired: '1000',
            resource: `${request.nextUrl.protocol}//${request.nextUrl.host}${pathname}`,
            description: 'Content page access',
            mimeType: 'text/html',
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
            maxTimeoutSeconds: 300,
          }],
        },
        { status: 402, headers: { 'Content-Type': 'application/json' } }
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
