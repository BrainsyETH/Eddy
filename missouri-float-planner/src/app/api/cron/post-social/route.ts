// src/app/api/cron/post-social/route.ts
// Cron job: publishes scheduled social media posts to Instagram and Facebook.
// Runs every 30 min via Vercel Cron.
//
// Image posts: published inline.
// Video posts: ONE render per video (both platforms share the same file).
//   Triggers GH Actions workflow → callback publishes to all platforms.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScheduledPosts, getRetryablePosts, type SchedulerResult } from '@/lib/social/post-scheduler';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import type { PlatformAdapter, SocialPlatform, ScheduledPost } from '@/lib/social/types';
import { triggerVideoRender, getCompositionForPost } from '@/lib/social/video-renderer';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { buildPostContext } from '@/lib/social/post-context';
import type { PostKind } from '@/lib/social/post-types';

const CRON_LOCK_NAME = 'post_social';
// Renders routinely take 5–9 min on GH Actions; give slack before another
// cron run is allowed to reclaim the lock.
const CRON_STALE_SECONDS = 30 * 60;

export const dynamic = 'force-dynamic';

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
  return ctx?.renderData ?? {};
}

function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
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
  // lookup would come back empty for long-running renders. Now: mark failed
  // and keep the row so the callback can still find and report it.
  try {
    const nonRenderCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    // 12s portrait reels usually render in 60-90s on ubuntu-latest. 10 min is
    // a generous ceiling; anything older than that is dead and the admin
    // retry button needs signal sooner than 30 min.
    const renderCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { count: nonRenderStale } = await supabase
      .from('social_posts')
      .update(
        {
          status: 'failed',
          error_message: 'Stale — reaped after 15 min in non-terminal state',
          updated_at: new Date().toISOString(),
        },
        { count: 'exact' },
      )
      .in('status', ['publishing', 'pending'])
      .lt('updated_at', nonRenderCutoff);

    const { count: renderStale } = await supabase
      .from('social_posts')
      .update(
        {
          status: 'failed',
          error_message: 'Stale — render did not complete within 10 min',
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
    const imagePosts = scheduledPosts.filter(p => p.mediaType !== 'video');

    // ─── Video posts: group by content, ONE render per group ──────
    // Same video for both platforms (both use portrait now)
    const videoGroups = new Map<string, ScheduledPost[]>();
    for (const post of videoPosts) {
      const key = `${post.postType}:${post.riverSlug || 'global'}`;
      const group = videoGroups.get(key) || [];
      group.push(post);
      videoGroups.set(key, group);
    }

    for (const [groupKey, groupPosts] of Array.from(videoGroups.entries())) {
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
        await supabase
          .from('social_posts')
          .delete()
          .eq('post_type', post.postType)
          .eq('platform', post.platform)
          .in('status', ['failed', 'publishing', 'pending'])
          .gte('created_at', todayStart.toISOString());

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

      // Dispatch ONE GH Actions workflow for all platforms
      const firstPost = groupPosts[0];
      try {
        const renderData = await buildRenderData(firstPost, supabase);
        const { compositionId, inputProps, outputFilename } = getCompositionForPost(
          firstPost.postType as Parameters<typeof getCompositionForPost>[0],
          renderData,
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

            await supabase
              .from('social_posts')
              .update({
                media_type: 'image',
                status: 'publishing',
                error_message: fallbackReason,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id);

            const pubResult = await adapter.publishPost({ caption: post.caption, imageUrl: post.imageUrl, mediaType: 'image' });

            await supabase
              .from('social_posts')
              .update({
                status: pubResult.success ? 'published' : 'failed',
                platform_post_id: pubResult.platformPostId || null,
                published_at: pubResult.success ? new Date().toISOString() : null,
                // Keep the fallback breadcrumb on success too — without it
                // the published image looks indistinguishable from an
                // intentional image post.
                error_message: pubResult.success ? fallbackReason : pubResult.error,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id);

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
        .in('status', ['failed', 'publishing', 'pending'])
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
        const pubResult = await adapter.publishPost({ caption: post.caption, imageUrl: post.imageUrl, mediaType: 'image' });

        await supabase
          .from('social_posts')
          .update({
            status: pubResult.success ? 'published' : 'failed',
            platform_post_id: pubResult.platformPostId || null,
            published_at: pubResult.success ? new Date().toISOString() : null,
            error_message: pubResult.success ? null : (pubResult.error || 'Unknown error'),
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        if (pubResult.success) {
          published++;
          console.log(`${LOG_PREFIX} Published to ${post.platform}: ${post.postType}/${post.riverSlug || 'digest'}`);
        } else {
          failed++;
          errors.push(`${post.platform}/${post.postType}: ${pubResult.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await supabase.from('social_posts').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', record.id);
        failed++;
        errors.push(`${post.platform}/${post.postType}: ${msg}`);
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error getting scheduled posts:`, err);
    errors.push(`Scheduling error: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // --- Retry failed posts ---
  try {
    const retryable = await getRetryablePosts();
    console.log(`${LOG_PREFIX} ${retryable.length} posts eligible for retry`);

    for (const post of retryable) {
      const adapter = getAdapter(post.platform as SocialPlatform);
      if (!adapter) continue;

      const { data: fullPost } = await supabase.from('social_posts').select('*').eq('id', post.id).single();
      if (!fullPost) continue;

      await supabase.from('social_posts').update({ status: 'publishing', retry_count: fullPost.retry_count + 1, updated_at: new Date().toISOString() }).eq('id', post.id);

      try {
        const pubResult = await adapter.publishPost({
          caption: fullPost.caption,
          imageUrl: fullPost.image_url,
          videoUrl: fullPost.video_url || undefined,
          coverUrl: fullPost.image_url || undefined,
          mediaType: fullPost.media_type || 'image',
        });

        await supabase.from('social_posts').update({
          status: pubResult.success ? 'published' : 'failed',
          platform_post_id: pubResult.platformPostId || null,
          published_at: pubResult.success ? new Date().toISOString() : null,
          error_message: pubResult.success ? null : (pubResult.error || 'Retry failed'),
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);

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
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await supabase.from('social_posts').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', post.id);
        failed++;
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error processing retries:`, err);
  }

  return NextResponse.json({
    message: 'Social media posting complete',
    published, failed, skipped, rendering,
    errors: errors.length > 0 ? errors : undefined,
    diagnostics,
    executionTime: new Date().toISOString(),
  });
  } finally {
    await releaseCronLock(supabase, CRON_LOCK_NAME);
  }
}

export async function GET(request: NextRequest) { return runSocialPosting(request); }
export async function POST(request: NextRequest) { return runSocialPosting(request); }
