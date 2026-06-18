// src/app/api/admin/clips/post/route.ts
// POST — Publish an approved clip_library clip directly to Facebook/Instagram.
// Thin wrapper around the shared publishClip logic (also used by the cron).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishClip, type ClipRow } from '@/lib/social/clip-poster';
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

  const validPlatforms = (platforms && platforms.length ? platforms : ['instagram', 'facebook']).filter(
    (p): p is SocialPlatform => p === 'facebook' || p === 'instagram',
  );
  if (validPlatforms.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
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
