import { centralDayKey, idleScheduleLabel, nextDayKey, scheduleDayLabel, scheduledGeneration, scheduleIsStale, windowLabel } from './dam-schedule-copy';
import type { DamScheduleDay } from './dam-types';

export const DAM_STORY_COMPOSITION = 'social-dam-schedule';
export const DAM_STORY_ID = 'swl-table-rock-dam';
export type DamStoryPlatform = 'instagram' | 'tiktok';
export interface DamStorySnapshot {
  scheduleDate: string;
  checkedAt: string;
  hours: boolean[];
  minimumFlow: boolean;
}
export type DamStoryProps = {
  snapshot: DamStorySnapshot;
  platform: DamStoryPlatform;
  /** Fixtures must remain visibly labelled in every frame. */
  sample?: boolean;
};

/** Export only a complete, recently checked today/tomorrow schedule. No fallback dates. */
export function damStorySnapshot(day: DamScheduleDay | undefined, date: string, now = Date.now()): DamStorySnapshot {
  const today = centralDayKey(now);
  if (date !== today && date !== nextDayKey(today)) throw new Error('Choose today or tomorrow in Central time.');
  if (!day || day.scheduleDate !== date) throw new Error('The generation schedule for this date has not been posted.');
  const checked = Date.parse(day.retrievedAt ?? '');
  if (!Number.isFinite(checked) || checked > now + 300_000 || scheduleIsStale(day.retrievedAt, now)) {
    throw new Error('The schedule needs a new check before you can make a video. Try again later.');
  }
  const hours = [...day.hours].sort((a, b) => a.hourEnding - b.hourEnding);
  if (hours.length !== 24 || hours.some((hour, index) => hour.hourEnding !== index + 1 || !Number.isFinite(hour.megawatts) || hour.megawatts < 0)) {
    throw new Error('The schedule is incomplete. Try again later.');
  }
  return { scheduleDate: date, checkedAt: day.retrievedAt!, hours: hours.map(scheduledGeneration), minimumFlow: hours.some(h => h.minimumFlow === true) };
}

/** This is a tag check, deliberately also rejecting malformed exports at publish boundaries. */
export function isDamStory(render: unknown): render is { compositionId: typeof DAM_STORY_COMPOSITION; inputProps: DamStoryProps; outputFilename: string } {
  return !!render && typeof render === 'object' && 'compositionId' in render && render.compositionId === DAM_STORY_COMPOSITION;
}

export function damStoryWindows(hours: boolean[]): string[] {
  const windows: string[] = [];
  for (let index = 0; index < 24; index++) {
    if (!hours[index]) continue;
    const start = index;
    while (index < 23 && hours[index + 1]) index++;
    windows.push(windowLabel(start + 1, index + 1, { compact: true }));
  }
  return windows;
}

export function damStorySummary(snapshot: DamStorySnapshot): string {
  const windows = damStoryWindows(snapshot.hours);
  return windows.length ? `Scheduled generation: ${windows.join(', ')}` : idleScheduleLabel(snapshot.minimumFlow);
}

export function damStoryCaption(snapshot: DamStorySnapshot): string {
  const windows = damStoryWindows(snapshot.hours);
  const checked = new Date(snapshot.checkedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return `Table Rock Dam · ${scheduleDayLabel(snapshot.scheduleDate)} · ${snapshot.scheduleDate.slice(0, 4)}\n${damStorySummary(snapshot)}.${windows.length ? ' Central time.' : ''}${snapshot.minimumFlow && windows.length ? '\nMinimum flow is also scheduled.' : ''}\nSWPA schedule · Eddy checked ${checked}.\nSchedule can change. Check before you go.\nRiver levels can stay high after generation stops.\nhttps://eddy.guide/dams/${DAM_STORY_ID}`;
}

export function damStoryRender(snapshot: DamStorySnapshot, platform: DamStoryPlatform) {
  return {
    compositionId: DAM_STORY_COMPOSITION,
    inputProps: { snapshot, platform, sample: false } satisfies DamStoryProps,
    outputFilename: `table-rock-${snapshot.scheduleDate}-${platform === 'instagram' ? 'instagram-story' : 'tiktok'}-${Date.parse(snapshot.checkedAt)}`,
  };
}

export const DAM_STORY_FIXTURE: DamStorySnapshot = {
  scheduleDate: '2026-11-09', checkedAt: '2026-11-09T16:00:00Z',
  hours: Array.from({ length: 24 }, (_, hour) => hour >= 12 && hour < 20), minimumFlow: false,
};
