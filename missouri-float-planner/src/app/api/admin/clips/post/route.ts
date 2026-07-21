// src/app/api/admin/clips/post/route.ts
// POST — Publish an approved clip_library clip directly to the connected
// platforms (Facebook/Instagram, plus TikTok as an inbox draft).
// Thin wrapper around the shared publishClip logic (also used by the cron).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishClip, type ClipRow } from '@/lib/social/clip-poster';
import { getEnabledPlatforms } from '@/lib/social/adapters';
import { tiktokCapReached } from '@/lib/social/tiktok-cap';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const { clipId, platforms } = (body || {}) as { clipId?: string; platforms?: string[] };
  if (!clipId) {
    return NextResponse.json({ error: 'clipId is required' }, { status: 400 });
  }

  const requested = (platforms && platforms.length ? platforms : ['instagram', 'facebook']).filter(
    (p): p is SocialPlatform => p === 'facebook' || p === 'instagram' || p === 'tiktok',
  );
  if (requested.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Only send to TikTok when an account is connected and a draft slot is free;
  // otherwise a manual Send would record a guaranteed-fail TikTok row. FB/IG
  // pass through untouched.
  let validPlatforms = requested;
  if (requested.includes('tiktok')) {
    const enabled = await getEnabledPlatforms(supabase);
    const tiktokOk = enabled.includes('tiktok') && !(await tiktokCapReached(supabase));
    if (!tiktokOk) validPlatforms = requested.filter((p) => p !== 'tiktok');
  }
  if (validPlatforms.length === 0) {
    return NextResponse.json({ error: 'No eligible platform to post to' }, { status: 400 });
  }
  const { data: clip, error } = await supabase.from('clip_library').select('*').eq('id', clipId).single();
  if (error || !clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }
  if (clip.brand_check_status !== 'approved') {
    return NextResponse.json(
      { error: `Clip is not approved (brand_check_status=${clip.brand_check_status}) — run brand check first` },
      { status: 400 },
    );
  }
  if (!clip.clip_url) {
    return NextResponse.json({ error: 'Clip has no clip_url' }, { status: 400 });
  }

  const result = await publishClip(supabase, clip as ClipRow, validPlatforms);
  return NextResponse.json(result);
}
