import type { LakePoolReading } from '@shared/lake-types';
import { relativeAge } from '@shared/dam-schedule-copy';

/** Daily reports have a different expected cadence from hourly observations. */
export function lakeReadingIsStale(pool: LakePoolReading, now: number): boolean {
  const at = Date.parse(pool.at);
  return !Number.isFinite(at) || at > now + 3_600_000 || now - at > (pool.daily ? 36 : 6) * 3_600_000;
}

export function lakeReadingLabel(pool: LakePoolReading, now: number): string {
  const age = relativeAge(pool.at, now);
  return `${pool.daily ? 'Daily report' : 'Observed'} ${age ?? 'time unavailable'}${lakeReadingIsStale(pool, now) ? ' · Outdated' : ''}`;
}

/** Only deduplicate actual observation instants, never matching rounded ages. */
export function sharedObservationAt(readings: Array<{ at: string } | undefined>): string | null {
  const present = readings.filter((r): r is { at: string } => Boolean(r));
  if (!present.length || !Number.isFinite(Date.parse(present[0].at))) return null;
  return present.every((r) => Date.parse(r.at) === Date.parse(present[0].at)) ? present[0].at : null;
}
