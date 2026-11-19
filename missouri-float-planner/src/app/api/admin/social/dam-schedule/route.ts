import { NextRequest, NextResponse } from 'next/server';
import { getAdminIdentity, requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { withAdminMutation } from '@/lib/admin/mutation-audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadDamPost, damPostOptions } from '@/lib/social/dam-story';
import { triggerVideoRender } from '@/lib/social/video-renderer';
import { getAdapter } from '@/lib/social/adapters';
import { draftSendTime } from '@/lib/social/draft-time';
import { centralDayKey, nextDayKey } from '@shared/dam-schedule-copy';
import { damStoryCaption, damStoryRender, type DamStoryPlatform } from '@shared/social-dam-schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const today = centralDayKey();
  if (request.nextUrl.searchParams.has('catalog')) return NextResponse.json({ dams: damPostOptions });
  const id = request.nextUrl.searchParams.get('damId');
  if (!id) return NextResponse.json({ error: 'Choose a dam.' }, { status: 400 });
  const date = request.nextUrl.searchParams.get('date') ?? undefined;
  try {
    const snapshot = await loadDamPost(id, date);
    return NextResponse.json({ today, tomorrow: nextDayKey(today), snapshot, caption: damStoryCaption(snapshot) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ today, tomorrow: nextDayKey(today), error: error instanceof Error ? error.message : 'Could not check the dam data.' }, { status: 409 });
  }
}

async function handlePOST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.damId !== 'string' || (body.date !== undefined && typeof body.date !== 'string') || !Array.isArray(body.platforms) || !body.platforms.length || body.platforms.length > 2 || body.platforms.some((p: unknown) => p !== 'instagram' && p !== 'tiktok')) {
    return NextResponse.json({ error: 'Choose a dam and Instagram Story, TikTok, or both.' }, { status: 400 });
  }
  // Never trust a preview snapshot sent by the browser. Read the source again.
  let snapshot;
  try { snapshot = await loadDamPost(body.damId, body.date); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check the dam data.' }, { status: 409 }); }
  // A send time approves the video before anyone has seen it, so it is the owner's to give.
  // The publisher reads the source again when the time comes.
  let scheduledAt: string | null = null;
  if (body.sendAt !== undefined) {
    if (getAdminIdentity(request)?.role !== 'owner') return NextResponse.json({ error: 'Only an owner can send a dam video.' }, { status: 403 });
    try { scheduledAt = draftSendTime(body.sendAt, damStoryRender(snapshot, 'instagram')); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  }
  const supabase = createAdminClient();
  const results: { platform: DamStoryPlatform; id?: string; error?: string }[] = [];
  for (const platform of new Set<DamStoryPlatform>(body.platforms)) {
    if (scheduledAt && !getAdapter(platform)) { results.push({ platform, error: 'Platform is not connected.' }); continue; }
    const render = damStoryRender(snapshot, platform);
    const { data, error } = await supabase.from('social_posts').insert({
      post_type: 'manual', platform, caption: damStoryCaption(snapshot), hashtags: [],
      media_type: 'video', status: 'rendering', auto_publish: false, render_request: render, scheduled_at: scheduledAt,
    }).select('id').single();
    if (error || !data) { results.push({ platform, error: 'Could not save the video request.' }); continue; }
    const dispatched = await triggerVideoRender({ ...render, postIds: data.id }).catch(() => false);
    if (!dispatched) {
      await supabase.from('social_posts').update({ status: 'failed', error_message: 'Could not create the video. Try again from Dam generation video.' }).eq('id', data.id).eq('status', 'rendering');
    }
    results.push({ platform, id: data.id, ...(!dispatched && { error: 'Could not create the video.' }) });
  }
  logAdminAction({ request, action: 'dam_schedule_export', entityType: 'social_post', details: { damId: body.damId, kind: snapshot.kind, date: snapshot.scheduleDate, scheduledAt, results } });
  return NextResponse.json({ results, scheduledAt }, { status: results.some(r => r.id && !r.error) ? 202 : 502 });
}

export const POST = withAdminMutation(handlePOST);
