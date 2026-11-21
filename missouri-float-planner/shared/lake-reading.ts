// shared/lake-reading.ts
// When a lake level is still current, and the label that says how old it is.
// Shared so the web page, the iOS screen, ramp cautions and the collector's
// health check all draw the line in the same place.
//
// Two cadences. An hourly source past six hours is stale by the dam page's own
// rule. A daily report (Truman, through Ameren) is a day old by construction,
// so it gets a day and a half and no more.

import { relativeAge } from './dam-schedule-copy';
import type { LakePoolReading } from './lake-types';

export const LAKE_READING_MAX_AGE_HOURS = { hourly: 6, daily: 36 } as const;

export function lakeObservationIsCurrent(at: string, cadence: keyof typeof LAKE_READING_MAX_AGE_HOURS, now: number): boolean {
  const observedAt = Date.parse(at);
  return Number.isFinite(observedAt) && observedAt <= now + 3_600_000
    && now - observedAt <= LAKE_READING_MAX_AGE_HOURS[cadence] * 3_600_000;
}

/** Daily reports have a different expected cadence from hourly observations. */
export function lakeReadingIsStale(pool: LakePoolReading, now: number): boolean {
  return !lakeObservationIsCurrent(pool.at, pool.daily ? 'daily' : 'hourly', now);
}

export function lakeReadingLabel(pool: LakePoolReading, now: number): string {
  const age = relativeAge(pool.at, now);
  return `${pool.daily ? 'Daily report' : 'Observed'} ${age ?? 'time unavailable'}${lakeReadingIsStale(pool, now) ? ' · Outdated' : ''}`;
}
