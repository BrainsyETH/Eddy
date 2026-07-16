// src/app/api/cron/post-blog/route.ts
// Cron: once a week (Tuesdays via vercel.json), post a river-guide blog to
// Facebook as a link post. Rotation + publishing live in blog-poster; this route
// just gates on the master posting switch and dedups same-day double-fires.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateConfig } from '@/lib/social/config-helpers';
import { publishBlogFeature } from '@/lib/social/blog-poster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const LOG = '[PostBlogCron]';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Respect the global posting switch (same master toggle the scheduler uses).
  const { data: config } = await getOrCreateConfig(supabase);
  if (config && !config.posting_enabled) {
    console.log(`${LOG} posting disabled — skipping`);
    return NextResponse.json({ message: 'Posting disabled' });
  }

  // Dedup: never post two blog features in one day (e.g. a retried cron tick).
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: existing } = await supabase
    .from('social_posts')
    .select('id')
    .eq('post_type', 'blog_feature')
    .in('status', ['publishing', 'published'])
    .gte('created_at', todayStart.toISOString())
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(`${LOG} blog feature already posted today — skipping`);
    return NextResponse.json({ message: 'Blog feature already posted today' });
  }

  const result = await publishBlogFeature(supabase);
  console.log(`${LOG} ${JSON.stringify(result)}`);
  return NextResponse.json(result);
}
