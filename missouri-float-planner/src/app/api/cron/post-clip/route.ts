// src/app/api/cron/post-clip/route.ts
// Cron: twice a day, post the next approved clip from the backlog to FB/IG.
//
// This is the "posts twice a day" job. Production (scanning/extracting) lives in
// the youtube-clip-pipeline, which fills clip_library with approved clips; this
// cron just draws the oldest unused approved clip and publishes it. On dry days
// (empty backlog) it no-ops.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishClip, type ClipRow } from '@/lib/social/clip-poster';

export const dynamic = 'force-dynamic';
const LOG = '[PostClipCron]';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Oldest approved clips first; pick the first one not yet used in a post.
  const { data: clips, error } = await supabase
    .from('clip_library')
    .select('*')
    .eq('brand_check_status', 'approved')
    .order('created_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error(`${LOG} query failed:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const next = (clips || []).find(
    (c: ClipRow) => c.clip_url && (!Array.isArray(c.used_in_posts) || c.used_in_posts.length === 0),
  );

  if (!next) {
    console.log(`${LOG} backlog empty — no unused approved clip to post`);
    return NextResponse.json({ message: 'No approved clip available to post' });
  }

  // Atomic claim via RPC: the conditional UPDATE runs inside Postgres, so it
  // stays atomic (a concurrent run's update matches 0 rows) without a PostgREST
  // `.or()` filter on an UPDATE — that request never executed server-side, so
  // the cron used to 500 here and never posted. Returns true if we claimed it,
  // false if a live claim (newer than the stale window) already holds it.
  const { data: claimed, error: claimError } = await supabase.rpc('claim_clip_for_posting', {
    p_clip_id: next.id,
    p_stale_minutes: 15,
  });

  if (claimError) {
    console.error(`${LOG} claim failed:`, claimError.message);
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    console.log(`${LOG} clip ${next.id} already claimed by a concurrent run — skipping`);
    return NextResponse.json({ message: 'Clip already claimed by a concurrent run' });
  }

  console.log(`${LOG} posting clip ${next.id} (${next.river_slug})`);
  const result = await publishClip(supabase, next as ClipRow, ['instagram', 'facebook']);
  return NextResponse.json({ clipId: next.id, ...result });
}
