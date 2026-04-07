// src/app/api/admin/social/video-callback/route.ts
// Webhook called by GitHub Actions after rendering a social video.
// Updates the social_posts record with the video URL and publishes it.

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
  // Authenticate with CRON_SECRET (same token the cron and GH Actions share)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { postId, videoUrl, status, error } = body as {
    postId: string;
    videoUrl?: string;
    status: 'rendered' | 'failed';
    error?: string;
  };

  if (!postId) {
    return NextResponse.json({ error: 'Missing postId' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the post record
  const { data: post, error: fetchError } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (fetchError || !post) {
    console.error(`${LOG_PREFIX} Post not found: ${postId}`);
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Handle render failure — fall back to image posting
  if (status === 'failed') {
    console.error(`${LOG_PREFIX} Render failed for ${postId}: ${error}`);

    // Fall back to publishing with the static image
    const adapter = getAdapter(post.platform as SocialPlatform);
    if (adapter && post.image_url) {
      console.log(`${LOG_PREFIX} Falling back to image post for ${postId}`);
      const result = await adapter.publishPost({
        caption: post.caption,
        imageUrl: post.image_url,
        mediaType: 'image',
      });

      await supabase
        .from('social_posts')
        .update({
          status: result.success ? 'published' : 'failed',
          media_type: 'image', // downgraded from video
          platform_post_id: result.platformPostId || null,
          published_at: result.success ? new Date().toISOString() : null,
          error_message: result.success ? null : `Video render failed, image fallback: ${result.error}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      return NextResponse.json({
        message: result.success ? 'Fallback image published' : 'Fallback also failed',
        success: result.success,
      });
    }

    // No adapter or no image URL — just mark as failed
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        error_message: error || 'Video render failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return NextResponse.json({ message: 'Marked as failed', success: false });
  }

  // Handle successful render — publish the video
  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing videoUrl for rendered status' }, { status: 400 });
  }

  console.log(`${LOG_PREFIX} Video ready for ${postId}: ${videoUrl}`);

  // Update DB with video URL
  await supabase
    .from('social_posts')
    .update({
      video_url: videoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  // Publish to the platform
  const adapter = getAdapter(post.platform as SocialPlatform);
  if (!adapter) {
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        error_message: `No credentials for ${post.platform}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return NextResponse.json({ error: `No adapter for ${post.platform}` }, { status: 500 });
  }

  const result = await adapter.publishPost({
    caption: post.caption,
    videoUrl,
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

  console.log(
    `${LOG_PREFIX} ${result.success ? 'Published' : 'Failed'} video to ${post.platform}: ${postId}`
  );

  return NextResponse.json({
    message: result.success ? 'Video published' : 'Publish failed',
    success: result.success,
    error: result.error,
  });
}
