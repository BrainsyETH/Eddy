// src/app/api/me/apple-token/route.ts
// POST /api/me/apple-token — exchange an Apple authorization code and keep the
// refresh token, so that deleting this account can revoke it.
//
// App Store Guideline 5.1.1(v). The revocation itself happens in
// src/lib/account-deletion.ts; this route exists only because of a timing
// constraint: Apple authorization codes expire in about five minutes, so the
// code CANNOT be stored at sign-in and exchanged later at deletion time. It has
// to be exchanged now, and the refresh token is what survives.
//
// Requires a permanent account, and that is definitional rather than a policy
// choice — an anonymous user has no Apple identity to revoke. The app calls
// this immediately after signInWithIdToken succeeds, so the session it
// authenticates with is the Apple one.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { requirePermanentUser } from '@/lib/supabase/request';
import { rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { appleCredentialsFromEnv, exchangeAuthorizationCode } from '@/lib/apple/revoke';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    const limited = await rateLimit(`apple-token:${user.id}`, 10, 15 * 60 * 1000, {
      failClosed: true,
    });
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as {
      authorizationCode?: string;
    } | null;

    const code = body?.authorizationCode?.trim();
    if (!code) return jsonPrivate({ error: 'authorizationCode required' }, { status: 400 });

    const creds = appleCredentialsFromEnv();
    // 200, not 500. A deployment without APPLE_* vars — local dev, a preview
    // branch — is not misconfigured from the app's point of view, and the app
    // must not treat a sign-in as failed because an optional integration is
    // absent. `stored: false` says exactly what happened.
    if (!creds) return jsonPrivate({ stored: false, reason: 'not_configured' });

    const exchange = await exchangeAuthorizationCode(code, creds);
    if (!exchange.ok || !exchange.refreshToken) {
      console.error('[apple-token] exchange failed:', exchange.error);
      // Also not a 500 to the caller. A failed exchange costs revocation later,
      // which is ours to fix; it must not surface as a broken sign-in.
      return jsonPrivate({ stored: false, reason: 'exchange_failed' });
    }

    // Service-role: apple_refresh_tokens has RLS with no anon/authenticated
    // policy at all (migration 00211), so the request-scoped client cannot
    // write it — which is the point of the table.
    const admin = createAdminClient();
    const { error } = await admin.from('apple_refresh_tokens').upsert(
      {
        user_id: user.id,
        refresh_token: exchange.refreshToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      console.error('[apple-token] could not store refresh token:', error.message);
      return jsonPrivate({ stored: false, reason: 'store_failed' });
    }

    return jsonPrivate({ stored: true });
  } catch (error) {
    console.error('[apple-token] Unexpected error:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
