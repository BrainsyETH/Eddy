import { getLocalDay, getLocalMinutes } from './local-time';

/** Vercel checks both possible UTC hours; only 9 a.m. Central may publish. */
export function blogFeatureDue(now = new Date()): boolean {
  const day = getLocalDay('America/Chicago', now);
  const minute = getLocalMinutes('America/Chicago', now);
  return day >= 1 && day <= 5 && minute >= 9 * 60 && minute < 9 * 60 + 35;
}
