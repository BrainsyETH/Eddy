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
//   Known hazards that can hurt (danger, warning, or a required portage) get
//   a heads-up too, on by default.
//   Ending prompts (floatEnding.ts: arrived, "Still floating?") ride the same
//   pending/sent bookkeeping but not the live-position gate: they are about
//   having arrived or left, which the session already recorded.
//   "Sent" means the phone accepted the notification. A reminder is PENDING
//   while it is being handed over: written to disk first, then scheduled,
//   then marked sent only if scheduling succeeded. A failure leaves it
//   eligible again. Pending is cleared on a relaunch, so a crash mid-handover
//   can at worst repeat a reminder once, never lose it: a second heads-up
//   beats a missed take-out.

import type { RouteIndex } from '@eddy/geo';
import { hazardTypeLabel } from '@eddy/hazards';
import { placeEnd, type FloatSession, type RouteAnchor, type RouteHazard } from './floatSession';
import { ARRIVED_PROMPT_ID, AWAY_PROMPT_ID, endPromptsDue } from './floatEnding';

/** Heads-up distance before the take-out: about 10-15 minutes on the water. */
export const TAKE_OUT_LEAD_MILES = 0.5;
/** Heads-up distance before a chosen stop. */
export const STOP_LEAD_MILES = 0.25;
/** Heads-up distance before a serious hazard: time to get to the right bank. */
export const HAZARD_LEAD_MILES = 0.25;
/**
 * Hazards worth a notification: the same rule as @eddy/hazards'
 * criticalHazards (danger, warning, or a required portage). The rest stay on
 * screen only, so a heads-up keeps meaning something.
 */
export function isRemindedHazard(hazard: Pick<RouteHazard, 'severity' | 'portageRequired'>): boolean {
  return hazard.severity === 'danger' || hazard.severity === 'warning' || hazard.portageRequired === true;
}
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
  /** Remind before serious hazards. Absent means on. */
  hazards?: boolean;
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
  kind: 'take-out' | 'stop' | 'hazard' | 'arrived' | 'away';
  /** Along-river miles left to it when it fired; 0 for the ending prompts. */
  milesAway: number;
  /** For a take-out off the mapped river: how far it sits beyond the river. */
  beyondMeters?: number;
  /** For a hazard. */
  hazard?: Pick<RouteHazard, 'type' | 'portageRequired' | 'portageSide'>;
}

export const hazardReminderId = (id: string) => `hazard:${id}`;

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
  const done = new Set([...settings.fired, ...(settings.pending ?? [])]);
  const prompts: DueReminder[] = endPromptsDue(session, now).map((kind) => ({
    id: kind === 'arrived' ? ARRIVED_PROMPT_ID : AWAY_PROMPT_ID,
    name: session.takeOut.name,
    kind,
    milesAway: 0,
    ...(kind === 'arrived' && session.takeOut.offLineMeters != null ? { beyondMeters: session.takeOut.offLineMeters } : {}),
  }));
  return [...prompts, ...dueAlongRiver(session, index, now, settings)].filter((reminder) => !done.has(reminder.id));
}

function dueAlongRiver(session: FloatSession, index: RouteIndex, now: number, settings: FloatReminderSettings): DueReminder[] {
  const hazardsOn = settings.hazards !== false;
  if (!settings.takeOut && settings.stops.length === 0 && !hazardsOn) return [];
  if (session.awaitingFix || session.arrivedAt != null || session.riverEndAt != null) return [];
  const last = session.last;
  if (!last || last.result.kind !== 'matched' || now - last.at > LIVE_POSITION_MS) return [];

  const here = last.result.riverMile;
  // Moving upstream, away from everything ahead: no heads-up.
  const earlier = [...session.samples].reverse().find((sample) => sample.timestamp <= last.at - DIRECTION_WINDOW_MS);
  if (earlier && here < earlier.riverMile - UPSTREAM_TOLERANCE_MILES) return [];

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
  if (hazardsOn) {
    for (const hazard of session.route.hazards ?? []) {
      if (!isRemindedHazard(hazard) || hazard.riverMile > session.takeOut.riverMile) continue;
      targets.push({
        id: hazardReminderId(hazard.id),
        name: hazard.name,
        kind: 'hazard',
        mile: hazard.riverMile,
        lead: HAZARD_LEAD_MILES,
        milesAway: 0,
        hazard: { type: hazard.type, portageRequired: hazard.portageRequired, portageSide: hazard.portageSide },
      });
    }
  }

  return targets
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
  const distance = reminder.milesAway < 0.1 ? 'Just ahead' : `About ${reminder.milesAway.toFixed(1)} mi ahead`;
  const beyond =
    reminder.beyondMeters == null
      ? null
      : reminder.beyondMeters >= 1_000
        ? `${(reminder.beyondMeters / 1_000).toFixed(1)} km`
        : `${Math.round(reminder.beyondMeters / 50) * 50} m`;
  switch (reminder.kind) {
    case 'stop':
      return { title: `${reminder.name} coming up`, body: `${distance}, along the river.` };
    case 'hazard': {
      const label = hazardTypeLabel(reminder.hazard?.type ?? 'other');
      const portage = reminder.hazard?.portageRequired ? ` ${portageCopy(reminder.hazard.portageSide)}` : '';
      return { title: `${label} ahead: ${reminder.name}`, body: `${distance}, along the river.${portage}` };
    }
    case 'arrived':
      // The arrival threshold can fire before the landing (or after passing
      // it). An off-map endpoint is still farther on: finish only off the water.
      return beyond != null
        ? {
            title: `You’re near ${reminder.name}`,
            body: `The take-out is about ${beyond} beyond the river’s closest point on Eddy’s map. Finish your float in Eddy once you’re off the water to stop tracking and save your recap.`,
          }
        : { title: `Arriving at ${reminder.name}`, body: 'Finish your float in Eddy once you’re off the water to stop tracking and save your recap.' };
    case 'away':
      return {
        title: 'Still floating?',
        body: 'You look to have left the river. If you’re done, finish your float in Eddy to stop tracking. Otherwise Eddy will end it for you.',
      };
    case 'take-out':
      return beyond != null
        ? {
            title: `${reminder.name} take-out is approaching`,
            body: `${distance} to the river’s closest point. The take-out is about ${beyond} beyond it, off the mapped river.`,
          }
        : { title: `${reminder.name} take-out is approaching`, body: `${distance}, along the river.` };
  }
}

function portageCopy(side: RouteHazard['portageSide']): string {
  switch (side) {
    case 'left':
      return 'Portage river left.';
    case 'right':
      return 'Portage river right.';
    case 'either':
      return 'Portage either side.';
    default:
      return 'Portage required.';
  }
}
