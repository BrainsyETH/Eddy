// src/lib/eddy/dam-update-policy.ts
// Cache complete-day history; render schedule-dependent copy when serving.
// A schedule revision does not invalidate the historical analysis. The route
// uses the current snapshot, or advances the saved windows with an unverified
// flag when that snapshot is missing. Both paths stay on the Read's Central day.
//
// Regeneration is separate from serving eligibility: refresh on a new day,
// schedule revision, or every six hours to pick up late historical observations.
// There are no model calls. A due refresh never withholds otherwise valid history.

import { centralClock, nextDayKey } from '@shared/dam-schedule-copy';
import { centralDayStart } from '@/lib/data/dam-history';

export const REWRITE_AFTER_HOURS = 6;
/** Without a current snapshot to compare, a Read is served only this young. */
export const UNVERIFIED_MAX_AGE_HOURS = 3;
/** Rows older than this are pruned by the cron. */
export const DAM_UPDATE_RETENTION_DAYS = 90;

const HOUR_MS = 3_600_000;

export interface StoredDamRead {
  generatedAt: string;
  scheduleHash: string | null;
}

export function needsRewrite(latest: StoredDamRead | null, currentScheduleHash: string | null, now = Date.now()): boolean {
  if (!latest) return true;
  const written = Date.parse(latest.generatedAt);
  if (!Number.isFinite(written)) return true;
  if (centralClock(written).dayKey !== centralClock(now).dayKey) return true;
  if ((currentScheduleHash ?? null) !== (latest.scheduleHash ?? null)) return true;
  return now - written >= REWRITE_AFTER_HOURS * HOUR_MS;
}

/** The instant a Read written at `now` stops being about "today": the next Central midnight. */
export function damReadExpiresAt(now = Date.now()): string {
  return new Date(centralDayStart(nextDayKey(centralClock(now).dayKey))).toISOString();
}

/**
 * Whether a stored Read may be served now.
 *
 * Snapshot presence is separate from its schedule contents: an empty current
 * schedule must replace the saved one, not revive an old posted window.
 */
export function servable(
  latest: Pick<StoredDamRead, 'generatedAt'> & { expiresAt: string },
  hasSnapshot: boolean,
  now = Date.now(),
): boolean {
  const written = Date.parse(latest.generatedAt);
  const expires = Date.parse(latest.expiresAt);
  if (!Number.isFinite(written) || !Number.isFinite(expires) || written > now || expires <= now) return false;
  if (centralClock(written).dayKey !== centralClock(now).dayKey) return false;
  return hasSnapshot || now - written <= UNVERIFIED_MAX_AGE_HOURS * HOUR_MS;
}

/**
 * The public/Premium contract for a dam Read: ALL of it is Premium.
 *
 * Unlike river and gauge reads, whose one-line summary is public, a dam Read
 * gives a public caller only that a Read exists and when it was written, so the
 * app can draw its locked card honestly. The measured pattern strip and the
 * posted schedule stay free on the dam page; what is sold is Eddy's reading of
 * them. ADR 0017.
 */
export function tierDamRead<T>(entitled: boolean, read: T): T | null {
  return entitled ? read : null;
}
