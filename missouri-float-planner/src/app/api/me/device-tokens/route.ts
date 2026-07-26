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
import { requireUser, requirePermanentUser } from '@/lib/supabase/request';
import { rateLimit } from '@/lib/rate-limit';
import { isExpoPushToken } from '@/lib/push/expo';

export const dynamic = 'force-dynamic';

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
      | { expoPushToken?: string; platform?: string; deviceName?: string; appVersion?: string }
      | null;

    const expoPushToken = body?.expoPushToken?.trim();
    if (!expoPushToken) {
      return NextResponse.json({ error: 'expoPushToken required' }, { status: 400 });
    }
    if (!isExpoPushToken(expoPushToken)) {
      // Reject early: a malformed token would sit in the table failing forever.
      return NextResponse.json({ error: 'Not a valid Expo push token' }, { status: 400 });
    }

    const platform = body?.platform === 'android' ? 'android' : 'ios';

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
      return NextResponse.json({ error: 'Could not register device' }, { status: 500 });
    }

    return NextResponse.json({
      device: { id: saved.id, platform: saved.platform, createdAt: saved.created_at },
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Deliberately NOT requirePermanentUser: turning notifications off must
    // never be harder than turning them on.
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const token = request.nextUrl.searchParams.get('expoPushToken');
    const id = request.nextUrl.searchParams.get('id');
    if (!token && !id) {
      return NextResponse.json({ error: 'expoPushToken or id required' }, { status: 400 });
    }

    let query = supabase.from('device_tokens').delete().eq('user_id', user.id);
    query = token ? query.eq('expo_push_token', token) : query.eq('id', id!);

    const { error } = await query;
    if (error) {
      console.error('Error deleting device token:', error);
      return NextResponse.json({ error: 'Could not unregister device' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting device token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
