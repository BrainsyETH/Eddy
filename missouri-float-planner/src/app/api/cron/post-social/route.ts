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

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[SocialCron]';

/** Truncate text to ~120 chars for video teaser (full text goes in caption) */
function truncateForVideo(text: string | null): string {
  if (!text) return '';
  if (text.length <= 120) return text;
  const truncated = text.slice(0, 120);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 80 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildRenderData(post: ScheduledPost, supabase: any) {
  if (post.postType === 'daily_digest') {
    const { data: updates } = await supabase
      .from('eddy_updates')
      .select('river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
      .neq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false });

    const seen = new Set<string>();
    const rivers = (updates || [])
      .filter((u: { river_slug: string }) => {
        if (seen.has(u.river_slug)) return false;
        seen.add(u.river_slug);
        return true;
      })
      .map((u: { river_slug: string; condition_code: string; gauge_height_ft: number | null }) => ({
        riverName: u.river_slug
          .split('-')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        conditionCode: u.condition_code,
        gaugeHeightFt: u.gauge_height_ft,
      }));

    const { data: globalUpdate } = await supabase
      .from('eddy_updates')
      .select('quote_text')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      rivers,
      dateLabel: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      globalQuote: globalUpdate?.quote_text || undefined,
    };
  }

  if (post.eddyUpdateId) {
    const { data: update } = await supabase
      .from('eddy_updates')
      .select('river_slug, condition_code, gauge_height_ft, quote_text, summary_text')
      .eq('id', post.eddyUpdateId)
      .single();

    if (update) {
      let optimalMin = 1.5;
      let optimalMax = 4.0;
      const { data: gauge } = await supabase
        .from('river_gauges')
        .select('level_optimal_min, level_optimal_max')
        .eq('river_id', update.river_slug)
        .eq('is_primary', true)
        .maybeSingle();

      if (gauge) {
        optimalMin = gauge.level_optimal_min ?? optimalMin;
        optimalMax = gauge.level_optimal_max ?? optimalMax;
      }

      return {
        riverName: update.river_slug
          .split('-')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        conditionCode: update.condition_code,
        gaugeHeightFt: update.gauge_height_ft,
        optimalMin,
        optimalMax,
        quoteText: truncateForVideo(update.quote_text),
        summaryText: truncateForVideo(update.summary_text),
      };
    }
  }

  return {};
}

function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
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

  let published = 0;
  let failed = 0;
  let skipped = 0;
  let rendering = 0;
  const errors: string[] = [];
  let diagnostics: SchedulerResult['diagnostics'] | undefined;

  // --- Clean up stale records ---
  try {
    const cleanupStart = new Date();
    cleanupStart.setUTCHours(0, 0, 0, 0);
    const { count: cleanedUp } = await supabase
      .from('social_posts')
      .delete({ count: 'exact' })
      .in('status', ['publishing', 'pending', 'rendering'])
      .gte('created_at', cleanupStart.toISOString())
      .lt('updated_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (cleanedUp && cleanedUp > 0) {
      console.log(`${LOG_PREFIX} Cleaned up ${cleanedUp} stale records`);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error cleaning stale records:`, err);
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
          firstPost.postType as 'daily_digest' | 'river_highlight' | 'branded_loop',
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
          // Dispatch failed — fall back to image for all
          console.error(`${LOG_PREFIX} GH Actions dispatch failed for ${groupKey}, falling back to image`);
          for (let i = 0; i < groupPosts.length; i++) {
            const post = groupPosts[i];
            const id = postIds[i];
            if (!id) continue;
            const adapter = getAdapter(post.platform);
            if (!adapter) continue;

            await supabase
              .from('social_posts')
              .update({ media_type: 'image', status: 'publishing', updated_at: new Date().toISOString() })
              .eq('id', id);

            const pubResult = await adapter.publishPost({ caption: post.caption, imageUrl: post.imageUrl, mediaType: 'image' });

            await supabase
              .from('social_posts')
              .update({
                status: pubResult.success ? 'published' : 'failed',
                platform_post_id: pubResult.platformPostId || null,
                published_at: pubResult.success ? new Date().toISOString() : null,
                error_message: pubResult.success ? null : pubResult.error,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id);

            if (pubResult.success) published++;
            else { failed++; errors.push(`${post.platform}/${post.postType}: fallback — ${pubResult.error}`); }
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

        if (pubResult.success) { published++; console.log(`${LOG_PREFIX} Retry succeeded: ${post.id}`); }
        else { failed++; }
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
}

export async function GET(request: NextRequest) { return runSocialPosting(request); }
export async function POST(request: NextRequest) { return runSocialPosting(request); }
