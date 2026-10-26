// src/app/api/cron/post-blog/route.ts
// Cron: Monday–Friday at 9 a.m. Central, post a river-guide blog to
// Facebook as a link post. Rotation + publishing live in blog-poster; this route
// just gates on the master posting switch and dedups same-day double-fires.

import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateConfig } from '@/lib/social/config-helpers';
import { publishBlogFeature } from '@/lib/social/blog-poster';
import { blogFeatureDue } from '@/lib/social/blog-schedule';
import { tryCronLockDetailed, releaseCronLock } from '@/lib/social/cron-lock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const LOG = '[PostBlogCron]';

async function handleGET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The cron runs at 14:00 and 15:00 UTC to cover CDT and CST. Only the
  // matching Central-time window publishes, including after a DST change.
  const now = new Date();
  if (!blogFeatureDue(now)) {
    return NextResponse.json({ skipped: 'Outside weekday 9 a.m. Central window' });
  }

  const supabase = createAdminClient();
  const lock = await tryCronLockDetailed(supabase, 'post-blog', 180);
  if (!lock.acquired) {
    return lock.reason === 'unavailable'
      ? NextResponse.json({ error: 'Blog posting lock unavailable' }, { status: 503 })
      : NextResponse.json({ skipped: 'Blog posting already running' });
  }

  try {
    // Respect the global posting switch (same master toggle the scheduler uses).
    const { data: config, error: configError } = await getOrCreateConfig(supabase);
    if (configError || !config) {
      return NextResponse.json({ error: 'Blog posting config unavailable' }, { status: 503 });
    }
    if (!config.posting_enabled) {
      console.log(`${LOG} posting disabled — skipping`);
      return NextResponse.json({ message: 'Posting disabled' });
    }

    // Dedup: never post two blog features in one day (e.g. a retried cron tick).
    // At this morning-only slot, the Central and UTC calendar dates agree.
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: existing, error: dedupError } = await supabase
      .from('social_posts')
      .select('id')
      .eq('post_type', 'blog_feature')
      .in('status', ['publishing', 'published'])
      .gte('created_at', todayStart.toISOString())
      .limit(1);
    if (dedupError) {
      return NextResponse.json({ error: 'Could not check today’s guide post' }, { status: 503 });
    }
    if (existing && existing.length > 0) {
      console.log(`${LOG} blog feature already posted today — skipping`);
      return NextResponse.json({ message: 'Blog feature already posted today' });
    }

    const result = await publishBlogFeature(supabase);
    console.log(`${LOG} ${JSON.stringify(result)}`);
    return NextResponse.json(result, { status: result.ok || result.skipped ? 200 : 500 });
  } finally {
    await releaseCronLock(supabase, 'post-blog');
  }
}

export const GET = withJobRun("post-blog", handleGET);
