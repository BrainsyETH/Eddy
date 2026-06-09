// src/app/api/admin/login/route.ts
// POST /api/admin/login - Validate admin password server-side, return time-limited API token
// The password is NEVER exposed to the client bundle.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createAdminToken } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per IP per 15 minutes
    const ip = getClientIp(request);
    const rateLimitResponse = rateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Server-side only — NEVER use NEXT_PUBLIC_ vars (they leak to client bundle)
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('[Admin Login] ADMIN_PASSWORD is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Generate a time-limited token (expires in 4 hours)
    const token = createAdminToken();

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 4 * 60 * 60, // seconds
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
