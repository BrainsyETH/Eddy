// src/lib/alerts/quiet-hours.ts
// Is this push allowed to make a noise right now?
//
// ── Why this is its own module ──────────────────────────────────────────────
//
// It used to live in gauge-threshold.ts, which made it reachable from exactly
// one of the two delivery passes. The gauge pass called it; the river pass —
// which delivers every "Eddy's call" subscription, the alert the bell on the
// river screen creates and by far the most common kind anybody has — never
// loaded a preferences row at all. So a user who set "silent 10pm–7am" was
// still woken at 3am by the alerts that setting most obviously governs, while
// the app said, in as many words, that the window was in force.
//
// fanout.ts cannot import gauge-threshold.ts to fix that: gauge-threshold.ts
// imports subscriptionKindsFor FROM fanout.ts, so the dependency would be a
// cycle. Both passes now import this instead, which is also the honest shape —
// a quiet window is a fact about a PERSON, not about either kind of rule.
//
// I/O-free like gate.ts and gating.ts beside it: the callers do the querying,
// this owns the policy, so every case is testable without a database.
//
// ── This suppresses; it does not queue — but the rule is RE-ARMED ────────────
//
// Both passes discard events older than three hours, because "your river is
// floatable" must never fire about water that has since dropped, and a quiet
// window is typically eight. Holding the night's event until morning would
// therefore deliver a stale reading or, far more often, nothing at all.
//
// What used to happen next was worse than either: the suppressed event was
// drained, the rule's crossing state had already advanced, and a "drops below
// 3 ft" that crossed at 2am was never heard about — not at 7am, not ever, until
// the river rose back out of the band and fell in again. The app meanwhile
// promised the change would be waiting "in the Alerts feed", which had been
// replaced by a high-water snapshot that a falling river never appears in.
//
// So a suppressed threshold event is now RECORDED (suppressed_reason on the
// row) and, once the user's window has ended, the rule's crossing state is put
// back on the far side of its line — see quiet-hours-rearm.ts and the top of
// deliverGaugeAlerts. The next evaluation then reads the CURRENT number and
// fires a fresh event if the water is still there. Nothing stale is ever sent;
// nothing true is ever lost.
//
// ── What breaks through ─────────────────────────────────────────────────────
// `warning` events, when the user has left safetyOverridesQuiet on. A custom
// "rises above N" rule whose N sits at or above the station's high-water line
// is emitted AS a warning by the evaluator (gauge-threshold.ts), so a flood
// line somebody drew for themselves wakes them like Eddy's own would.

import type { NotificationPreferences } from '@/types/api';

/**
 * Kinds that wake someone during their quiet hours.
 *
 * `warning` alone, and only when the user has left safetyOverridesQuiet on.
 * Deliberately shared across both passes: the river vocabulary
 * (floatable/warning/easing) and the gauge one (threshold/floatable/warning/
 * easing) both spell an elevated-water event `warning`, so one set covers both
 * and the two cannot drift into disagreeing about what counts as safety.
 */
const QUIET_BREAKTHROUGH_KINDS: ReadonlySet<string> = new Set(['warning']);

/** Local minutes past midnight in an IANA zone, or null when the zone is bad. */
function localMinutes(now: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      // h23 and not hour12:false — some ICU builds render midnight as "24"
      // under the latter, which would put 00:05 an entire day out of the window.
      hourCycle: 'h23',
    }).formatToParts(now);

    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return (hour % 24) * 60 + minute;
  } catch {
    // Unknown zone. The route validates on write, so this is a corrupted row.
    return null;
  }
}

/** True when `now` falls inside the user's quiet window. */
export function isQuietAt(prefs: NotificationPreferences | null, now: Date): boolean {
  if (!prefs?.quietHoursEnabled) return false;
  const { quietStartMinute: start, quietEndMinute: end } = prefs;
  if (start == null || end == null) return false;
  // A zero-length window is not "always quiet" — it is a user who has not
  // finished setting one up.
  if (start === end) return false;

  const minutes = localMinutes(now, prefs.timezone);
  // FAIL OPEN. A bad timezone must not silence somebody's danger alerts; an
  // unwanted 3am buzz is the lesser failure by a wide margin.
  if (minutes == null) return false;

  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end; // overnight, the normal case
}

/**
 * Whether quiet hours swallow this push.
 *
 * A null `prefs` is a user with no preferences row, which is the default state
 * and means no window at all — never "assume quiet". Getting that backwards
 * would silence everybody who has never opened the settings screen.
 */
export function suppressedByQuietHours(
  prefs: NotificationPreferences | null,
  kind: string,
  now: Date,
): boolean {
  if (!isQuietAt(prefs, now)) return false;
  if (prefs?.safetyOverridesQuiet && QUIET_BREAKTHROUGH_KINDS.has(kind)) return false;
  return true;
}
