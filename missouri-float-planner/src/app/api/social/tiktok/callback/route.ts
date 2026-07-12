// src/app/api/social/tiktok/callback/route.ts
// GET /api/social/tiktok/callback — TikTok OAuth redirect target.
//
// PUBLIC route (NOT under /api/admin, which middleware Bearer-gates): TikTok
// reaches this via a browser redirect with no admin token. CSRF is enforced by
// matching the returned `state` against the httpOnly cookie set by the
// admin-gated /api/admin/social/tiktok/connect route, so only a browser that
// legitimately started the flow can complete it. On success we exchange the
// code for tokens, store them, and bounce back to the admin social page.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCodeForTokens, TIKTOK_STATE_COOKIE } from '@/lib/social/tiktok-client';

export const dynamic = 'force-dynamic';

function redirectToAdmin(request: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL('/admin/social', request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete(TIKTOK_STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    return redirectToAdmin(request, { tiktok: 'error', reason: oauthError });
  }

  const cookieState = request.cookies.get(TIKTOK_STATE_COOKIE)?.value;
  if (!code || !returnedState || !cookieState || returnedState !== cookieState) {
    return redirectToAdmin(request, { tiktok: 'error', reason: 'invalid_state' });
  }

  try {
    // TikTok requires the code URL-decoded before exchange.
    await exchangeCodeForTokens(createAdminClient(), decodeURIComponent(code));
    return redirectToAdmin(request, { tiktok: 'connected' });
  } catch (err) {
    console.error('[TikTokCallback] token exchange failed:', err);
    return redirectToAdmin(request, { tiktok: 'error', reason: 'exchange_failed' });
  }
}
