// Review, retry publication, or rerender the saved composition without changing media type.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getAdapter } from '@/lib/social/adapters';
import { triggerVideoRender, destinationRenderRequest } from '@/lib/social/video-renderer';
import { savedPostMedia } from '@/lib/social/review';
import type { SocialPlatform } from '@/lib/social/types';
import { outcomeFields, providerAttemptRecorder, thrownFields } from '@/lib/social/publish-outcome';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  const action = body.action ?? 'retry';
  if (!['approve', 'retry', 'render', 'resolve'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const supabase = createAdminClient();
  const { data: post } = await supabase.from('social_posts').select('*').eq('id', body.id).single();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  const expected = action === 'approve' ? 'review' : action === 'resolve' ? 'unknown' : 'failed';
  if (post.status !== expected) return NextResponse.json({ error: `Post is no longer ${expected}. Refresh its status.` }, { status: 409 });

  // An admin settling an `unknown` post after checking the account. "Not
  // posted" moves it to failed, which is what makes a retry possible; nothing
  // here ever publishes.
  if (action === 'resolve') {
    if (body.outcome !== 'published' && body.outcome !== 'failed') {
      return NextResponse.json({ error: 'outcome must be published or failed' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { data: resolved, error } = await supabase.from('social_posts')
      .update(body.outcome === 'published'
        ? { status: 'published', published_at: now, error_message: 'Confirmed live by an admin.', updated_at: now }
        : { status: 'failed', error_message: 'Confirmed not posted by an admin; safe to retry.', updated_at: now })
      .eq('id', post.id).eq('status', 'unknown').select('id');
    if (error || !resolved?.length) return NextResponse.json({ error: error?.message ?? 'Already handled' }, { status: 409 });
    return NextResponse.json({ success: true, status: body.outcome });
  }

  if (action === 'render') {
    const saved = post.render_request;
    if (post.media_type !== 'video' || !saved?.compositionId || !saved.inputProps || !saved.outputFilename) {
      return NextResponse.json({ error: 'This older post has no saved render. Generate a new draft; the original remains in history.' }, { status: 409 });
    }
    const render = destinationRenderRequest(saved, post.platform as SocialPlatform);
    const { data: claimed, error } = await supabase.from('social_posts')
      .update({ status: 'rendering', auto_publish: false, video_url: null, render_request: render, error_message: null, updated_at: new Date().toISOString() })
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
    const result = await adapter.publishPost({ ...media, onProviderAttempt: providerAttemptRecorder(supabase, post.id) });
    // An ambiguous failure is recorded as `unknown`, never `failed`: see publish-outcome.ts.
    const { error } = await supabase.from('social_posts').update(outcomeFields(result)).eq('id', post.id).eq('status', 'publishing');
    // A successful platform call with a failed receipt must never encourage an immediate repost.
    if (error) return NextResponse.json({ error: 'Could not save the delivery receipt. Check the platform before retrying.' }, { status: 502 });
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    // A throw does not prove the platform refused the post.
    const message = error instanceof Error ? error.message : 'Publishing failed';
    await supabase.from('social_posts').update(thrownFields(error)).eq('id', post.id).eq('status', 'publishing');
    return NextResponse.json({ error: `Outcome unknown — check the account before retrying. (${message})` }, { status: 502 });
  }
}
