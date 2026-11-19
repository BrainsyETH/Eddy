import { randomUUID } from 'node:crypto';
import { loadDamPost } from '@/lib/social/dam-story';
import { damStoryCaption, damStoryRender, isDamStory, isMeasuredReleaseVideo, storyDam } from '@shared/social-dam-schedule';
import { withAdminMutation } from '@/lib/admin/mutation-audit';

import { isDailyReport, reportIsCurrent } from '@/lib/social/daily-report';
// Review, retry publication, or rerender the saved composition without changing media type.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminIdentity, requireAdminAuth } from '@/lib/admin-auth';
import { getAdapter } from '@/lib/social/adapters';
import { triggerVideoRender, destinationRenderRequest } from '@/lib/social/video-renderer';
import { draftSendTime } from '@/lib/social/draft-time';
import { checkedMedia, sendReviewedPost } from '@/lib/social/send-reviewed';
import type { SocialPlatform } from '@/lib/social/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
async function handlePOST(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
  const action = body.action ?? 'retry';
  if (!['approve', 'retry', 'render', 'resolve', 'schedule', 'unschedule', 'regenerate'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const supabase = createAdminClient();
  const { data: post } = await supabase.from('social_posts').select('*').eq('id', body.id).single();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  const damRender = isDamStory(post.render_request) ? post.render_request : null;
  if (damRender && getAdminIdentity(request)?.role !== 'owner') {
    return NextResponse.json({ error: 'Only an owner can send a dam video.' }, { status: 403 });
  }
  if (['approve', 'retry', 'regenerate'].includes(action) && damRender && isMeasuredReleaseVideo(damRender) &&
      (body.expectedAttempt ?? null) !== (damRender.attemptId ?? null)) {
    return NextResponse.json({ error: 'A new version is available. Review it before continuing.' }, { status: 409 });
  }
  if (action === 'regenerate') {
    if (!damRender || !isMeasuredReleaseVideo(damRender) || !['review', 'failed'].includes(post.status) ||
        (post.platform !== 'instagram' && post.platform !== 'tiktok')) {
      return NextResponse.json({ error: 'This draft cannot be regenerated. Refresh the queue.' }, { status: 409 });
    }
    let snapshot;
    try { snapshot = await loadDamPost(storyDam(damRender.inputProps.snapshot).id); }
    catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 409 }); }
    if (snapshot.kind !== 'release') return NextResponse.json({ error: 'Measured release unavailable.' }, { status: 409 });
    const attemptId = randomUUID();
    const render = damStoryRender(snapshot, post.platform);
    const { data, error } = await supabase.from('social_posts').update({
      status: 'rendering', auto_publish: false, video_url: null, error_message: null, provider_attempt_id: null,
      caption: damStoryCaption(snapshot), render_request: { ...render, attemptId }, updated_at: new Date().toISOString(),
    }).eq('id', post.id).eq('status', post.status).eq('updated_at', post.updated_at).select('id');
    if (error || !data?.length) return NextResponse.json({ error: 'This draft changed. Refresh the queue.' }, { status: 409 });
    const dispatched = await triggerVideoRender({ ...render, postIds: post.id + ':' + attemptId }).catch(() => false);
    if (!dispatched) {
      await supabase.from('social_posts').update({ status: 'failed', error_message: 'Could not start rendering. Regenerate the draft again.' })
        .eq('id', post.id).eq('status', 'rendering').eq('render_request->>attemptId', attemptId);
      return NextResponse.json({ error: 'Could not start rendering. Regenerate the draft again.' }, { status: 502 });
    }
    return NextResponse.json({ success: true, rendering: true }, { status: 202 });
  }

  const expected = action === 'unschedule' ? 'scheduled' : action === 'approve' || action === 'schedule' ? 'review' : action === 'resolve' ? 'unknown' : 'failed';
  if (post.status !== expected) return NextResponse.json({ error: `Post is no longer ${expected}. Refresh its status.` }, { status: 409 });

  if (action === 'schedule' || action === 'unschedule') {
    let scheduledAt = null;
    if (action === 'schedule') {
      try {
        scheduledAt = draftSendTime(body.time, post.render_request);
        if (!getAdapter(post.platform as SocialPlatform)) throw new Error('Platform is not connected.');
        await checkedMedia(post);
      } catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }
    }
    const { data, error } = await supabase.from('social_posts').update({
      status: scheduledAt ? 'scheduled' : 'review', scheduled_at: scheduledAt, auto_publish: false, updated_at: new Date().toISOString(),
    }).eq('id', post.id).eq('status', expected).select('id');
    if (error || !data?.length) return NextResponse.json({ error: error?.message ?? 'Already handled. Refresh the queue.' }, { status: 409 });
    return NextResponse.json({ success: true, scheduledAt });
  }

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
    if (isDamStory(saved)) return NextResponse.json({ error: 'Create a new video to use the latest dam data.' }, { status: 409 });
    if (isDailyReport(saved)) {
      if (!reportIsCurrent(saved)) return NextResponse.json({ error: 'This Daily Report is out of date. Generate a new draft with current readings.' }, { status: 409 });
      const report = { ...saved, imageUrls: undefined };
      const { data, error } = await supabase.from('social_posts').update({ status: 'rendering', auto_publish: false, image_url: null, render_request: JSON.parse(JSON.stringify(report)), error_message: null, updated_at: new Date().toISOString() }).eq('id', post.id).eq('status', expected).select('id');
      if (error || !data?.length) return NextResponse.json({ error: 'Already handled' }, { status: 409 });
      const { triggerReportRender } = await import('@/lib/social/daily-report-dispatch');
      const dispatched = await triggerReportRender([post.id]).catch(() => false);
      if (!dispatched) await supabase.from('social_posts').update({ status: 'failed', error_message: 'Carousel render could not start' }).eq('id', post.id).eq('status', 'rendering');
      return NextResponse.json({ success: dispatched, rendering: dispatched }, { status: dispatched ? 200 : 502 });
    }
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

  const result = await sendReviewedPost(supabase, post, action === 'approve' ? 'review' : 'failed');
  return NextResponse.json(result.body, { status: result.status });
}

export const POST = withAdminMutation(handlePOST);
