// src/app/api/cron/brand-check-pending/route.ts
// Cron: auto-run brand check on pending clips so the backlog self-approves.
//
// Runs shortly before each post-clip window. Finds clip_library rows still
// 'pending', dispatches the brand-check GitHub workflow for each (which writes
// back approved/review/rejected), and marks them 'review' so they aren't
// re-dispatched on the next pass.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerBrandCheck } from '@/lib/social/video-renderer';

export const dynamic = 'force-dynamic';
const LOG = '[BrandCheckCron]';
const MAX_PER_RUN = 5;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // A clip needs a check if it's still 'pending', or it's been stuck in 'review'
  // for over an hour (the brand-check workflow likely died before writing a
  // verdict — re-dispatch it). Fetch both states, then filter review-by-age in
  // JS (Date math, format-safe) rather than a brittle timestamp-in-or() filter.
  const staleMs = Date.now() - 60 * 60 * 1000;
  const STALE_ISO = new Date(staleMs).toISOString();

  const { data: candidates, error } = await supabase
    .from('clip_library')
    .select('id, clip_url, brand_check_status, updated_at')
    .not('clip_url', 'is', null)
    .in('brand_check_status', ['pending', 'review'])
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN * 3);

  if (error) {
    console.error(`${LOG} query failed:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actionable = (candidates || [])
    .filter(
      (c) =>
        c.brand_check_status === 'pending' ||
        (c.brand_check_status === 'review' && new Date(c.updated_at).getTime() < staleMs),
    )
    .slice(0, MAX_PER_RUN);

  if (actionable.length === 0) {
    return NextResponse.json({ message: 'No clips need a brand check' });
  }

  const dispatched: string[] = [];
  for (const clip of actionable) {
    // Atomic claim — only one runner wins. For 'pending', guard on status; for a
    // stale 'review', guard on status + still-stale. The updated_at trigger
    // refreshes the timestamp on claim, so a concurrent claim matches 0 rows.
    let claim = supabase.from('clip_library').update({ brand_check_status: 'review' }).eq('id', clip.id);
    claim =
      clip.brand_check_status === 'pending'
        ? claim.eq('brand_check_status', 'pending')
        : claim.eq('brand_check_status', 'review').lt('updated_at', STALE_ISO);

    const { data: claimed } = await claim.select('id');
    if (!claimed || claimed.length === 0) continue;

    const ok = await triggerBrandCheck({ clipId: clip.id, clipUrl: clip.clip_url });
    if (ok) dispatched.push(clip.id);
    // On dispatch failure the clip stays 'review' and is retried after the stale
    // window — no explicit revert needed.
  }

  console.log(`${LOG} dispatched brand check for ${dispatched.length}/${actionable.length} clips`);
  return NextResponse.json({ dispatched: dispatched.length, total: actionable.length });
}
