// src/app/api/admin/social/tiktok/connect/route.ts
// GET /api/admin/social/tiktok/connect — start the TikTok OAuth flow.
// Admin-gated (called via adminFetch with the admin bearer). Returns the
// Login-Kit authorize URL as JSON and sets a state cookie for CSRF protection;
// the admin page then navigates the browser to that URL. TikTok returns to
// /api/admin/social/tiktok/callback with ?code&state, and the browser presents
// the state cookie so the callback can verify the round-trip.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { buildAuthorizeUrl, hasTikTokCredentials, TIKTOK_STATE_COOKIE } from '@/lib/social/tiktok-client';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  if (!hasTikTokCredentials()) {
    return NextResponse.json(
      { error: 'TikTok app credentials are not configured (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET)' },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString('hex');
  const res = NextResponse.json({ url: buildAuthorizeUrl(state) });
  res.cookies.set(TIKTOK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 min to complete the flow
  });
  return res;
}
