// Quiet-hours wall-clock formatting and draft validation. Preferences use the
// account timezone; opening the editor must not enable or round stored values.

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

/**
 * A wall-clock time, retaining any saved minutes.
 *
 * ── Why this stopped being hand-rolled ──────────────────────────────────────
 *
 * It used to build "10pm" from arithmetic, which bakes in the US 12-hour clock.
 * A phone set to a 24-hour locale — or set to English with "24-Hour Time" on in
 * iOS Settings, which is a switch plenty of people flip — got a window rendered
 * in a format it does not use anywhere else on the device, and had to translate
 * "10pm" into 22:00 to check it against the clock in its own status bar.
 *
 * Intl decides instead. Hermes ships full ICU (the same reason deviceTimezone
 * reads from Intl rather than adding expo-localization), so `hour: 'numeric'`
 * on the default locale yields "10 PM" or "22" as that locale requires, and
 * hourCycle is left unset ON PURPOSE so the user's own 12/24 preference wins.
 *
 * Formatted at a FIXED UTC instant with timeZone: 'UTC', not at "today at this
 * hour" — a local Date would be shifted by the device's own offset and by DST,
 * which is exactly the class of bug this function is meant to be too small to
 * have. The minute-of-day is the hour; nothing here converts between zones.
 *
 * Falls back to the old arithmetic if Intl throws, because a settings screen
 * that cannot render an hour is worse than one that renders it in en-US.
 */
export function hourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  try {
    // Fixed UTC date avoids device-zone and DST conversion.
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      ...(minute % 60 ? { minute: '2-digit' as const } : {}),
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(1970, 0, 1, hour, minute % 60)));
  } catch {
    const suffix = hour < 12 ? 'am' : 'pm';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}${minute % 60 ? `:${String(minute % 60).padStart(2, '0')}` : ''}${suffix}`;
  }
}

/**
 * A timezone id as a person would say it — "Central Time", not
 * "America/Chicago".
 *
 * The screen has to name the zone the window is stored in, because quiet hours
 * live on the ACCOUNT and the server's default is Missouri's. Printing the IANA
 * id with the underscores swapped out was the previous answer and it reads as a
 * file path; `timeZoneName: 'long'` gives the name the OS itself uses.
 *
 * Returns the id unchanged when Intl cannot resolve it — an unfamiliar zone
 * spelled oddly still beats no answer about when the phone will stay silent.
 */
export function timezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      timeZoneName: 'long',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone;
  } catch {
    return timezone.replace(/_/g, ' ');
  }
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

/** Draft validation never changes the other time behind the user's back. */
export function quietWindowValid(prefs: NotificationPreferences): boolean {
  return usableMinute(prefs.quietStartMinute) && usableMinute(prefs.quietEndMinute) && prefs.quietStartMinute !== prefs.quietEndMinute;
}
export function quietDraftChanged(draft: NotificationPreferences | null, initial: NotificationPreferences | null): boolean {
  if (!draft || !initial) return false;
  return draft.quietHoursEnabled !== initial.quietHoursEnabled || draft.quietStartMinute !== initial.quietStartMinute ||
    draft.quietEndMinute !== initial.quietEndMinute || draft.timezone !== initial.timezone || draft.safetyOverridesQuiet !== initial.safetyOverridesQuiet;
}
