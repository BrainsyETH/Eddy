// src/app/api/device-tokens/release/route.ts
// POST /api/device-tokens/release — finish an unregister a signed-out device
// could not send.
//
// Signing out with no signal leaves the leaving account's device_tokens row in
// place, and that account keeps being notified on a phone it no longer holds.
// By the time the phone has signal again the account's credentials are gone,
// so /api/me/device-tokens (which needs them) cannot be used.
//
// What the phone still holds is its push token and the row id this API handed
// back when it registered (POST /api/me/device-tokens). Possession of BOTH is
// the proof: the row id is a random uuid that only the registering install and
// the server know, and the token alone is not enough. The only effect is to
// delete that one row, i.e. stop Eddy alerts to that install — the same thing
// the account could have done itself. The answer is the same whether a row was
// deleted or not, so the route cannot be used to probe for tokens.
//
// Service role, because the caller is by construction not the row's owner.
// Rate limited per IP and fail-closed: it is unauthenticated, and a limiter
// outage must not open it.

import { NextRequest } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { isExpoPushToken } from '@/lib/push/expo';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(`device-token-release:${getClientIp(request)}`, 10, 15 * 60 * 1000, {
      failClosed: true,
    });
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as { expoPushToken?: unknown; deviceId?: unknown } | null;
    const expoPushToken = typeof body?.expoPushToken === 'string' ? body.expoPushToken.trim() : '';
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!isExpoPushToken(expoPushToken) || !UUID.test(deviceId)) {
      return jsonPrivate({ error: 'expoPushToken and deviceId required' }, { status: 400 });
    }

    const { error } = await createAdminClient()
      .from('device_tokens')
      .delete()
      .eq('id', deviceId)
      .eq('expo_push_token', expoPushToken);
    if (error) {
      console.error('Error releasing device token:', error);
      return jsonPrivate({ error: 'Could not release device' }, { status: 500 });
    }

    return jsonPrivate({ ok: true });
  } catch (error) {
    console.error('Error releasing device token:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
