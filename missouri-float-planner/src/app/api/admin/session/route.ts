import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  return NextResponse.json(
    { authenticated: true },
    { headers: NO_STORE_HEADERS }
  );
}

export async function DELETE(request: NextRequest) {
  const authError = requireAdminAuth(request);
  const response = authError ?? NextResponse.json(
    { success: true },
    { headers: NO_STORE_HEADERS }
  );

  // Clear even expired/invalid sessions so logout always recovers the browser.
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
