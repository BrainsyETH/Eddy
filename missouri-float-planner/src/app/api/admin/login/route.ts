// src/app/api/admin/login/route.ts
// POST /api/admin/login - Validate admin password server-side and set an HttpOnly session cookie.
// The password is NEVER exposed to the client bundle.

import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AdminIdentity } from '@/lib/admin/permissions';
import { timingSafeEqual } from 'crypto';
import { recordLogin } from '@/lib/admin/dashboard/login-audit';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminToken,
} from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 attempts per IP per 15 minutes
    const ip = getClientIp(request);
    const rateLimitResponse = await rateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000, { failClosed: true });
    if (rateLimitResponse) {
      rateLimitResponse.headers.set('Cache-Control', 'private, no-store');
      return rateLimitResponse;
    }

    const body = await request.json();
    const { password, email } = body;

    if (!password || typeof password !== 'string') {
      return json({ error: 'Password is required' }, 400);
    }

    let identity: AdminIdentity;
    if (email !== undefined) {
      if (typeof email !== 'string' || email.length > 254 || !email.includes('@')) return json({ error: 'Enter a valid email address.' }, 400);
      const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await auth.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.session || !data.user?.email_confirmed_at) { await recordLogin(false); return json({ error: 'Sign-in failed. Check your credentials and admin access.' }, 401); }
      const { data: verified, error: verificationError } = await auth.auth.getUser(data.session.access_token);
      if (verificationError || !verified.user) return json({ error: 'Could not verify this account.' }, 401);
      const { data: membership, error: membershipError } = await createAdminClient().from('admin_memberships').select('user_id,name,role,active').eq('user_id', verified.user.id).maybeSingle();
      if (membershipError) return json({ error: 'Named admin access is not available yet. Contact the owner.' }, 503);
      if (!membership?.active || !['owner','editor','moderator'].includes(membership.role)) { await recordLogin(false); return json({ error: 'Sign-in failed. Check your credentials and admin access.' }, 401); }
      identity = { id: membership.user_id, name: membership.name, role: membership.role, legacy: false };
    } else {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (process.env.ADMIN_ALLOW_RECOVERY_ACCESS === 'false') return json({ error: 'Recovery access is disabled. Use your named account.' }, 403);
      if (!adminPassword) return json({ error: 'Owner recovery access is not configured.' }, 503);
      const expected = Buffer.from(adminPassword); const supplied = Buffer.from(password);
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) { await recordLogin(false); return json({ error: 'Invalid password' }, 401); }
      identity = { id: null, name: 'Owner recovery', role: 'owner', legacy: true };
    }
    const token = createAdminToken(identity.id ?? undefined);
    await recordLogin(true);
    const response = json({
      success: true,
      identity,
      expiresIn: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
