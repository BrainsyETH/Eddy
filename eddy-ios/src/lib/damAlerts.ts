// eddy-ios/src/lib/damAlerts.ts
// Dam generation alerts, as the app holds them: one per dam, two switches.
//
// The alert pushes when generation is POSTED to start at a dam — at the posted
// time, an hour before it, or both. It follows the schedule and does not
// confirm generation began; docs/decisions/0020 has the decision and the
// server's src/lib/alerts/dam-generation.ts has the rules.
//
// Pure, with no React and no native imports, so the web test suite can cover
// it (src/lib/dam-alerts.test.ts there) — this app has no runner of its own.

import type { DamGenerationAlert } from '@eddy/types';

/** The two times an alert can notify. Both false means there is no alert. */
export interface DamAlertTimes {
  atStart: boolean;
  hourBefore: boolean;
}

export const NO_DAM_ALERT: DamAlertTimes = { atStart: false, hourBefore: false };

/**
 * One switch moving: only the time that changed.
 *
 * ── Why a change and not the whole alert ────────────────────────────────────
 * The card first sent both times, read from this app's copy of the alert.
 * While that copy was still loading both read off, so switching "an hour
 * before" on sent `atStart: false` with it and silently cleared a saved "at
 * the start". The server holds the truth, so the app now says only what the
 * person changed and the server keeps the rest (mergeAlertTimes there).
 */
export type DamAlertChange = Partial<DamAlertTimes>;

/** The times this app should SHOW after a change, until the server answers. */
export function changedDamAlertTimes(current: DamAlertTimes, change: DamAlertChange): DamAlertTimes {
  return { ...current, ...change };
}

/** True when the change switches a time on, which is when a push becomes owed. */
export function turnsDamAlertOn(change: DamAlertChange): boolean {
  return change.atStart === true || change.hourBefore === true;
}

/**
 * Said beside the switches and under the Alerts row.
 *
 * The limit is the point of saying it: generation has started early, and
 * without a posted time, on days Eddy tracked (ADR 0017). Someone wading must
 * not read a quiet phone as a promise that the water is staying down.
 */
export const DAM_ALERT_NOTE =
  'Follows the posted schedule. Times are at the dam, in Central time. Generation can start without being posted.';

/** What the push primer promises, completing "Eddy sends a notification …". */
export const DAM_ALERT_PROMISE = 'when generation is posted to start at the dam';

/** The times set for one dam; both false when it has no alert, or the list has not loaded. */
export function damAlertTimes(
  alerts: readonly DamGenerationAlert[] | null,
  damId: string,
): DamAlertTimes {
  const alert = alerts?.find((entry) => entry.damId === damId);
  return alert ? { atStart: alert.atStart, hourBefore: alert.hourBefore } : NO_DAM_ALERT;
}

/** True when either switch is on. */
export function hasDamAlert(times: DamAlertTimes): boolean {
  return times.atStart || times.hourBefore;
}

/**
 * The list after setting one dam's times.
 *
 * Both off removes the alert, as the server does: an alert with no time to
 * fire at is not a paused alert. An existing alert keeps its place and its
 * createdAt; a new one goes first, where the Alerts tab lists newest.
 */
export function applyDamAlert(
  alerts: readonly DamGenerationAlert[],
  dam: { id: string; name: string },
  times: DamAlertTimes,
  nowIso: string,
): DamGenerationAlert[] {
  const others = alerts.filter((entry) => entry.damId !== dam.id);
  if (!hasDamAlert(times)) return others;
  const existing = alerts.find((entry) => entry.damId === dam.id);
  if (existing) {
    return alerts.map((entry) => (entry.damId === dam.id ? { ...entry, ...times } : entry));
  }
  return [{ damId: dam.id, damName: dam.name, ...times, createdAt: nowIso }, ...others];
}

/**
 * The list after the server answered a save: its alert replaces this app's
 * guess, and null means the alert is gone.
 *
 * The answer can differ from the guess. It carries the switch the app did not
 * send, as the server holds it — which is how a switch that was on all along,
 * and read off because the list had not loaded, comes back on.
 */
export function reconcileDamAlert(
  alerts: readonly DamGenerationAlert[],
  damId: string,
  saved: DamGenerationAlert | null,
): DamGenerationAlert[] {
  if (!saved) return alerts.filter((entry) => entry.damId !== damId);
  if (alerts.some((entry) => entry.damId === damId)) {
    return alerts.map((entry) => (entry.damId === damId ? saved : entry));
  }
  return [saved, ...alerts];
}

/** One line for the Alerts row: which of the two times are on. */
export function damAlertSummary(times: DamAlertTimes): string {
  if (times.atStart && times.hourBefore) return 'Posted generation: 1 hour before and at the start';
  if (times.hourBefore) return 'Posted generation: 1 hour before';
  if (times.atStart) return 'Posted generation: at the start';
  return 'Off';
}
