import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { withAdminMutation } from '@/lib/admin/mutation-audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchDamSummary } from '@/lib/data/dams';
import { triggerVideoRender } from '@/lib/social/video-renderer';
import { centralDayKey, nextDayKey } from '@shared/dam-schedule-copy';
import { DAM_STORY_ID, damStoryCaption, damStoryRender, damStorySnapshot, type DamStoryPlatform } from '@shared/social-dam-schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function load(date: string) {
  const now = Date.now();
  if (date !== centralDayKey(now) && date !== nextDayKey(centralDayKey(now))) throw new Error('Choose today or tomorrow in Central time.');
  const dam = await fetchDamSummary(DAM_STORY_ID, { scheduleDays: 2 });
  return damStorySnapshot(dam?.schedule.find(day => day.scheduleDate === date), date);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const today = centralDayKey();
  const date = request.nextUrl.searchParams.get('date') || today;
  try {
    const snapshot = await load(date);
    return NextResponse.json({ today, tomorrow: nextDayKey(today), snapshot, caption: damStoryCaption(snapshot) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ today, tomorrow: nextDayKey(today), error: error instanceof Error ? error.message : 'Could not check the schedule.' }, { status: 409 });
  }
}

async function handlePOST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.date !== 'string' || !Array.isArray(body.platforms) || !body.platforms.length || body.platforms.length > 2 || body.platforms.some((p: unknown) => p !== 'instagram' && p !== 'tiktok')) {
    return NextResponse.json({ error: 'Choose a date and Instagram Story, TikTok, or both.' }, { status: 400 });
  }
  // Never trust a preview snapshot sent by the browser. Read the source again.
  let snapshot;
  try { snapshot = await load(body.date); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check the schedule.' }, { status: 409 }); }
  const supabase = createAdminClient();
  const results: { platform: DamStoryPlatform; id?: string; error?: string }[] = [];
  for (const platform of new Set<DamStoryPlatform>(body.platforms)) {
    const render = damStoryRender(snapshot, platform);
    const { data, error } = await supabase.from('social_posts').insert({
      post_type: 'manual', platform, caption: damStoryCaption(snapshot), hashtags: [],
      media_type: 'video', status: 'rendering', auto_publish: false, render_request: render,
    }).select('id').single();
    if (error || !data) { results.push({ platform, error: 'Could not save the video request.' }); continue; }
    const dispatched = await triggerVideoRender({ ...render, postIds: data.id }).catch(() => false);
    if (!dispatched) {
      await supabase.from('social_posts').update({ status: 'failed', error_message: 'Could not create the video. Try again from Dam schedule video.' }).eq('id', data.id).eq('status', 'rendering');
    }
    results.push({ platform, id: data.id, ...(!dispatched && { error: 'Could not create the video.' }) });
  }
  logAdminAction({ request, action: 'dam_schedule_export', entityType: 'social_post', details: { date: snapshot.scheduleDate, results } });
  return NextResponse.json({ results }, { status: results.some(r => r.id && !r.error) ? 202 : 502 });
}

export const POST = withAdminMutation(handlePOST);
