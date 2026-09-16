// Review, retry publication, or rerender the saved composition without changing media type.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getAdapter } from '@/lib/social/adapters';
import { triggerVideoRender } from '@/lib/social/video-renderer';
import { savedPostMedia } from '@/lib/social/review';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  const action = body.action ?? 'retry';
  if (!['approve', 'retry', 'render'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const supabase = createAdminClient();
  const { data: post } = await supabase.from('social_posts').select('*').eq('id', body.id).single();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  const expected = action === 'approve' ? 'review' : 'failed';
  if (post.status !== expected) return NextResponse.json({ error: `Post is no longer ${expected}. Refresh its status.` }, { status: 409 });

  if (action === 'render') {
    const render = post.render_request;
    if (post.media_type !== 'video' || !render?.compositionId || !render.inputProps || !render.outputFilename) {
      return NextResponse.json({ error: 'This older post has no saved render. Generate a new draft; the original remains in history.' }, { status: 409 });
    }
    const { data: claimed, error } = await supabase.from('social_posts')
      .update({ status: 'rendering', auto_publish: false, video_url: null, error_message: null, updated_at: new Date().toISOString() })
      .eq('id', post.id).eq('status', expected).select('id');
    if (error || !claimed?.length) return NextResponse.json({ error: error?.message ?? 'Already handled' }, { status: 409 });
    try {
      if (!await triggerVideoRender({ ...render, postIds: post.id })) throw new Error('Render could not be started. Try again.');
      return NextResponse.json({ success: true, rendering: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Render failed';
      await supabase.from('social_posts').update({ status: 'failed', error_message: message }).eq('id', post.id).eq('status', 'rendering');
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  let media;
  try { media = savedPostMedia(post); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }); }
  const adapter = getAdapter(post.platform as SocialPlatform);
  if (!adapter) return NextResponse.json({ error: 'Platform is not connected' }, { status: 400 });
  const { data: claimed, error: claimError } = await supabase.from('social_posts')
    .update({ status: 'publishing', retry_count: (post.retry_count ?? 0) + (action === 'retry' ? 1 : 0), updated_at: new Date().toISOString() })
    .eq('id', post.id).eq('status', expected).select('id');
  if (claimError || !claimed?.length) return NextResponse.json({ error: claimError?.message ?? 'Already handled' }, { status: 409 });
  try {
    const result = await adapter.publishPost(media);
    const { error } = await supabase.from('social_posts').update({
      status: result.success ? (result.delivery ?? 'published') : 'failed',
      platform_post_id: result.platformPostId ?? null,
      published_at: result.success && result.delivery !== 'inbox' ? new Date().toISOString() : null,
      error_message: result.success ? null : result.error ?? 'Publishing failed', updated_at: new Date().toISOString(),
    }).eq('id', post.id).eq('status', 'publishing');
    // A successful platform call with a failed receipt must never encourage an immediate repost.
    if (error) return NextResponse.json({ error: 'Could not save the delivery receipt. Check the platform before retrying.' }, { status: 502 });
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publishing failed';
    await supabase.from('social_posts').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', post.id).eq('status', 'publishing');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
