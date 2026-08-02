// eddy-ios/src/lib/quietHours.ts
// The one place that knows what a quiet-hours window has to look like before
// the server will accept it.
//
// ── The bug this exists to end ──────────────────────────────────────────────
//
// PUT /api/me/notification-preferences rejects `quietHoursEnabled: true` unless
// BOTH bounds are whole minutes in 0–1439 and the two differ. A user who has
// never opened the settings screen has neither: the route's own DEFAULTS are
// `{ enabled: false, start: null, end: null }`, so that is what the GET returns
// and what the app holds.
//
// The row on the Alerts tab then sent exactly that back with one field flipped
// — enabled true, bounds still null — the server answered 400, and the switch's
// optimistic update reverted. To the user: a toggle that flicks on, flicks off
// again, and says nothing. It worked for anyone who had set a window on the
// settings screen first, which is why it read as intermittent rather than as
// broken.
//
// Both surfaces now build their payload here, so neither can send a window the
// server will refuse, and the defaults cannot drift apart between them.

import type { NotificationPreferences } from '@eddy/types';

/** 10pm. The hour someone who has not chosen one almost certainly means. */
export const DEFAULT_START_MINUTE = 22 * 60;
/** 7am. */
export const DEFAULT_END_MINUTE = 7 * 60;

/**
 * The phone's own zone.
 *
 * Read from Intl rather than expo-localization: this is the one fact we need
 * from that module, Hermes ships full ICU, and a new native dependency would
 * cost a rebuild for a one-line lookup. Falls back to the server's default,
 * which is also what an account with no row gets.
 */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

/** Whole hours in, whole hours out. See the header on why this is not minutes. */
export function hourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

/** A minute-of-day the server will accept. Mirrors validMinute() on the route. */
function usableMinute(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1439;
}

/**
 * Preferences with a window the server will accept, whatever came in.
 *
 * Missing or malformed bounds become the defaults; a start equal to its end —
 * which the route rejects outright, because it reads as either "never quiet" or
 * "always quiet" — is nudged an hour apart. A timezone is always sent, because
 * an unknown one is a 400 and a missing one silently files the window under
 * Missouri time for somebody who is not in Missouri.
 *
 * Applied on every write, not only when enabling: bounds are kept server-side
 * when the window is switched off, so a payload that carries good ones back is
 * what makes switching it on again restore what the user had.
 */
export function withUsableWindow(
  prefs: NotificationPreferences,
  enabled: boolean,
): NotificationPreferences {
  const start = usableMinute(prefs.quietStartMinute) ? prefs.quietStartMinute : DEFAULT_START_MINUTE;
  const end = usableMinute(prefs.quietEndMinute) ? prefs.quietEndMinute : DEFAULT_END_MINUTE;

  return {
    ...prefs,
    quietHoursEnabled: enabled,
    quietStartMinute: start,
    quietEndMinute: start === end ? (end + 60) % 1440 : end,
    timezone: prefs.timezone || deviceTimezone(),
  };
}
