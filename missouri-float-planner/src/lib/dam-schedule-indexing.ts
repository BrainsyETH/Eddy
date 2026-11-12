import { centralDayKey } from '@shared/dam-schedule-copy';
import { validScheduleDate } from '@shared/dam-schedule-share';

/** Dated exports are sharing utilities; the live dam page remains searchable. */
export const DAM_SCHEDULE_ROBOTS = { index: false, follow: true } as const;
export const DAM_SCHEDULE_ROBOTS_HEADER = 'noindex';

/** No archive is promised. Expiry is at the dam's Central midnight, not UTC. */
export function damScheduleExpired(date: string, now = Date.now()): boolean {
  return validScheduleDate(date) && date < centralDayKey(now);
}
