import { randomUUID } from 'node:crypto';
import { centralDayKey, nextDayKey } from '@shared/dam-schedule-copy';
import { DamSourceUnavailable, damStoryCaption, damStoryRender, damStorySnapshot, forecastStorySnapshot, isDamStory, releaseStorySnapshot, storyDam, type DamPostOption } from '@shared/social-dam-schedule';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';
import { triggerVideoRender } from './video-renderer';
import { fetchOsageReadings } from '@/lib/ameren/osage';
import { readForecast, readSchedule } from '@/lib/data/dams';
import { hasPowerhouse, USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { SWPA_PROJECTS } from '@/lib/usace/swpa';

export const damPostOptions: DamPostOption[] = Object.values(USACE_DAMS)
  .filter(hasPowerhouse)
  .map((dam): DamPostOption => ({
    id: dam.id, name: dam.name,
    kind: dam.swpaCode ? 'schedule' : dam.series.generationForecast ? 'forecast' : dam.amerenMetrics === 'osage' ? 'release' : 'unavailable',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** A source that throws is as unreadable as one that returns nothing. */
async function read<T>(source: Promise<T>): Promise<T> {
  try { return await source; }
  catch { throw new DamSourceUnavailable('Could not reach the dam data source. Try again later.'); }
}

export async function loadDamPost(damId: string, date?: string) {
  const option = damPostOptions.find(dam => dam.id === damId);
  if (!option) throw new Error('Choose a dam with a powerhouse.');
  const { id, name } = option;
  const dam = { id, name };
  const entry = USACE_DAMS[id];
  const now = Date.now();
  const today = centralDayKey(now);
  if (option.kind === 'release') {
    if (date !== undefined) throw new Error('Choose the latest measured release for this dam.');
    return releaseStorySnapshot(dam, await read(fetchOsageReadings()), now);
  }
  const day = date ?? today;
  if (day !== today && day !== nextDayKey(today)) throw new Error('Choose today or tomorrow in Central time.');
  if (option.kind === 'forecast') return forecastStorySnapshot(dam, await read(readForecast(entry)), day, now);
  if (!entry.swpaCode) throw new Error('Eddy has no generation data for this powerhouse yet.');
  const schedule = await read(readSchedule(entry, 2));
  return damStorySnapshot(schedule.find(s => s.scheduleDate === day), day, now, SWPA_PROJECTS[entry.swpaCode]?.capacityMw, dam);
}

type Post = Database['public']['Tables']['social_posts']['Row'];
type Client = ReturnType<typeof createAdminClient>;

/**
 * Render the same row again from the source as it reads now. Only the render
 * dispatched here may complete it. A timed post keeps its send time, so the
 * new video goes out when it is ready; a draft returns to review.
 */
export async function regenerateDamPost(db: Client, post: Post, from: 'review' | 'failed' | 'scheduled'): Promise<{ ok: true } | { ok: false; error: string }> {
  const saved = isDamStory(post.render_request) ? post.render_request.inputProps?.snapshot : null;
  if (!saved || (post.platform !== 'instagram' && post.platform !== 'tiktok')) return { ok: false, error: 'This draft cannot be regenerated. Refresh the queue.' };
  let snapshot;
  try { snapshot = await loadDamPost(storyDam(saved).id, saved.kind === 'release' ? undefined : saved.scheduleDate); }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Could not check the dam data.' }; }
  if ((snapshot.kind ?? 'schedule') !== (saved.kind ?? 'schedule')) return { ok: false, error: 'The dam or source has changed. Create a new dam video.' };
  const attemptId = randomUUID();
  const render = damStoryRender(snapshot, post.platform);
  const { data, error } = await db.from('social_posts').update({
    status: 'rendering', auto_publish: false, video_url: null, error_message: null, provider_attempt_id: null,
    caption: damStoryCaption(snapshot), render_request: { ...render, attemptId },
    ...(from !== 'scheduled' && { scheduled_at: null }), updated_at: new Date().toISOString(),
  }).eq('id', post.id).eq('status', from).eq('updated_at', post.updated_at).select('id');
  if (error || !data?.length) return { ok: false, error: 'This draft changed. Refresh the queue.' };
  const dispatched = await triggerVideoRender({ ...render, postIds: post.id + ':' + attemptId }).catch(() => false);
  if (!dispatched) {
    const message = 'Could not start rendering. Regenerate the draft again.';
    await db.from('social_posts').update({ status: 'failed', error_message: message })
      .eq('id', post.id).eq('status', 'rendering').eq('render_request->>attemptId', attemptId);
    return { ok: false, error: message };
  }
  return { ok: true };
}
