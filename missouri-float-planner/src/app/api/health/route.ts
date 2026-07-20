// src/app/api/health/route.ts
// Public health check endpoint — must not disclose configuration details.
// Detailed env diagnostics are gated behind the cron/admin bearer token.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Detailed env diagnostics only for an authenticated operator (cron/admin secret).
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET || process.env.ADMIN_API_SECRET || process.env.ADMIN_PASSWORD;
  const isAuthed = !!secret && authHeader === `Bearer ${secret}`;

  if (isAuthed) {
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasMapboxToken: !!process.env.MAPBOX_ACCESS_TOKEN,
        hasGlobalRateLimiter: !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN,
        trustsGenericForwardedFor: process.env.TRUST_X_FORWARDED_FOR === 'true',
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      },
    });
  }

  // Unauthenticated callers get a bare liveness signal only.
  return NextResponse.json({ status: 'ok' });
}
