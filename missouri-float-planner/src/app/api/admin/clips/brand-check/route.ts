// src/app/api/admin/clips/brand-check/route.ts
// POST — Trigger brand safety check on a clip via GitHub Actions

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerBrandCheck } from '@/lib/social/video-renderer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { clipId } = body as { clipId: string };

  if (!clipId) {
    return NextResponse.json({ error: 'clipId is required' }, { status: 400 });
  }

  // Fetch clip URL from database
  const supabase = createAdminClient();
  const { data: clip, error } = await supabase
    .from('clip_library')
    .select('clip_url')
    .eq('id', clipId)
    .single();

  if (error || !clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  const success = await triggerBrandCheck({
    clipId,
    clipUrl: clip.clip_url,
  });

  if (!success) {
    return NextResponse.json(
      { error: 'Failed to dispatch brand check workflow' },
      { status: 500 },
    );
  }

  // Mark as checking
  await supabase
    .from('clip_library')
    .update({ brand_check_status: 'review', updated_at: new Date().toISOString() })
    .eq('id', clipId);

  return NextResponse.json({ ok: true, message: 'Brand check dispatched' });
}
