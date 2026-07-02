// src/lib/social/central-time.ts
// Central Time wrappers over the zone-parameterized helpers in local-time.ts.
// Kept for legacy callers; new code should pass an explicit zone
// (rivers.timezone / social_config.timezone) to the local-time functions.

import { getLocalDay, getLocalDateKey, getLocalMinutes } from './local-time';

const CT_ZONE = 'America/Chicago';

/** Current day-of-week in Central Time. 0 = Sunday. */
export function getCentralDay(date: Date = new Date()): number {
  return getLocalDay(CT_ZONE, date);
}

/** Current minute-of-day in Central Time (0..1439). */
export function getCentralMinutes(date: Date = new Date()): number {
  return getLocalMinutes(CT_ZONE, date);
}

/** YYYY-MM-DD of the current Central-Time date. */
export function getCentralDateKey(date: Date = new Date()): string {
  return getLocalDateKey(CT_ZONE, date);
}
