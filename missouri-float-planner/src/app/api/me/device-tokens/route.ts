import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermanentUser } from '@/lib/supabase/request';

export const dynamic = 'force-dynamic';

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export async function PUT(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null) as {
    token?: string;
    deviceName?: string;
    appVersion?: string;
  } | null;
  const token = body?.token?.trim();
  if (!token || !EXPO_TOKEN.test(token)) {
    return apiError(400, 'validation_failed', 'A valid Expo push token is required');
  }

  // Service role permits a token restored on a new account to be safely
  // reassigned after the current permanent session has been verified.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('device_tokens')
    .upsert({
      user_id: auth.user.id,
      expo_push_token: token,
      platform: 'ios',
      device_name: body?.deviceName?.trim().slice(0, 120) || null,
      app_version: body?.appVersion?.trim().slice(0, 40) || null,
      last_seen_at: new Date().toISOString(),
      failure_count: 0,
      disabled_at: null,
    }, { onConflict: 'expo_push_token' })
    .select('id, expo_push_token, last_seen_at')
    .single();
  if (error) {
    console.error('[DeviceTokens] registration failed:', error);
    return apiError(500, 'internal_error', 'Could not register device token');
  }
  return NextResponse.json({ deviceToken: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return apiError(400, 'validation_failed', 'token is required');

  const { error } = await auth.supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('expo_push_token', token);
  if (error) return apiError(500, 'internal_error', 'Could not remove device token');
  return NextResponse.json({ ok: true });
}
