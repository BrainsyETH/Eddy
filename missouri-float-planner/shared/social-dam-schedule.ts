import { centralDayKey, idleScheduleLabel, nextDayKey, scheduleDayLabel, scheduledGeneration, scheduleIsStale, readingStaleness, windowLabel } from './dam-schedule-copy';
import { forecastDays, forecastPlanStale } from './dam-forecast-copy';
import type { DamGenerationForecast, DamScheduleDay } from './dam-types';

export const DAM_STORY_COMPOSITION = 'social-dam-schedule';
// Drafts made before the dam picker were exclusively Table Rock schedules.
export const ORIGINAL_STORY_DAM = { id: 'swl-table-rock-dam', name: 'Table Rock Dam' };
export type StoryDam = { id: string; name: string };
export type DamPostKind = 'schedule' | 'forecast' | 'release';
export type DamPostOption = StoryDam & { kind: DamPostKind | 'unavailable' };

export type DamStoryPlatform = 'instagram' | 'tiktok';
interface DatedDamPost {
  scheduleDate: string;
  checkedAt: string;
}
export interface DamStorySnapshot extends DatedDamPost {
  kind?: 'schedule';
  dam?: StoryDam;
  /** Generation flags used by saved drafts and the schedule copy. */
  hours: boolean[];
  hourlyMw: number[];
  capacityMw: number | null;
  minimumFlow: boolean;
}
interface ForecastPost extends DatedDamPost {
  kind: 'forecast';
  dam: StoryDam;
  generating: boolean;
  windows: string[];
  source: string;
}
interface ReleasePost extends DatedDamPost {
  kind: 'release';
  dam: StoryDam;
  // Last 24 hourly discharge readings, ending at checkedAt (the observation time).
  hourlyCfs: (number | null)[];
  releaseCfs: number;
}
export type DamPostSnapshot = DamStorySnapshot | ForecastPost | ReleasePost;

export function storyDam(snapshot: DamPostSnapshot): StoryDam {
  if (snapshot?.dam?.id && snapshot.dam.name) return snapshot.dam;
  if (snapshot && snapshot.kind === undefined && snapshot.dam === undefined) return ORIGINAL_STORY_DAM;
  throw new Error('The draft is missing its dam. Create a new dam video.');
}

export type DamStoryProps = {
  snapshot: DamPostSnapshot;
  platform: DamStoryPlatform;
  /** Fixtures must remain visibly labelled in every frame. */
  sample?: boolean;
};

/** Export only a complete, recently checked today/tomorrow schedule. No fallback dates. */
export function damStorySnapshot(day: DamScheduleDay | undefined, date: string, now = Date.now(), capacityMw?: number, dam: StoryDam = ORIGINAL_STORY_DAM): DamStorySnapshot {
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
  return {
    kind: 'schedule', dam, scheduleDate: date,
    checkedAt: day.retrievedAt!,
    hours: hours.map(scheduledGeneration),
    hourlyMw: hours.map(hour => hour.megawatts),
    capacityMw: capacityMw !== undefined && Number.isFinite(capacityMw) && capacityMw > 0 ? capacityMw : null,
    minimumFlow: hours.some(h => h.minimumFlow === true),
  };
}

export function forecastStorySnapshot(dam: StoryDam, forecast: DamGenerationForecast | undefined, date: string, now: number): ForecastPost {
  const checked = Date.parse(forecast?.retrievedAt ?? '');
  if (!forecast || !Number.isFinite(checked) || checked > now + 300_000 || scheduleIsStale(forecast.retrievedAt, now) || forecastPlanStale(forecast.windows, now)) {
    throw new Error('A current generation forecast is unavailable.');
  }
  const day = forecastDays(forecast.windows, forecast.timeZone).find(day => day.dayKey === date);
  if (!day) throw new Error('There is no generation forecast for this date.');
  const generation = day.spans.filter(span => span.generating);
  const spans = generation.length ? generation : day.spans;
  return { kind: 'forecast', dam, scheduleDate: date, checkedAt: forecast.retrievedAt!,
    generating: generation.length > 0, windows: spans.map(span => span.label), source: forecast.source };
}

