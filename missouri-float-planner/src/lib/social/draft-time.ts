import { centralWallClockToUtc } from '@/lib/ameren/osage';
import { getLocalDateKey } from './local-time';
import { isDailyReport, reportIsCurrent } from './daily-report';
import { isDamStory } from '@shared/social-dam-schedule';

/** Match the publisher's half-hour ticks. Evaluate freshness again when the job runs. */
export function draftSendTime(value: unknown, render: unknown, now = Date.now()): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/.test(value)) {
    throw new Error('Choose an hour or half hour in Central time.');
  }
  const at = centralWallClockToUtc(value + ':00');
  if (at === null || at <= now) throw new Error('Choose a future Central time.');
  if (isDailyReport(render) && !reportIsCurrent(render, at)) throw new Error('Choose a time within two hours of the Daily Report readings, on the same day.');
  const snapshot = isDamStory(render) && render.inputProps?.snapshot;
  if (snapshot && getLocalDateKey('America/Chicago', new Date(at)) > snapshot.scheduleDate) {
    throw new Error('Choose a time on or before the date shown in the dam video.');
  }
  return new Date(at).toISOString();
}
