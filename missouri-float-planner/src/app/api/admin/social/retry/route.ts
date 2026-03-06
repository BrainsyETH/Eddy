// src/app/api/admin/social/retry/route.ts
// POST to manually retry a failed social media post

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { FacebookAdapter } from '@/lib/social/facebook-adapter';
import { InstagramAdapter } from '@/lib/social/instagram-adapter';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const postId = body.id;

  if (!postId) {
    return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: post } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'failed') {
    return NextResponse.json({ error: 'Only failed posts can be retried' }, { status: 400 });
  }

  const adapter = post.platform === 'facebook'
    ? new FacebookAdapter()
    : new InstagramAdapter();

  // Mark as publishing
  await supabase
    .from('social_posts')
    .update({
      status: 'publishing',
      retry_count: post.retry_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  try {
    const result = await adapter.publishPost({
      caption: post.caption,
      imageUrl: post.image_url,
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
        .eq('id', postId);

      return NextResponse.json({ success: true, platformPostId: result.platformPostId });
    } else {
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: result.error || 'Retry failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);

      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
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
      .eq('id', postId);

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
