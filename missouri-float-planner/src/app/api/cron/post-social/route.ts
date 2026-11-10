import { dispatchDailyReport } from '@/lib/social/daily-report-dispatch';
import { dailyReportAutoPublishEnabled, isDailyReport } from '@/lib/social/daily-report';
// src/app/api/cron/post-social/route.ts
// Cron job: publishes scheduled social media posts to Instagram and Facebook.
// Runs every 30 min via Vercel Cron.
//
// Image posts: published inline.
// Float Picks render per destination; other video formats share the same file.
//   Triggers GH Actions workflow → callback publishes to all platforms.

import { withJobRun } from '@/lib/admin/dashboard/job-run';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScheduledPosts, getRetryablePosts, type SchedulerResult } from '@/lib/social/post-scheduler';
import { getAdapter } from '@/lib/social/adapters';
import type { SocialPlatform, ScheduledPost, PublishResult } from '@/lib/social/types';
import { triggerVideoRender, getCompositionForPost, videoRenderGroup } from '@/lib/social/video-renderer';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { buildPostContext } from '@/lib/social/post-context';
import { savedPostMedia } from '@/lib/social/review';
import { getInstagramContainerStatus } from '@/lib/social/meta-client';
import {
  UNKNOWN_MESSAGE,
  outcomeFields,
  providerAttemptRecorder,
  reconcileUnknownPosts,
  thrownFields,
  writeOutcome,
} from '@/lib/social/publish-outcome';
import type { PostKind } from '@/lib/social/post-types';

const CRON_LOCK_NAME = 'post_social';
// Sized to THIS route's runtime, not the render's. triggerVideoRender POSTs a
// workflow_dispatch to GitHub Actions and returns on 204 — it never waits for
// the 5–9 minute render, so the old 30-minute window was protecting a wait that
// does not happen here.
//
// Why that matters now: try_cron_lock was broken until migration 00188 and
// never actually blocked, so this window was inert. With the lock working, a
// run killed at maxDuration never reaches its `finally`, and the lock stays
// held for the full stale window — a 30-minute posting outage from one timeout.
// Keep this comfortably above maxDuration but far below the 30-minute cadence.
const CRON_STALE_SECONDS = 6 * 60;

export const dynamic = 'force-dynamic';
// Declared explicitly so the stale window above has a real bound to sit above.
// 300, not 60: an Instagram Reel's container can take up to 150s to process
// (meta-client waitForContainer, 30 × 5s), so a 60s ceiling killed every video
// retry mid-flight — after the container existed, sometimes after publishing.
export const maxDuration = 300;

const LOG_PREFIX = '[SocialCron]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildRenderData(post: ScheduledPost, supabase: any) {
  // Assembly is unified in buildPostContext; this returns just the Remotion
  // render data for the video dispatch (captions come from the scheduler).
  const ctx = await buildPostContext(supabase, {
    postType: post.postType as PostKind,
    riverSlug: post.riverSlug ?? undefined,
    eddyUpdateId: post.eddyUpdateId ?? undefined,
  });
  if (!ctx) throw new Error('No fresh content available; refusing to render an empty post');
  return ctx.renderData;
}

// Link a clip post back to its clip_library row by matching the rendered video
// URL (social_posts has no clip_id). publishClip only records posts that publish
// synchronously in used_in_posts; this covers a clip Reel that lands here on
// retry (e.g. an IG container that outran the inline poll), so the admin clip
// library reflects every platform a clip actually posted to.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkClipPost(supabase: any, videoUrl: string, postId: string) {
  const { data } = await supabase
    .from('clip_library')
    .select('id, used_in_posts')
    .eq('clip_url', videoUrl)
    .limit(1);
  const clip = data?.[0];
  if (!clip) return;
  const used: string[] = Array.isArray(clip.used_in_posts) ? clip.used_in_posts : [];
  if (used.includes(postId)) return;
  await supabase
    .from('clip_library')
    .update({ used_in_posts: [...used, postId], updated_at: new Date().toISOString() })
    .eq('id', clip.id);
}

