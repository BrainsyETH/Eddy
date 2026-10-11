// eddy-ios/src/lib/floatReminders.ts
// On-water reminders (#1448 Phase 5): a heads-up before the take-out, and
// before any stop the paddler picked along the way.
//
// Pure, like floatSession.ts, so the web suite tests it
// (missouri-float-planner/src/lib/float-reminders.test.ts). The store decides
// when to ask; floatSessionStore.ts turns an answer into a local notification,
// which needs no cell service.
//
// ── The rules ───────────────────────────────────────────────────────────────
//
//   Distance is along the river, never straight-line: a take-out across a
//   bend is not "close" (the same miles the screen shows).
//   Only a live, confirmed position counts: not one being re-confirmed, off
//   the river, stale, or restored and not yet re-found. A reminder built on a
//   guess would teach people to ignore them.
//   Approaching means the target is downstream and the paddler is not moving
//   upstream away from it.
//   Each reminder fires once per float. The fired list is stored with the
//   float, so a relaunch, a GPS gap or drifting back and forth across the
//   threshold never repeats it.

import type { FloatSession, RouteAnchor } from './floatSession';

/** Heads-up distance before the take-out: about 10-15 minutes on the water. */
export const TAKE_OUT_LEAD_MILES = 0.5;
/** Heads-up distance before a chosen stop. */
export const STOP_LEAD_MILES = 0.25;
/** Older than this, the position is not live enough to remind on. */
const LIVE_POSITION_MS = 2 * 60_000;
/**
 * Direction is judged over about a minute, not between neighbouring samples
 * ten seconds apart, where slow paddling is smaller than GPS wobble. Backwards
 * motion under this much in that minute is wobble, not heading upstream.
 */
const DIRECTION_WINDOW_MS = 60_000;
const UPSTREAM_TOLERANCE_MILES = 0.02;

export const TAKE_OUT_REMINDER_ID = 'take-out';

/** Stored with the float; absent on floats started before reminders existed. */
export interface FloatReminderSettings {
  /** Remind before the take-out. */
  takeOut: boolean;
  /** Access-point ids along the way to remind before. */
  stops: string[];
  /** Reminder ids already sent this float ('take-out' or a stop id). */
  fired: string[];
}

export const DEFAULT_REMINDERS: FloatReminderSettings = { takeOut: true, stops: [], fired: [] };

export function remindersOf(session: FloatSession): FloatReminderSettings {
  return session.reminders ?? DEFAULT_REMINDERS;
}

export interface DueReminder {
  id: string;
  name: string;
  kind: 'take-out' | 'stop';
  /** Along-river miles left to it when it fired. */
  milesAway: number;
}

/**
 * Access points a paddler can ask to be reminded before: those strictly
 * between where the float is measured from and the take-out, in river order.
 */
export function reminderStops(session: FloatSession): RouteAnchor[] {
  const from = session.startMile ?? session.putIn?.riverMile ?? -Infinity;
  return session.route.anchors
    .filter((anchor) => anchor.id !== session.takeOut.id && anchor.riverMile > from && anchor.riverMile < session.takeOut.riverMile)
    .sort((a, b) => a.riverMile - b.riverMile);
}

/** The reminders this position has reached and that have not been sent yet. */
export function dueReminders(session: FloatSession, now: number): DueReminder[] {
  const settings = remindersOf(session);
  if (!settings.takeOut && settings.stops.length === 0) return [];
  if (session.awaitingFix) return [];
  const last = session.last;
  if (!last || last.result.kind !== 'matched' || now - last.at > LIVE_POSITION_MS) return [];

  const here = last.result.riverMile;
  // Moving upstream, away from everything ahead: no heads-up.
  const earlier = [...session.samples].reverse().find((sample) => sample.timestamp <= last.at - DIRECTION_WINDOW_MS);
  if (earlier && here < earlier.riverMile - UPSTREAM_TOLERANCE_MILES) return [];

  const fired = new Set(settings.fired);
  const targets: { id: string; name: string; mile: number; kind: DueReminder['kind']; lead: number }[] = [];
  if (settings.takeOut) {
    targets.push({ id: TAKE_OUT_REMINDER_ID, name: session.takeOut.name, mile: session.takeOut.riverMile, kind: 'take-out', lead: TAKE_OUT_LEAD_MILES });
  }
  const chosen = new Set(settings.stops);
  for (const stop of reminderStops(session)) {
    if (chosen.has(stop.id)) targets.push({ id: stop.id, name: stop.name, mile: stop.riverMile, kind: 'stop', lead: STOP_LEAD_MILES });
  }

  return targets
    .filter((target) => !fired.has(target.id))
    .map((target) => ({ ...target, milesAway: target.mile - here }))
    // Ahead and within the heads-up distance. Already past it is too late.
    .filter((target) => target.milesAway > 0 && target.milesAway <= target.lead)
    .map(({ id, name, kind, milesAway }) => ({ id, name, kind, milesAway }));
}

/** The session with these reminders recorded as sent. */
export function markFired(session: FloatSession, ids: readonly string[]): FloatSession {
  if (ids.length === 0) return session;
  const settings = remindersOf(session);
  return { ...session, reminders: { ...settings, fired: [...new Set([...settings.fired, ...ids])] } };
}

/** The notification a reminder becomes. */
export function reminderCopy(reminder: DueReminder): { title: string; body: string } {
  const distance = reminder.milesAway < 0.1 ? 'just ahead' : `about ${reminder.milesAway.toFixed(1)} mi ahead`;
  return reminder.kind === 'take-out'
    ? { title: 'Take-out coming up', body: `${reminder.name} is ${distance}, along the river.` }
    : { title: `${reminder.name} coming up`, body: `It is ${distance}, along the river.` };
}
