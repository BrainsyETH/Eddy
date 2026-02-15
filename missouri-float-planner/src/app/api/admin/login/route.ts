// src/app/api/admin/login/route.ts
// POST /api/admin/login - Validate admin password server-side, return API token
// The password is NEVER exposed to the client bundle.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
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
    // ADMIN_API_SECRET is the token returned to the client; fall back to password if not set
    const apiSecret = process.env.ADMIN_API_SECRET || adminPassword;

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

    // Return the API secret as a token — the client will send this
    // as Authorization: Bearer <token> on all subsequent admin API calls.
    return NextResponse.json({
      success: true,
      token: apiSecret,
    });
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
