// src/app/api/admin/login/route.ts
// POST /api/admin/login - Validate admin password server-side and set an HttpOnly session cookie.
// The password is NEVER exposed to the client bundle.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminToken,
} from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per IP per 15 minutes
    const ip = getClientIp(request);
    const rateLimitResponse = await rateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000);
    if (rateLimitResponse) {
      rateLimitResponse.headers.set('Cache-Control', 'private, no-store');
      return rateLimitResponse;
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return json({ error: 'Password is required' }, 400);
    }

    // Server-side only — NEVER use NEXT_PUBLIC_ vars (they leak to client bundle)
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('[Admin Login] ADMIN_PASSWORD is not configured');
      return json({ error: 'Server configuration error' }, 500);
    }

    if (password !== adminPassword) {
      return json({ error: 'Invalid password' }, 401);
    }

    // Generate a time-limited token (expires in 4 hours). It is only exposed as
    // an HttpOnly cookie, so browser JavaScript cannot read or exfiltrate it.
    const token = createAdminToken();
    const response = json({
      success: true,
      expiresIn: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
