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
  const { data: pending, error } = await supabase
    .from('clip_library')
    .select('id, clip_url')
    .eq('brand_check_status', 'pending')
    .not('clip_url', 'is', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error(`${LOG} query failed:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ message: 'No pending clips' });
  }

  const dispatched: string[] = [];
  for (const clip of pending) {
    const ok = await triggerBrandCheck({ clipId: clip.id, clipUrl: clip.clip_url });
    if (ok) {
      await supabase
        .from('clip_library')
        .update({ brand_check_status: 'review', updated_at: new Date().toISOString() })
        .eq('id', clip.id);
      dispatched.push(clip.id);
    }
  }

  console.log(`${LOG} dispatched brand check for ${dispatched.length}/${pending.length} clips`);
  return NextResponse.json({ dispatched: dispatched.length, total: pending.length });
}
