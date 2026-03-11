// src/app/api/cron/post-social/route.ts
// Cron job: publishes scheduled social media posts to Instagram and Facebook.
// Runs every 6 hours (offset 30 min from eddy-updates) via Vercel Cron.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScheduledPosts, getRetryablePosts, type SchedulerResult } from '@/lib/social/post-scheduler';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import type { PlatformAdapter, SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[SocialCron]';

function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) {
    return new FacebookAdapter();
  }
  if (platform === 'instagram' && hasInstagramCredentials()) {
    return new InstagramAdapter();
  }
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
  const errors: string[] = [];
  let diagnostics: SchedulerResult['diagnostics'] | undefined;

  // --- Process new scheduled posts ---
  try {
    const result = await getScheduledPosts({ skipTimeCheck });
    const scheduledPosts = result.posts;
    diagnostics = result.diagnostics;
    console.log(`${LOG_PREFIX} ${scheduledPosts.length} posts scheduled`);

    // Process sequentially to avoid rate limits.
    // Each ScheduledPost already has a platform — no inner loop needed.
    for (const post of scheduledPosts) {
      const adapter = getAdapter(post.platform);
      if (!adapter) {
        console.log(`${LOG_PREFIX} No credentials for ${post.platform}, skipping`);
        skipped++;
        continue;
      }

      // Insert pending record
      const { data: record, error: insertError } = await supabase
        .from('social_posts')
        .insert({
          post_type: post.postType,
          platform: post.platform,
          river_slug: post.riverSlug,
          caption: post.caption,
          image_url: post.imageUrl,
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
        const result = await adapter.publishPost({
          caption: post.caption,
          imageUrl: post.imageUrl,
        });

        if (result.success) {
          await supabase
            .from('social_posts')
            .update({
              status: 'published',
              platform_post_id: result.platformPostId || null,
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', record.id);

          published++;
          console.log(`${LOG_PREFIX} Published to ${post.platform}: ${post.postType}/${post.riverSlug || 'digest'}`);
        } else {
          await supabase
            .from('social_posts')
            .update({
              status: 'failed',
              error_message: result.error || 'Unknown error',
              updated_at: new Date().toISOString(),
            })
            .eq('id', record.id);

          failed++;
          errors.push(`${post.platform}/${post.postType}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

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

      // Fetch the full post record
      const { data: fullPost } = await supabase
        .from('social_posts')
        .select('*')
        .eq('id', post.id)
        .single();

      if (!fullPost) continue;

      await supabase
        .from('social_posts')
        .update({
          status: 'publishing',
          retry_count: fullPost.retry_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      try {
        const result = await adapter.publishPost({
          caption: fullPost.caption,
          imageUrl: fullPost.image_url,
        });

        if (result.success) {
          await supabase
            .from('social_posts')
            .update({
              status: 'published',
              platform_post_id: result.platformPostId || null,
              published_at: new Date().toISOString(),
              error_message: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);

          published++;
          console.log(`${LOG_PREFIX} Retry succeeded: ${post.id}`);
        } else {
          await supabase
            .from('social_posts')
            .update({
              status: 'failed',
              error_message: result.error || 'Retry failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);

          failed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        failed++;
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error processing retries:`, err);
  }

  return NextResponse.json({
    message: 'Social media posting complete',
    published,
    failed,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    diagnostics,
    executionTime: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return runSocialPosting(request);
}

export async function POST(request: NextRequest) {
  return runSocialPosting(request);
}
