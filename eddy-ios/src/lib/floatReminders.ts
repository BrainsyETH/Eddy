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
//   Stops are measured where they actually sit on the calibrated line, the
//   same as the float's own ends (placeEnd), never by a published mile that
//   calibration left out.
//   "Sent" means the phone accepted the notification. A reminder is PENDING
//   while it is being handed over: written to disk first, then scheduled,
//   then marked sent only if scheduling succeeded. A failure leaves it
//   eligible again. Pending is cleared on a relaunch, so a crash mid-handover
//   can at worst repeat a reminder once, never lose it: a second heads-up
//   beats a missed take-out.

import type { RouteIndex } from '@eddy/geo';
import { placeEnd, type FloatSession, type RouteAnchor } from './floatSession';

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
  /** Reminder ids the phone accepted this float ('take-out' or a stop id). */
  fired: string[];
  /** Reminder ids being handed to the notifier right now. */
  pending?: string[];
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
  /** For a take-out off the mapped river: how far it sits beyond the river. */
  beyondMeters?: number;
}

/**
 * Access points a paddler can ask to be reminded before: those strictly
 * between where the float is measured from and the take-out, in river order,
 * each at its calibrated mile on the line.
 */
export function reminderStops(session: FloatSession, index: RouteIndex): { anchor: RouteAnchor; mile: number }[] {
  const from = session.startMile ?? session.putIn?.riverMile ?? -Infinity;
  return session.route.anchors
    .filter((anchor) => anchor.id !== session.takeOut.id)
    .map((anchor) => ({ anchor, mile: placeEnd(index, anchor).riverMile }))
    .filter(({ mile }) => mile > from && mile < session.takeOut.riverMile)
    .sort((a, b) => a.mile - b.mile);
}

/** The reminders this position has reached and that are neither sent nor being sent. */
export function dueReminders(session: FloatSession, index: RouteIndex, now: number): DueReminder[] {
  const settings = remindersOf(session);
  if (!settings.takeOut && settings.stops.length === 0) return [];
  if (session.awaitingFix) return [];
  const last = session.last;
  if (!last || last.result.kind !== 'matched' || now - last.at > LIVE_POSITION_MS) return [];

  const here = last.result.riverMile;
  // Moving upstream, away from everything ahead: no heads-up.
  const earlier = [...session.samples].reverse().find((sample) => sample.timestamp <= last.at - DIRECTION_WINDOW_MS);
  if (earlier && here < earlier.riverMile - UPSTREAM_TOLERANCE_MILES) return [];

  const done = new Set([...settings.fired, ...(settings.pending ?? [])]);
  const targets: (DueReminder & { mile: number; lead: number })[] = [];
  if (settings.takeOut) {
    targets.push({
      id: TAKE_OUT_REMINDER_ID,
      name: session.takeOut.name,
      kind: 'take-out',
      mile: session.takeOut.riverMile,
      lead: TAKE_OUT_LEAD_MILES,
      milesAway: 0,
      ...(session.takeOut.offLineMeters != null ? { beyondMeters: session.takeOut.offLineMeters } : {}),
    });
  }
  const chosen = new Set(settings.stops);
  for (const { anchor, mile } of reminderStops(session, index)) {
    if (chosen.has(anchor.id)) targets.push({ id: anchor.id, name: anchor.name, kind: 'stop', mile, lead: STOP_LEAD_MILES, milesAway: 0 });
  }

  return targets
    .filter((target) => !done.has(target.id))
    .map((target) => ({ ...target, milesAway: target.mile - here }))
    // Ahead and within the heads-up distance. Already past it is too late.
    .filter((target) => target.milesAway > 0 && target.milesAway <= target.lead)
    .map(({ mile: _mile, lead: _lead, ...reminder }) => reminder);
}

function withReminders(session: FloatSession, change: (settings: FloatReminderSettings) => FloatReminderSettings): FloatSession {
  return { ...session, reminders: change(remindersOf(session)) };
}

/** These reminders are being handed to the notifier. */
export function markPending(session: FloatSession, ids: readonly string[]): FloatSession {
  if (ids.length === 0) return session;
  return withReminders(session, (s) => ({ ...s, pending: [...new Set([...(s.pending ?? []), ...ids])] }));
}

/** The handover finished: `delivered` were accepted, the rest are eligible again. */
export function settleDelivery(session: FloatSession, attempted: readonly string[], delivered: readonly string[]): FloatSession {
  const tried = new Set(attempted);
  return withReminders(session, (s) => ({
    ...s,
    fired: [...new Set([...s.fired, ...delivered])],
    pending: (s.pending ?? []).filter((id) => !tried.has(id)),
  }));
}

/** The notification a reminder becomes. */
export function reminderCopy(reminder: DueReminder): { title: string; body: string } {
  const distance = reminder.milesAway < 0.1 ? 'just ahead' : `about ${reminder.milesAway.toFixed(1)} mi ahead`;
  if (reminder.kind === 'stop') return { title: `${reminder.name} coming up`, body: `It is ${distance}, along the river.` };
  if (reminder.beyondMeters != null) {
    const beyond = reminder.beyondMeters >= 1_000 ? `${(reminder.beyondMeters / 1_000).toFixed(1)} km` : `${Math.round(reminder.beyondMeters / 50) * 50} m`;
    return {
      title: 'Take-out coming up',
      body: `The river’s closest point to ${reminder.name} is ${distance}. The take-out is about ${beyond} beyond it, off the mapped river.`,
    };
  }
  return { title: 'Take-out coming up', body: `${reminder.name} is ${distance}, along the river.` };
}
