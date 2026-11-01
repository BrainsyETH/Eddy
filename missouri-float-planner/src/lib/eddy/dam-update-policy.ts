// src/lib/eddy/dam-update-policy.ts
// When a dam's Read is rewritten, and when a stored one may still be served.
//
// Pure, so both rules are tested without a database or a model.
//
// ── A Read says "today" ────────────────────────────────────────────────────
// It describes the posted schedule for the rest of today, so it belongs to one
// Central calendar day and is never served on the next. It is rewritten:
//   - when none exists for today (the first hourly run after midnight),
//   - when the posted SWPA schedule changes (a new version arrived),
//   - and every REWRITE_AFTER_HOURS anyway, so "the rest of today" keeps up
//     with the clock instead of naming a window that ended at noon.
// SWPA republishes about daily, so that is three to five short model calls a
// day per dam.
//
// ── A Read written against another schedule is not served ──────────────────
// The same discipline the gauge route keeps when the live condition no longer
// matches the stored report. A Read that says "no generation scheduled" while
// the current schedule has the units coming on at 2 PM is the dangerous
// direction, so a hash mismatch withholds it until the next run rewrites it.

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
 * `currentScheduleHash` is undefined when the current snapshot could not be
 * read at all, which is different from null (read, and no schedule posted).
 */
export function servable(
  latest: StoredDamRead & { expiresAt: string },
  currentScheduleHash: string | null | undefined,
  now = Date.now(),
): boolean {
  const written = Date.parse(latest.generatedAt);
  const expires = Date.parse(latest.expiresAt);
  if (!Number.isFinite(written) || !Number.isFinite(expires) || expires <= now) return false;
  if (centralClock(written).dayKey !== centralClock(now).dayKey) return false;
  if (currentScheduleHash === undefined) return now - written <= UNVERIFIED_MAX_AGE_HOURS * HOUR_MS;
  return (currentScheduleHash ?? null) === (latest.scheduleHash ?? null);
}

export interface DamReadProse {
  summaryText: string;
  eddyRead: string | null;
  quoteText: string;
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
export function tierDamRead(entitled: boolean, prose: DamReadProse): DamReadProse | null {
  return entitled ? prose : null;
}