export function releaseStorySnapshot(dam: StoryDam, readings: { timestamp: number; dischargeCfs: number }[] | null, now: number): ReleasePost {
  const series = readings ?? [];
  const latest = series.at(-1);
  if (!latest || !Number.isFinite(latest.dischargeCfs) || latest.dischargeCfs < 0 ||
      latest.timestamp > now + 300_000 || readingStaleness(latest.timestamp, now) !== 'fresh') {
    throw new Error('A recent measured release is unavailable.');
  }
  const byTime = new Map(series.filter(r => Number.isFinite(r.dischargeCfs) && r.dischargeCfs >= 0).map(r => [r.timestamp, r.dischargeCfs]));
  const hourlyCfs = Array.from({ length: 24 }, (_, i) => byTime.get(latest.timestamp - (23 - i) * 3_600_000) ?? null);
  return { kind: 'release', dam, scheduleDate: centralDayKey(latest.timestamp), checkedAt: new Date(latest.timestamp).toISOString(),
    releaseCfs: latest.dischargeCfs, hourlyCfs };
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

export function damStorySummary(snapshot: DamPostSnapshot): string {
  if (snapshot.kind === 'release') return `Measured release: ${snapshot.releaseCfs.toLocaleString('en-US')} cfs`;
  if (snapshot.kind === 'forecast') return `${snapshot.generating ? 'Generation forecast:' : 'No generation forecast during'} ${snapshot.windows.join(', ')}`;
  const windows = damStoryWindows(snapshot.hours);
  return windows.length ? `Scheduled generation: ${windows.join(', ')}` : idleScheduleLabel(snapshot.minimumFlow);
}

export function damPostSource(snapshot: DamPostSnapshot): string {
  const stamp = new Date(snapshot.checkedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  if (snapshot.kind === 'release') return `Ameren Missouri · Observed ${stamp}`;
  return `${snapshot.kind === 'forecast' ? snapshot.source : 'SWPA schedule'} · Eddy checked ${stamp}`;
}

export function damStoryCaption(snapshot: DamPostSnapshot): string {
  const dam = storyDam(snapshot);
  let detail = damStorySummary(snapshot);
  if (snapshot.kind === 'release') detail += '. Total flow through all outlets.';
  else if (snapshot.kind === 'forecast') detail += '. Central time. Forecast can change.';
  else {
    const hasWindows = snapshot.hours.some(Boolean);
    detail += `.${hasWindows ? ' Central time.' : ''}${snapshot.minimumFlow && hasWindows ? '\nMinimum flow is also scheduled.' : ''}\nSchedule can change. Check before you go.`;
  }
  return `${dam.name} · ${scheduleDayLabel(snapshot.scheduleDate)} · ${snapshot.scheduleDate.slice(0, 4)}\n${detail}\n${damPostSource(snapshot)}.\nRiver levels can stay high after generation stops.\nhttps://eddy.guide/dams/${dam.id}`;
}

export function damStoryRender(snapshot: DamPostSnapshot, platform: DamStoryPlatform) {
  return {
    compositionId: DAM_STORY_COMPOSITION,
    inputProps: { snapshot, platform, sample: false } satisfies DamStoryProps,
    outputFilename: `${storyDam(snapshot).id}-${snapshot.kind ?? 'schedule'}-${snapshot.scheduleDate}-${platform === 'instagram' ? 'instagram-story' : 'tiktok'}-${Date.parse(snapshot.checkedAt)}`,
  };
}

const sampleHourlyMw = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 55, 115, 170, 230, 230, 170, 115, 55, 0, 0, 0, 0];
export const DAM_STORY_FIXTURE: DamStorySnapshot = {
  scheduleDate: '2026-11-09', checkedAt: '2026-11-09T16:00:00Z',
  hours: sampleHourlyMw.map(mw => mw > 0), hourlyMw: sampleHourlyMw,
  capacityMw: 230, minimumFlow: false,
};