async function runSocialPosting(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(`${LOG_PREFIX} CRON_SECRET not configured`);
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const skipTimeCheck = request.nextUrl.searchParams.get('skip_time_check') === 'true';
  if (skipTimeCheck) {
    console.log(`${LOG_PREFIX} skip_time_check=true — bypassing schedule time checks`);
  }

  // Serialize concurrent cron runs — two overlapping runs would race on the
  // pre-insert delete in the posting loop and could dispatch duplicate renders.
  const gotLock = await tryCronLock(supabase, CRON_LOCK_NAME, CRON_STALE_SECONDS);
  if (!gotLock) {
    console.log(`${LOG_PREFIX} Another run is active — skipping`);
    return NextResponse.json({ message: 'skipped: concurrent run' });
  }

  let published = 0;
  let failed = 0;
  let skipped = 0;
  let rendering = 0;
  const errors: string[] = [];
  let diagnostics: SchedulerResult['diagnostics'] | undefined;

  try {
  // --- Reap stale non-terminal records ---
  // Previously: deleted rows. That broke the video-callback whose .eq('id')
  // lookup would come back empty for long-running renders. Now: keep the row
  // so the callback can still find and report it.
  //
  // A stale `publishing` row becomes UNKNOWN, not failed. It means a platform
  // call was in flight when the run stopped — the post may well be live — and
  // failed auto-posts are retried, which is how a Reel that published as the
  // function limit hit got posted twice. `pending` and `rendering` never
  // reached a platform, so failing those is safe.
  try {
    const nonRenderCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    // Full-reading reels scale with report length; allow longer renders
    // before exposing a retry in the admin history.
    const renderCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { count: unknownStale, error: unknownError } = await supabase
      .from('social_posts')
      .update(
        { status: 'unknown', error_message: `${UNKNOWN_MESSAGE} (stopped mid-publish)`, updated_at: new Date().toISOString() },
        { count: 'exact' },
      )
      .eq('status', 'publishing')
      .lt('updated_at', nonRenderCutoff);
    if (unknownError) {
      // 23514 until the migration allowing `unknown` is applied. Those rows stay
      // in `publishing`, which is never auto-retried either — the safe direction.
      console.warn(`${LOG_PREFIX} Could not mark stale publishing posts unknown: ${unknownError.message}`);
    }

    const { count: pendingStale } = await supabase
      .from('social_posts')
      .update(
        {
          status: 'failed',
          error_message: 'Stale — reaped after 15 min in non-terminal state',
          updated_at: new Date().toISOString(),
        },
        { count: 'exact' },
      )
      .eq('status', 'pending')
      .lt('updated_at', nonRenderCutoff);
    const nonRenderStale = (unknownStale || 0) + (pendingStale || 0);

    const { count: renderStale } = await supabase
      .from('social_posts')
      .update(
        {
          status: 'failed',
          error_message: 'Stale — render did not complete within 30 min',
          updated_at: new Date().toISOString(),
        },
        { count: 'exact' },
      )
      .eq('status', 'rendering')
      .lt('updated_at', renderCutoff);

    const total = (nonRenderStale || 0) + (renderStale || 0);
    if (total > 0) {
      console.log(`${LOG_PREFIX} Reaped ${total} stale records (${nonRenderStale || 0} non-render, ${renderStale || 0} render)`);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error reaping stale records:`, err);
  }

  // --- Process new scheduled posts ---
  try {
    const result = await getScheduledPosts({ skipTimeCheck });
    const scheduledPosts = result.posts;
    diagnostics = result.diagnostics;
    console.log(`${LOG_PREFIX} ${scheduledPosts.length} posts scheduled`);

    // Separate video and image posts
    const videoPosts = scheduledPosts.filter(p => p.mediaType === 'video');
    const imagePosts = scheduledPosts.filter(p => p.mediaType !== 'video' && p.postType !== 'daily_digest');
    const reportPosts = scheduledPosts.filter(p => p.postType === 'daily_digest');
    if (reportPosts.length) {
      try {
        const ctx = await buildPostContext(supabase, { postType: 'daily_digest' });
        if (ctx?.carousel) {
          const result = await dispatchDailyReport(ctx.carousel, reportPosts.map(p => p.platform), true);
          rendering += result.rendering;
          failed += Math.max(0, reportPosts.length - result.rendering);
          errors.push(...result.warnings);
        } else { skipped += reportPosts.length; }
      } catch (error) {
        failed += reportPosts.length;
        errors.push(`Daily Report: ${error instanceof Error ? error.message : 'Preparation failed'}`);
      }
    }

    // Float Picks use their destination's layout; other formats share a render.
    const videoGroups = new Map<string, ScheduledPost[]>();
    for (const post of videoPosts) {
      const key = videoRenderGroup(post.postType, post.riverSlug, post.platform);
      const group = videoGroups.get(key) || [];
      group.push(post);
      videoGroups.set(key, group);
    }

    for (const [groupKey, groupPosts] of Array.from(videoGroups.entries())) {
      const first = groupPosts[0];
      const readingContext = first.postType === 'river_highlight'
        ? await buildPostContext(supabase, { postType: 'river_highlight', riverSlug: first.riverSlug ?? undefined, eddyUpdateId: first.eddyUpdateId ?? undefined }) : null;
      if (first.postType === 'river_highlight' && !readingContext) { skipped += groupPosts.length; continue; }
      if (readingContext) {
        const { data: snippets } = await supabase.from('social_custom_content').select('*').eq('active', true);
        for (const post of groupPosts) {
          Object.assign(post, readingContext.caption(post.platform, snippets ?? []));
          post.imageUrl = readingContext.imageUrl(post.platform);
        }
      }

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const postIds: string[] = [];

      // Insert DB records for all platforms in this group
      for (const post of groupPosts) {
        const adapter = getAdapter(post.platform);
        if (!adapter) {
          console.log(`${LOG_PREFIX} No credentials for ${post.platform}, skipping`);
          skipped++;
          continue;
        }

        // Clear conflicting records
        let cleanup = supabase
          .from('social_posts')
          .delete()
          .eq('post_type', post.postType)
          .eq('platform', post.platform)
          .eq('auto_publish', true)
          .in('status', ['failed', 'pending'])
          .gte('created_at', todayStart.toISOString());
        if (post.postType === 'river_highlight') cleanup = cleanup.like('image_url', '%type=weekend-read&%');
        await cleanup;

        const { data: record, error: insertError } = await supabase
          .from('social_posts')
          .insert({
            post_type: post.postType,
            platform: post.platform,
            river_slug: post.riverSlug,
            caption: post.caption,
            image_url: post.imageUrl,
            media_type: 'video',
            hashtags: post.hashtags,
            eddy_update_id: post.eddyUpdateId,
            status: 'rendering',
          })
          .select('id')
          .single();

        if (insertError) {
          console.log(`${LOG_PREFIX} Dedup skip: ${post.postType}/${post.platform}/${post.riverSlug || 'global'} — ${insertError.message}`);
          skipped++;
          continue;
        }

        postIds.push(record.id);
      }

      if (postIds.length === 0) continue;

      // Dispatch one workflow for this content/destination group.
      const firstPost = groupPosts[0];
      try {
        const renderData = readingContext?.renderData ?? await buildRenderData(firstPost, supabase);
        const { compositionId, inputProps, outputFilename } = getCompositionForPost(
          firstPost.postType as Parameters<typeof getCompositionForPost>[0],
          renderData,
          firstPost.platform,
        );

        const dispatched = await triggerVideoRender({
          postIds: postIds.join(','),
          compositionId,
          inputProps,
          outputFilename,
        });

        if (dispatched) {
          rendering += postIds.length;
          console.log(`${LOG_PREFIX} Video render triggered for ${groupKey}: ${postIds.length} platform(s), IDs: ${postIds.join(',')}`);
        } else {
          // Dispatch failed — fall back to image for all. Surface the
          // dispatch failure on each row so a SQL query reveals "why is
          // everything posting as image" without needing log forensics.
          // Most common cause: GH_ACTIONS_TOKEN expired or lost scope.
          const fallbackReason = 'Video dispatch returned non-204 — fell back to image. Check GH_ACTIONS_TOKEN scope/expiry and that workflow render-social-video.yml exists on the configured ref.';
          console.error(`${LOG_PREFIX} GH Actions dispatch failed for ${groupKey}, falling back to image`);
          errors.push(`${groupKey}: ${fallbackReason}`);
          for (let i = 0; i < groupPosts.length; i++) {
            const post = groupPosts[i];
            const id = postIds[i];
            if (!id) continue;
            const adapter = getAdapter(post.platform);
            if (!adapter) continue;

            const { data: claimedFallback } = await supabase
              .from('social_posts')
              .update({
                media_type: 'image',
                status: 'publishing',
                error_message: fallbackReason,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id)
              .eq('status', 'rendering')
              .select('id');
            if (!claimedFallback?.length) continue;

            let pubResult: PublishResult;
            try {
              pubResult = await adapter.publishPost({
                caption: post.caption,
                imageUrl: post.imageUrl,
                mediaType: 'image',
                onProviderAttempt: providerAttemptRecorder(supabase, id),
              });
            } catch (err) {
              await writeOutcome(supabase, id, thrownFields(err));
              failed++;
              errors.push(`${post.platform}/${post.postType}: fallback publish — outcome unknown`);
              continue;
            }
            // Keep the fallback breadcrumb on success too — without it the
            // published image looks indistinguishable from an intentional image post.
            await writeOutcome(supabase, id, outcomeFields(pubResult, new Date(), { messageOnSuccess: fallbackReason }));

            if (pubResult.success) published++;
            else { failed++; errors.push(`${post.platform}/${post.postType}: fallback publish — ${pubResult.error}`); }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`${LOG_PREFIX} Video trigger error for ${groupKey}:`, msg);
        for (const id of postIds) {
          await supabase.from('social_posts').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', id);
        }
        failed += postIds.length;
        errors.push(`${groupKey}: ${msg}`);
      }
    }

    // ─── Image posts: publish inline ─────────────────────────
    for (const post of imagePosts) {
      const adapter = getAdapter(post.platform);
      if (!adapter) {
        console.log(`${LOG_PREFIX} No credentials for ${post.platform}, skipping`);
        skipped++;
        continue;
      }

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      await supabase
        .from('social_posts')
        .delete()
        .eq('post_type', post.postType)
        .eq('platform', post.platform)
        .eq('auto_publish', true)
          .in('status', ['failed', 'pending'])
        .gte('created_at', todayStart.toISOString());

      const { data: record, error: insertError } = await supabase
        .from('social_posts')
        .insert({
          post_type: post.postType,
          platform: post.platform,
          river_slug: post.riverSlug,
          caption: post.caption,
          image_url: post.imageUrl,
          media_type: 'image',
          hashtags: post.hashtags,
          eddy_update_id: post.eddyUpdateId,
          status: 'publishing',
        })
        .select('id')
        .single();

      if (insertError) {
        console.log(`${LOG_PREFIX} Dedup skip: ${post.postType}/${post.platform}/${post.riverSlug || 'global'} — ${insertError.message}`);
        skipped++;
        continue;
      }

      try {
        const pubResult = await adapter.publishPost({
          caption: post.caption,
          imageUrl: post.imageUrl,
          mediaType: 'image',
          onProviderAttempt: providerAttemptRecorder(supabase, record.id),
        });

        await writeOutcome(supabase, record.id, outcomeFields(pubResult));

        if (pubResult.success) {
          published++;
          console.log(`${LOG_PREFIX} Published to ${post.platform}: ${post.postType}/${post.riverSlug || 'digest'}`);
        } else {
          failed++;
          errors.push(`${post.platform}/${post.postType}: ${pubResult.error}`);
        }
      } catch (err) {
        // A throw from inside publishPost does not prove the platform refused it.
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await writeOutcome(supabase, record.id, thrownFields(err));
        failed++;
        errors.push(`${post.platform}/${post.postType}: outcome unknown — ${msg}`);
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error getting scheduled posts:`, err);
    errors.push(`Scheduling error: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // --- Settle posts whose outcome is unknown, where the platform can say ---
  let reconciled: { checked: number; published: number; failed: number } | undefined;
  try {
    if (getAdapter('instagram')) {
      reconciled = await reconcileUnknownPosts(supabase, getInstagramContainerStatus);
      if (reconciled.checked > 0) console.log(`${LOG_PREFIX} Reconciled unknown posts:`, reconciled);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error reconciling unknown posts:`, err);
  }

  // --- Retry failed posts ---
  //
  // Only DEFINITIVE failures reach here: getRetryablePosts reads `failed`, and
  // anything that may have published is `unknown`. Each retry CLAIMS its row
  // (failed → publishing, compare-and-swap) before calling the platform, the
  // same claim the admin retry route makes, so the two can never both publish.
  try {
    const retryable = await getRetryablePosts();
    console.log(`${LOG_PREFIX} ${retryable.length} posts eligible for retry`);

    for (const post of retryable) {
      const adapter = getAdapter(post.platform as SocialPlatform);
      if (!adapter) continue;

      const { data: fullPost } = await supabase.from('social_posts').select('*').eq('id', post.id).single();
      if (!fullPost || fullPost.status !== 'failed') continue;
      if (isDailyReport(fullPost.render_request) && !dailyReportAutoPublishEnabled()) continue;

      // The saved media, exactly as the admin retry uses it — never rebuilt.
      let media;
      try {
        media = savedPostMedia(fullPost);
      } catch (err) {
        console.log(`${LOG_PREFIX} Retry skipped for ${post.id}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      const { data: claimed } = await supabase
        .from('social_posts')
        .update({ status: 'publishing', retry_count: (fullPost.retry_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', post.id)
        .eq('status', 'failed')
        .select('id');
      if (!claimed?.length) continue; // someone else (the admin route) took it

      try {
        const pubResult = await adapter.publishPost({ ...media, onProviderAttempt: providerAttemptRecorder(supabase, post.id) });
        await writeOutcome(supabase, post.id, outcomeFields(pubResult));

        if (pubResult.success) {
          published++;
          // A clip Reel that only succeeds on retry must be linked back to its
          // clip, or it never shows as posted in the library (publishClip only
          // links posts that published synchronously).
          if (fullPost.post_type === 'river_highlight' && fullPost.video_url) {
            await linkClipPost(supabase, fullPost.video_url, post.id);
          }
          console.log(`${LOG_PREFIX} Retry succeeded: ${post.id}`);
        } else { failed++; }
      } catch (err) {
        await writeOutcome(supabase, post.id, thrownFields(err));
        failed++;
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error processing retries:`, err);
  }

  return NextResponse.json({
    message: 'Social media posting complete',
    published, failed, skipped, rendering,
    ...(reconciled ? { reconciled } : {}),
    errors: errors.length > 0 ? errors : undefined,
    diagnostics,
    executionTime: new Date().toISOString(),
  });
  } finally {
    await releaseCronLock(supabase, CRON_LOCK_NAME);
  }
}

async function handleGET(request: NextRequest) { return runSocialPosting(request); }
async function handlePOST(request: NextRequest) { return runSocialPosting(request); }

export const GET = withJobRun("post-social", handleGET);

export const POST = withJobRun("post-social", handlePOST);
