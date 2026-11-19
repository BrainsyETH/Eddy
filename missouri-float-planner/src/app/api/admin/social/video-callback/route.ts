// src/app/api/admin/social/video-callback/route.ts
// Webhook called by GitHub Actions after rendering a social video.
// Receives multiple post IDs (one per platform), publishes each.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { outcomeFields, providerAttemptRecorder, thrownFields, writeOutcome } from '@/lib/social/publish-outcome';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform } from '@/lib/social/types';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { savedPostMedia } from '@/lib/social/review';
import { isDamStory } from '@shared/social-dam-schedule';
import { socialAlert } from '@/lib/social/alert';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[VideoCallback]';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!hasValidMachineBearer(authHeader, cronSecret)) {
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

  for (const target of postIds) {
    // Regeneration keeps the same review row. Only the dispatched render may complete it.
    const [postId, attemptId] = target.split(':');
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

    if (post.status !== 'rendering' || (post.render_request?.attemptId ?? undefined) !== attemptId) { results.push({ postId, platform, success: true }); continue; }

    function saveRender(fields: Record<string, unknown>) {
      const update = supabase.from('social_posts').update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', postId).eq('status', 'rendering');
      return attemptId ? update.eq('render_request->>attemptId', attemptId) : update.is('render_request->>attemptId', null);
    }

    // Handle render failure — do NOT fall back to image; fail loudly
    if (status === 'failed') {
      console.error(`${LOG_PREFIX} Render failed for ${postId} (${platform}): ${error}`);
      await saveRender({ status: 'failed', error_message: error || 'Video render failed — no fallback' });
      if (post.scheduled_at) await socialAlert(`:rotating_light: A timed social post could not be rendered and will not go out (${platform}, ${postId}): ${error || 'render failed'}`);
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
      await saveRender({ status: 'failed', error_message: `Video not published — ${reason}` });
      results.push({ postId, platform, success: false, error: reason });
      continue;
    }

    if (post.auto_publish === false || isDamStory(post.render_request)) {
      // A send time chosen with a dam video is the owner's approval, given in
      // advance: the publisher checks the source again before it sends. If the
      // time was withdrawn while this rendered, the video waits for review.
      if (isDamStory(post.render_request) && post.scheduled_at) {
        const { data: timed } = await saveRender({ video_url: videoUrl, status: 'scheduled', auto_publish: false, error_message: null })
          .eq('scheduled_at', post.scheduled_at).select('id');
        if (timed?.length) { results.push({ postId, platform, success: true }); continue; }
      }
      const { error: reviewError } = await saveRender({ video_url: videoUrl, status: 'review', error_message: null });
      results.push({ postId, platform, success: !reviewError, error: reviewError?.message });
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
    const { data: claimed } = await saveRender({ video_url: videoUrl, status: 'publishing' }).select('id');

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
        ...savedPostMedia({ ...post, media_type: 'video', video_url: videoUrl }),
        onProviderAttempt: providerAttemptRecorder(supabase, postId),
      });

      // Ambiguous failures land as `unknown`, never auto-retried (publish-outcome.ts).
      await writeOutcome(supabase, postId, outcomeFields(result));

      console.log(`${LOG_PREFIX} ${result.success ? 'Published' : 'Failed'} ${platform}: ${postId}`);
      results.push({ postId, platform, success: result.success, error: result.error });
    } catch (err) {
      // A throw from inside publishPost does not prove the platform refused it.
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await writeOutcome(supabase, postId, thrownFields(err));
      results.push({ postId, platform, success: false, error: `outcome unknown — ${msg}` });
    }
  }

  return NextResponse.json({ results });
}
