// src/app/api/me/device-tokens/route.ts
// POST   /api/me/device-tokens  — register (or refresh) this device's Expo push token
// DELETE /api/me/device-tokens  — unregister, by token or by id
//
// Without this route push delivery has no way to acquire a target, so the
// delivery cron would run and send nothing.
//
// Registration requires a PERMANENT (non-anonymous) account: push identity is
// tied to purchase identity, and the RLS policy in migration 00183 enforces
// is_permanent_user() on insert regardless.
//
// Rate limiting is keyed on the USER, not the IP — this is the first /api/me
// route to have a limit, and per-IP is actively wrong for mobile because
// carrier NAT collapses thousands of subscribers into one bucket.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { requireUser, requirePermanentUser } from '@/lib/supabase/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { isExpoPushToken } from '@/lib/push/expo';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // A device re-registers on most cold starts, so this is generous — it
    // exists to stop a loop hammering the table, not to police normal use.
    const limited = await rateLimit(`device-tokens:${user.id}`, 30, 15 * 60 * 1000, {
      failClosed: true,
    });
    if (limited) return limited;

    const body = await request.json().catch(() => null) as
      | {
          expoPushToken?: string;
          platform?: string;
          deviceName?: string;
          appVersion?: string;
          previousDeviceId?: unknown;
        }
      | null;

    const expoPushToken = body?.expoPushToken?.trim();
    if (!expoPushToken) {
      return jsonPrivate({ error: 'expoPushToken required' }, { status: 400 });
    }
    if (!isExpoPushToken(expoPushToken)) {
      // Reject early: a malformed token would sit in the table failing forever.
      return jsonPrivate({ error: 'Not a valid Expo push token' }, { status: 400 });
    }

    const platform = body?.platform === 'android' ? 'android' : 'ios';

    // A push token names a DEVICE, and a device changes hands between
    // accounts: A signs out (the unregister is best-effort and may never
    // land), B signs in on the same phone. The row for this token then still
    // belongs to A. The upsert below runs under A-or-B's RLS, so for B it
    // raises on the ON CONFLICT update (the row is not B's), the route
    // answers 500, B is never registered, and A's alerts keep arriving on the
    // phone B now holds.
    //
    // Knowing a token is not holding the device, though: Expo push tokens are
    // not secrets and turn up in logs. Re-keying on the token alone let any
    // permanent account that learned someone's token delete that person's row
    // and silently stop their alerts. So the re-key needs the same proof
    // /api/device-tokens/release accepts: the previous row's id, a random uuid
    // the server handed only to the install that registered it, which the app
    // keeps in its push ledger. Without it, the token stays where it is and
    // the caller is told so (409); the app's own flow sends the owed release
    // first, so a phone that changed hands normally never gets here.
    // Service role, because by construction the row is not the caller's.
    const previousDeviceId =
      typeof body?.previousDeviceId === 'string' && UUID.test(body.previousDeviceId.trim())
        ? body.previousDeviceId.trim()
        : null;
    const admin = createAdminClient();
    const { data: holder, error: holderError } = await admin
      .from('device_tokens')
      .select('id')
      .eq('expo_push_token', expoPushToken)
      .neq('user_id', user.id)
      .maybeSingle();
    if (holderError) {
      console.error('Error checking device token ownership:', holderError);
      return jsonPrivate({ error: 'Could not register device' }, { status: 500 });
    }
    if (holder) {
      if (holder.id !== previousDeviceId) {
        return jsonPrivate(
          { error: 'This device is registered to another account', code: 'token_held' },
          { status: 409 },
        );
      }
      const { error: rekeyError } = await admin
        .from('device_tokens')
        .delete()
        .eq('id', holder.id)
        .eq('expo_push_token', expoPushToken);
      if (rekeyError) {
        console.error('Error releasing device token from its previous account:', rekeyError);
        return jsonPrivate({ error: 'Could not register device' }, { status: 500 });
      }
    }

    // Re-registering the same token must refresh it rather than fail, and must
    // clear any disabled flag — a reinstall produces a token that previously
    // failed with DeviceNotRegistered.
    const { data: saved, error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id: user.id,
          expo_push_token: expoPushToken,
          platform,
          device_name: body?.deviceName?.slice(0, 120) ?? null,
          app_version: body?.appVersion?.slice(0, 40) ?? null,
          last_seen_at: new Date().toISOString(),
          failure_count: 0,
          disabled_at: null,
        },
        { onConflict: 'expo_push_token' }
      )
      .select('id, platform, created_at')
      .single();

    if (error) {
      console.error('Error registering device token:', error);
      return jsonPrivate({ error: 'Could not register device' }, { status: 500 });
    }

    return jsonPrivate({
      device: { id: saved.id, platform: saved.platform, createdAt: saved.created_at },
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Deliberately NOT requirePermanentUser: turning notifications off must
    // never be harder than turning them on.
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // The token arrives in the BODY now, like registration's does — a push
    // token in a query string persists in CDN and proxy access logs that no
    // app-side redaction can reach. The query parameters stay accepted for
    // installed clients that still send them.
    let bodyToken: string | null = null;
    try {
      const body = (await request.json()) as { expoPushToken?: string } | null;
      bodyToken = body?.expoPushToken?.trim() || null;
    } catch {
      // No JSON body — an older client using the query string.
    }

    const token = bodyToken ?? request.nextUrl.searchParams.get('expoPushToken');
    const id = request.nextUrl.searchParams.get('id');
    if (!token && !id) {
      return jsonPrivate({ error: 'expoPushToken or id required' }, { status: 400 });
    }

    let query = supabase.from('device_tokens').delete().eq('user_id', user.id);
    query = token ? query.eq('expo_push_token', token) : query.eq('id', id!);

    const { error } = await query;
    if (error) {
      console.error('Error deleting device token:', error);
      return jsonPrivate({ error: 'Could not unregister device' }, { status: 500 });
    }

    return jsonPrivate({ ok: true });
  } catch (error) {
    console.error('Error deleting device token:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
