// src/app/api/admin/social/tiktok/status/route.ts
// GET  — TikTok connection status for the admin panel (no secrets returned).
// DELETE — disconnect (remove the stored token row).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasTikTokCredentials, isTikTokDirectPost, resolveTikTokRedirectUri } from '@/lib/social/tiktok-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('social_tokens')
    .select('open_id, access_token_expires_at, refresh_token_expires_at, scope, updated_at')
    .eq('platform', 'tiktok')
    .maybeSingle();

  return NextResponse.json({
    // Whether the TikTok APP is configured (env creds present).
    configured: hasTikTokCredentials(),
    // Whether an ACCOUNT is connected (a stored token exists).
    connected: Boolean(data),
    // Posting mode: true = direct auto-publish (audited, video.publish);
    // false = draft/inbox (the creator finishes each post in-app).
    directPost: isTikTokDirectPost(),
    // The exact redirect_uri this deployment sends TikTok. Must be registered
    // verbatim on the app (Login Kit → Redirect URI), so surface it for the admin.
    redirectUri: resolveTikTokRedirectUri(),
    openId: data?.open_id ?? null,
    accessTokenExpiresAt: data?.access_token_expires_at ?? null,
    refreshTokenExpiresAt: data?.refresh_token_expires_at ?? null,
    scope: data?.scope ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const supabase = createAdminClient();
  const { error } = await supabase.from('social_tokens').delete().eq('platform', 'tiktok');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
