// src/app/api/admin/social/video-callback/route.ts
// Webhook called by GitHub Actions after rendering a social video.
// Receives multiple post IDs (one per platform), publishes each.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import { hasMetaCredentials, hasInstagramCredentials } from '@/lib/social/meta-client';
import type { SocialPlatform, PlatformAdapter } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[VideoCallback]';

function getAdapter(platform: SocialPlatform): PlatformAdapter | null {
  if (platform === 'facebook' && hasMetaCredentials()) return new FacebookAdapter();
  if (platform === 'instagram' && hasInstagramCredentials()) return new InstagramAdapter();
  return null;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { postIds: postIdsRaw, videoUrl, status, error } = body as {
    postIds: string;       // Comma-separated IDs
    videoUrl?: string;
    status: 'rendered' | 'failed';
    error?: string;
  };

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

    // Handle render failure — fall back to image
    if (status === 'failed') {
      console.error(`${LOG_PREFIX} Render failed for ${postId} (${platform}): ${error}`);

      const adapter = getAdapter(platform);
      if (adapter && post.image_url) {
        console.log(`${LOG_PREFIX} Falling back to image for ${platform}: ${postId}`);
        const result = await adapter.publishPost({
          caption: post.caption,
          imageUrl: post.image_url,
          mediaType: 'image',
        });

        await supabase
          .from('social_posts')
          .update({
            status: result.success ? 'published' : 'failed',
            media_type: 'image',
            platform_post_id: result.platformPostId || null,
            published_at: result.success ? new Date().toISOString() : null,
            error_message: result.success ? null : `Video failed, image fallback: ${result.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', postId);

        results.push({ postId, platform, success: result.success, error: result.error });
      } else {
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: error || 'Video render failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', postId);
        results.push({ postId, platform, success: false, error: error || 'No adapter' });
      }
      continue;
    }

    // Handle successful render — publish the video
    if (!videoUrl) {
      results.push({ postId, platform, success: false, error: 'Missing videoUrl' });
      continue;
    }

    console.log(`${LOG_PREFIX} Publishing video to ${platform}: ${postId}`);

    // Update DB with video URL
    await supabase
      .from('social_posts')
      .update({
        video_url: videoUrl,
        status: 'publishing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

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
