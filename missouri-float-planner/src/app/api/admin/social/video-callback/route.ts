// src/app/api/admin/social/video-callback/route.ts
// Webhook called by GitHub Actions after rendering a social video.
// Receives multiple post IDs (one per platform), publishes each.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[VideoCallback]';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { postIds: postIdsRaw, videoUrl, status, error, audioVerified, audioKib, totalSilenceS } = body as {
    postIds: string;       // Comma-separated IDs
    videoUrl?: string;
    status: 'rendered' | 'failed';
    error?: string;
    audioVerified?: boolean;
    audioKib?: string;
    totalSilenceS?: string;
  };

  // The workflow's normalize step only emits audioVerified=true after both
  // gates pass: encoded-audio-size floor (~5 KiB/sec) and silencedetect
  // showing <80% silence. Trust the flag; audioKib / totalSilenceS are
  // forwarded purely for logging.
  const audioAudible = audioVerified === true;

  if (!postIdsRaw) {
    return NextResponse.json({ error: 'Missing postIds' }, { status: 400 });
  }

  const postIds = postIdsRaw.split(',').map((id: string) => id.trim()).filter(Boolean);
  const supabase = createAdminClient();
  const results: Array<{ postId: string; platform: string; success: boolean; error?: string }> = [];

  for (const postId of postIds) {
    // Fetch the post record
    const { data: post, error: fetchError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      console.error(`${LOG_PREFIX} Post not found: ${postId}`);
      results.push({ postId, platform: 'unknown', success: false, error: 'Post not found' });
      continue;
    }

    const platform = post.platform as SocialPlatform;

    // Handle render failure — do NOT fall back to image; fail loudly
    if (status === 'failed') {
      console.error(`${LOG_PREFIX} Render failed for ${postId} (${platform}): ${error}`);
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: error || 'Video render failed — no fallback',
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
      results.push({ postId, platform, success: false, error: error || 'Render failed' });
      continue;
    }

    // Handle successful render — publish the video
    if (!videoUrl) {
      results.push({ postId, platform, success: false, error: 'Missing videoUrl' });
      continue;
    }

    // Require measured audio — refuse to publish silent videos.
    if (!audioAudible) {
      const reason = `audio not verified (audioKib=${audioKib ?? 'n/a'}, silence=${totalSilenceS ?? 'n/a'}s)`;
      console.error(`${LOG_PREFIX} Rejecting ${postId} (${platform}): ${reason}`);
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: `Video not published — ${reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
      results.push({ postId, platform, success: false, error: reason });
      continue;
    }

    console.log(`${LOG_PREFIX} Publishing video to ${platform}: ${postId}`);

    // Idempotency claim — atomically move this post from 'rendering' to
    // 'publishing'. Only the callback that wins this transition publishes.
    // The render workflow retries its callback (curl --max-time 60) while an
    // Instagram Reel publish can poll the container for up to ~150s, so a
    // retry routinely arrives while the first publish is still in flight (or
    // already done). Without this guard that retry double-posted to Meta and
    // orphaned the first post (DB keeps only the last platform_post_id).
    const { data: claimed } = await supabase
      .from('social_posts')
      .update({
        video_url: videoUrl,
        status: 'publishing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('status', 'rendering')
      .select('id');

    if (!claimed || claimed.length === 0) {
      console.log(`${LOG_PREFIX} ${postId} (${platform}) already claimed by a prior callback — skipping to avoid a duplicate post`);
      results.push({ postId, platform, success: true, error: 'already handled (idempotent skip)' });
      continue;
    }

    const adapter = getAdapter(platform);
    if (!adapter) {
      console.error(`${LOG_PREFIX} No credentials for ${platform}`);
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: `No credentials for ${platform}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
      results.push({ postId, platform, success: false, error: `No credentials for ${platform}` });
      continue;
    }

    try {
      const result = await adapter.publishPost({
        caption: post.caption,
        videoUrl,
        coverUrl: post.image_url || undefined,
        mediaType: 'video',
      });

      await supabase
        .from('social_posts')
        .update({
          status: result.success ? 'published' : 'failed',
          platform_post_id: result.platformPostId || null,
          published_at: result.success ? new Date().toISOString() : null,
          error_message: result.success ? null : result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      console.log(`${LOG_PREFIX} ${result.success ? 'Published' : 'Failed'} ${platform}: ${postId}`);
      results.push({ postId, platform, success: result.success, error: result.error });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
      results.push({ postId, platform, success: false, error: msg });
    }
  }

  return NextResponse.json({ results });
}
