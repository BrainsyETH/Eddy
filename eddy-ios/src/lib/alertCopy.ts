// eddy-ios/src/lib/alertCopy.ts
// Human phrasing for a condition change, plus the timestamp rule.
//
// Two constraints shape everything here.
//
// 1. TIME IS QUOTED FROM THE READING, NOT THE DETECTION. Real events measured on
//    2026-07-26 showed a 31-minute gap between when the river was measured and
//    when our cron noticed. Saying "30 minutes ago" off `detectedAt` would claim
//    the river changed an hour later than it did. Always use `readingAt`.
//
// 2. POSITIVE COPY IS RESERVED FOR FLOATABLE WATER. `high` and `dangerous` stay
//    in caution language — the canonical condition system draws that line
//    explicitly (FLOATABLE_NOW is narrower than WEEKEND_FLOATABLE for exactly
//    this reason) and safety-adjacent wording must not soften.

import type { AlertFeedEntry } from '@eddy/types';
import { conditionLabel } from '@/theme/conditions';

/** Compact relative time — "just now", "40m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** One-line headline for a feed row. */
export function alertHeadline(alert: AlertFeedEntry): string {
  const to = conditionLabel(alert.newConditionCode);
  switch (alert.kind) {
    case 'floatable':
      return `Now floatable — ${to}`;
    case 'warning':
      return alert.newConditionCode === 'dangerous' ? 'Flood — do not float' : `Rising — ${to}`;
    case 'easing':
      return `Easing — now ${to}`;
    case 'recovery':
      return `Back down — ${to}`;
    default:
      return `Changed to ${to}`;
  }
}

/** Supporting line: the reading that triggered it, and when it was measured. */
export function alertDetail(alert: AlertFeedEntry, now?: Date): string {
  const parts: string[] = [];
  if (alert.readingValue !== null && alert.readingUnit) {
    const value =
      alert.readingUnit === 'ft'
        ? `${alert.readingValue.toFixed(2)} ft`
        : `${Math.round(alert.readingValue).toLocaleString()} cfs`;
    parts.push(value);
  }
  // readingAt, never detectedAt — see the note at the top of this file.
  const when = relativeTime(alert.readingAt ?? alert.detectedAt, now);
  if (when) parts.push(when);
  return parts.join(' · ');
}

/** Which brand role a row should be tinted with. */
export function alertTone(alert: AlertFeedEntry): 'positive' | 'caution' | 'neutral' {
  if (alert.kind === 'floatable') return 'positive';
  if (alert.kind === 'warning' || alert.kind === 'easing') return 'caution';
  return 'neutral';
}
