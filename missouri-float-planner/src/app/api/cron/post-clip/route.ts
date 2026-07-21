// src/app/api/cron/post-clip/route.ts
// Cron: twice a day, post the next approved clip from the backlog to every
// connected platform (Facebook/Instagram, plus TikTok as an inbox draft).
//
// This is the "posts twice a day" job. Production (scanning/extracting) lives in
// the youtube-clip-pipeline, which fills clip_library with approved clips; this
// cron just draws the oldest unused approved clip and publishes it. On dry days
// (empty backlog) it no-ops.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishClip, type ClipRow } from '@/lib/social/clip-poster';
import { getEnabledPlatforms } from '@/lib/social/adapters';
import { tiktokCapReached } from '@/lib/social/tiktok-cap';

export const dynamic = 'force-dynamic';
// Publishing a Reel is a container flow that polls Meta for up to ~150s PER
// platform (see waitForContainer in meta-client). Without headroom the function
// was killed mid-publish — after Meta committed the Reel but before we could
// record used_in_posts — so the next run re-posted the same clip (the "posted
// twice" bug). Give the publish real room; publishClip is also now idempotent
// per (clip_url, platform) as a belt-and-suspenders guard.
export const maxDuration = 300;
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

  // Oldest approved, UNUSED clip first. The "unused" test MUST run in the query,
  // not in JS after a fixed `.limit()`: clip_library only grows, so once the
  // oldest N approved clips have all been posted, a `.limit(N)` window fills
  // entirely with used clips and the JS find() below returns nothing — the cron
  // silently no-ops ("backlog empty") while freshly-approved clips sit just past
  // the window and never post. (That is exactly how clip posting stalled: 25
  // approved clips were used, 5 newer approved clips waited at positions 26-30.)
  // Filtering unused in-DB keeps selection O(1) no matter how many used clips
  // accumulate. used_in_posts defaults to '{}' (see 00087_clip_library.sql), so
  // "unused" means the empty array OR null.
  const { data: clips, error } = await supabase
    .from('clip_library')
    .select('*')
    .eq('brand_check_status', 'approved')
    .not('clip_url', 'is', null)
    .or('used_in_posts.is.null,used_in_posts.eq.{}')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error(`${LOG} query failed:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The query already restricts to unused clips that have a clip_url; this JS
  // guard is a defensive backstop so a filter quirk can never surface a clip
  // that was already posted.
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

  // Fan out to every connected platform instead of a hardcoded FB/IG list.
  // getEnabledPlatforms adds TikTok only when an account is actually connected;
  // clip Reels are video, so they qualify for TikTok's inbox-draft upload the
  // same way scheduled reels do. Respect TikTok's 5-draft/24h cap — drop it once
  // the rolling window is full so the init call never fails (FB/IG still go out).
  let platforms = await getEnabledPlatforms(supabase);
  if (platforms.includes('tiktok') && (await tiktokCapReached(supabase))) {
    platforms = platforms.filter((p) => p !== 'tiktok');
  }

  console.log(`${LOG} posting clip ${next.id} (${next.river_slug}) → [${platforms.join(', ')}]`);
  const result = await publishClip(supabase, next as ClipRow, platforms);
  return NextResponse.json({ clipId: next.id, ...result });
}
