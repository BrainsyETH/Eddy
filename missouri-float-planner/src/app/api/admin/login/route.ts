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

    const adminPassword = process.env.ADMIN_PASSWORD;
    const apiSecret = process.env.ADMIN_API_SECRET;

    if (!adminPassword || !apiSecret) {
      // In development without secrets, allow access
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json({
          success: true,
          token: 'dev-token',
        });
      }
      console.error('[Admin Login] ADMIN_PASSWORD or ADMIN_API_SECRET not configured');
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
