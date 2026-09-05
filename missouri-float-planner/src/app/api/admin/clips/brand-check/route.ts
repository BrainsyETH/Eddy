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

  // Move the clip into the in-flight state before dispatch. Doing this after
  // dispatch allowed a fast workflow to write `approved`/`rejected` first and
  // then get overwritten back to `review` by this request.
  const { error: checkingError } = await supabase
    .from('clip_library')
    .update({
      brand_check_status: 'review',
      brand_check_result: null,
      brand_check_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clipId);

  if (checkingError) {
    console.error('Failed to mark clip brand check in progress:', checkingError);
    return NextResponse.json(
      { error: 'Could not mark the clip as in review' },
      { status: 500 },
    );
  }

  let success = false;
  try {
    success = await triggerBrandCheck({
      clipId,
      clipUrl: clip.clip_url,
    });
  } catch (dispatchError) {
    console.error('Brand check workflow dispatch threw:', dispatchError);
  }

  if (!success) {
    const message = 'Failed to dispatch brand check workflow';
    const { error: failureUpdateError } = await supabase
      .from('clip_library')
      .update({
        brand_check_status: 'failed',
        brand_check_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clipId);
    if (failureUpdateError) {
      console.error('Failed to persist brand check dispatch failure:', failureUpdateError);
    }
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: 'Brand check dispatched' });
}
