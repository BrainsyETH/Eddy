// eddy-ios/src/lib/alertCopy.ts
// Human phrasing for a condition change, plus the timestamp rule.
//
// ── Two audiences, one module ───────────────────────────────────────────────
// `lastSentNote` is live: AlertRuleRow draws it under every standing rule.
//
// The change-feed half — alertHeadline, alertDetail, alertTone — is currently
// unreferenced and kept on purpose. The Alerts tab's second segment used to
// render the /api/alerts change feed and was its only caller. It now shows
// High Water Alerts — a snapshot of what is high RIGHT NOW rather than a log
// of what moved this week — which needs no transition phrasing.
//
// It stays because /api/alerts stays: the outbox is still written, the website
// still reads it, and the change feed is a screen this app may well want back.
// The two rules below are the expensive part of that module, both learned from
// production, and re-deriving them later is how a repo ends up with four
// condition ladders. src/lib/alert-copy.test.ts exercises these functions directly.
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

import type { AlertFeedEntry, AlertRule } from '@eddy/types';
import { conditionLabel } from '../theme/conditions';

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

/**
 * When a standing rule last fired, for the manage list.
 *
 * WHY A ROW NEEDS THIS AT ALL: a notification channel you have never heard
 * from is indistinguishable from a broken one. A rule that has been armed
 * since June and correctly never fired — because the river never crossed its
 * threshold — looks exactly like a rule that is silently failing, and the only
 * way to tell them apart was to wait for water. Saying "never sent, watching
 * since June" makes the silence legible as the rule working.
 *
 * Deliberately NOT the whole story. A fired rule says when, not what happened:
 * the reading that tripped it is not on the rule payload, and inventing a
 * plausible one is worse than omitting it.
 *
 * A PAUSED RULE IS NOT WATCHING. This used to print "watching since October"
 * under a switch that was off, which is the one claim on the row that was
 * false. Paused, it says so — and still says what last happened, because that
 * stays true and is the reason somebody might switch it back on.
 *
 * "SENT" IS RESERVED FOR A NOTIFICATION THAT WENT OUT. A river alert's
 * `lastTriggeredAt` is written by delivery, so it is a send. A gauge rule's is
 * written by the evaluator when the reading crosses its trigger — quiet hours
 * or a pause can still stop the push — so for a gauge this says the trigger was
 * met, which is what the data knows. `covered` is a gauge folded into a river
 * alert's row, reported the same way and by name.
 *
 * Returns null when the rule has never fired AND has no creation date to
 * anchor "since" to — an unanchored "never sent" is closer to an error message
 * than to information.
 */
export function lastSentNote(
  rule: Pick<AlertRule, 'lastTriggeredAt' | 'createdAt'> &
    Partial<Pick<AlertRule, 'enabled' | 'source'>>,
  now: Date = new Date(),
  /** A covered gauge that met its trigger more recently than the rule's own. */
  covered?: { station: string; at: string } | null,
): string | null {
  const paused = rule.enabled === false;
  const coveredWhen = covered ? relativeTime(covered.at, now) : '';
  if (covered?.station && coveredWhen) {
    const station = `${covered.station[0].toUpperCase()}${covered.station.slice(1)}`;
    const said = `${station} met its trigger ${coveredWhen}`;
    return paused ? `Paused. ${said}.` : said;
  }

  const fired = relativeTime(rule.lastTriggeredAt ?? null, now);
  if (fired) {
    const said = rule.source === 'gauge' ? `Met its trigger ${fired}` : `Last sent ${fired}`;
    return paused ? `Paused. ${said}.` : said;
  }
  if (paused) return 'Paused';

  const since = watchingSince(rule.createdAt, now);
  return since ? `No alerts sent. Watching since ${since}` : null;
}

/**
 * A gauge rule that is armed and cannot fire: the alert engine has had no
 * reading from its station that it would act on for longer than it accepts
 * one (`readingStale`, from the server). Says when the last usable one was, or
 * that there has not been one yet. Null for every other rule, so a caller can
 * let this outrank "Watching for changes" without testing anything itself.
 */
export function staleReadingNote(
  rule: Pick<AlertRule, 'source' | 'enabled' | 'readingStale' | 'lastReadingAt'>,
  now: Date = new Date(),
  /**
   * Names the station, for a row that speaks for more than one — a river alert
   * with other gauges folded into it. "Sullivan: waiting on the gauge".
   */
  station?: string,
): string | null {
  if (rule.source !== 'gauge' || !rule.enabled || !rule.readingStale) return null;
  const last = relativeTime(rule.lastReadingAt ?? null, now);
  const lead = station
    ? `Waiting for a reading from ${station}`
    : 'Waiting on the gauge';
  return last ? `${lead}. Last usable reading ${last}.` : `${lead}. No usable reading yet.`;
}

/**
 * "June", or "June 2025" once the year stops being obvious.
 *
 * A month is as precise as this line should get. The exact minute a rule was
 * created is not a thing anybody is trying to recall, and a full date invites
 * the reader to do arithmetic that leads nowhere.
 */
function watchingSince(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return null;
  const month = created.toLocaleDateString('en-US', { month: 'long' });
  return created.getFullYear() === now.getFullYear()
    ? month
    : `${month} ${created.getFullYear()}`;
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
  const when = relativeTime(alert.readingAt, now);
  if (when) parts.push(when);
  return parts.join(' ');
}

/** Which brand role a row should be tinted with. */
export function alertTone(alert: AlertFeedEntry): 'positive' | 'caution' | 'neutral' {
  if (alert.kind === 'floatable') return 'positive';
  if (alert.kind === 'warning' || alert.kind === 'easing') return 'caution';
  return 'neutral';
}
