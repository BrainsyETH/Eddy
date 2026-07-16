// src/app/api/admin/social/insights-test/route.ts
// Admin diagnostic — shows the RAW Meta insights response for the most recent
// published Instagram and Facebook post. Insights had never populated (0 of
// 600+ posts) and the fetcher only console.warned the cause, so there was no way
// to tell a permissions gap from a bad-metric error. Hit this endpoint to see
// exactly what Meta says (e.g. "(#10) requires instagram_manage_insights") and
// act on it. The access token is never returned.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const GRAPH = 'https://graph.facebook.com/v24.0';

async function rawInsights(path: string, metrics: string, token: string) {
  const url = `${GRAPH}/${path}?metric=${metrics}&access_token=${encodeURIComponent(token)}`;
  const redactedUrl = `${GRAPH}/${path}?metric=${metrics}&access_token=REDACTED`;
  try {
    const resp = await fetch(url);
    const body = await resp.json().catch(() => ({}));
    return { url: redactedUrl, httpStatus: resp.status, ok: resp.ok, body };
  } catch (err) {
    return { url: redactedUrl, httpStatus: 0, ok: false, body: { error: err instanceof Error ? err.message : 'network error' } };
  }
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'META_PAGE_ACCESS_TOKEN not set' }, { status: 500 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

  // Latest published post per platform that has an id we can probe.
  async function latest(platform: 'instagram' | 'facebook') {
    const { data } = await supabase
      .from('social_posts')
      .select('id, platform_post_id, media_type, post_type, published_at')
      .eq('platform', platform)
      .eq('status', 'published')
      .not('platform_post_id', 'is', null)
      .gte('published_at', cutoff)
      .order('published_at', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  }

  const [ig, fb] = await Promise.all([latest('instagram'), latest('facebook')]);

  const report: Record<string, unknown> = {
    ok: true,
    note: 'Raw Meta responses for the latest post on each platform. A permissions error here (e.g. requires instagram_manage_insights / read_insights) means the Meta token must be re-authed with the insights scope — no code change will populate insights until then.',
    instagram: null,
    facebook: null,
  };

  if (ig) {
    report.instagram = {
      post: { id: ig.id, platform_post_id: ig.platform_post_id, media_type: ig.media_type, post_type: ig.post_type },
      probes: {
        full: await rawInsights(`${ig.platform_post_id}/insights`, 'views,reach,saved,shares', token),
        reach_only: await rawInsights(`${ig.platform_post_id}/insights`, 'reach', token),
      },
    };
  }

  if (fb) {
    const isVideo = fb.media_type === 'video';
    report.facebook = {
      post: { id: fb.id, platform_post_id: fb.platform_post_id, media_type: fb.media_type, post_type: fb.post_type },
      probes: isVideo
        ? { video_insights: await rawInsights(`${fb.platform_post_id}/video_insights`, 'total_video_views', token) }
        : { post_insights: await rawInsights(`${fb.platform_post_id}/insights`, 'post_impressions,post_impressions_unique', token) },
    };
  }

  return NextResponse.json(report);
}
