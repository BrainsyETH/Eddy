// eddy-ios/src/lib/floatEnding.ts
// Ending a float nobody remembered to end.
//
// People reach the take-out, load the boat and drive home with Eddy still
// tracking: high-accuracy GPS for hours, and a recap whose "total time"
// includes the drive. The common answer (Apple Watch workouts, Strava, Garmin)
// is to ask first and only then act, and that is the shape here:
//
//   arrived   a notification as the take-out is reached, offering Finish. For
//             a take-out off the mapped river, the same prompt says the
//             paddler is at the river's closest point, never that they
//             arrived.
//   away      the latest fix, fresh, still places the paddler more than a
//             kilometre from the river (floatSession.ts AWAY_FROM_RIVER_M),
//             and every usable fix for AWAY_PROMPT_MS has agreed: "Still
//             floating?".
//   auto-end  still not ended AUTO_END_AFTER_ARRIVAL_MS after arriving (or
//             reaching the river's end), or after AUTO_END_AWAY_MS of fresh,
//             unbroken evidence of being away (floatSession.ts awayMs, which
//             a GPS outage does not add to): Eddy ends the float itself,
//             says so, and saves the recap at the moment the float actually
//             finished, not when the phone noticed.
//
// Away is judged on evidence, never on a timer alone: a GPS gap, a fix back
// on the river that is still being confirmed, or a bank within a kilometre
// all stop the clock (floatSession.ts applyFix clears awaySince), and a
// stale away fix ends nothing. Nothing here ends a float for being slow,
// stopped, or out of signal.
//
// Arrival is judged on evidence too. Reaching the take-out starts the hour,
// but a paddler whose confirmed positions keep moving downstream past it has
// not finished: they chose the wrong take-out, or decided to go on. The end
// waits until that movement stops (continuingPastEnd). Reaching the take-out
// and ending are separate: the recap says the take-out was reached, and a
// float that carried on past it ends, and is counted, where that movement
// stopped (floatSession.ts floatAccount), not back at the take-out.
//
// Pure, like floatSession.ts; covered by missouri-float-planner/src/lib/
// float-reminders.test.ts. Prompts travel through the reminder machinery in
// floatReminders.ts, so they get the same pending/sent bookkeeping.

import { ARRIVAL_MILES } from '@eddy/geo';
import { AWAY_FROM_RIVER_M, STALE_POSITION_MS, movementEndedAt, type FloatSession } from './floatSession';

/** "Still floating?" after this long away from the river. */
export const AWAY_PROMPT_MS = 10 * 60_000;
/** Ended automatically this long after arriving at the take-out. */
export const AUTO_END_AFTER_ARRIVAL_MS = 60 * 60_000;
/** Ended automatically this long after leaving the river. */
export const AUTO_END_AWAY_MS = 45 * 60_000;
/**
 * Confirmed movement downstream over this window, past the take-out, means
 * the paddler is still floating: the arrival end waits.
 */
export const CONTINUING_WINDOW_MS = 15 * 60_000;
export const CONTINUING_MIN_MILES = 0.1;
/**
 * A float this young, or that has measured less than this, can be discarded
 * without a recap: an accidental Start, not a trip anyone wants in history.
 */
export const SHORT_FLOAT_MS = 5 * 60_000;
export const SHORT_FLOAT_MILES = 0.1;

/**
 * The paddler's confirmed positions are past the take-out and still moving
 * downstream: the latest is fresh, beyond the arrival threshold, and at least
 * CONTINUING_MIN_MILES past where they were CONTINUING_WINDOW_MS ago.
 */
export function continuingPastEnd(session: FloatSession, now: number): boolean {
  const samples = session.samples;
  const latest = samples[samples.length - 1];
  if (!latest || now - latest.timestamp > CONTINUING_WINDOW_MS) return false;
  if (latest.riverMile - session.takeOut.riverMile <= ARRIVAL_MILES) return false;
  const earlier = samples.find((sample) => sample.timestamp >= latest.timestamp - CONTINUING_WINDOW_MS);
  return earlier != null && earlier !== latest && latest.riverMile - earlier.riverMile >= CONTINUING_MIN_MILES;
}

/**
 * Nothing worth a recap yet: started moments ago, or no measured progress.
 * River Mode offers Discard alongside End while this holds.
 */
export function isShortFloat(session: FloatSession, now: number): boolean {
  return discardReason(session, now) != null;
}

/**
 * Why Discard is on offer, so the End dialog can say so plainly. "Unplaced"
 * matters most: a float that never found the river after hours is short by
 * this rule (nothing was measured), and "nothing much has been recorded"
 * reads wrong to someone who has been out all day under poor GPS.
 */
export function discardReason(session: FloatSession, now: number): 'young' | 'unplaced' | 'stationary' | null {
  const latest = session.samples[session.samples.length - 1];
  const placed = latest != null && session.startMile != null;
  if (now - session.startedAt < SHORT_FLOAT_MS) return 'young';
  if (!placed) return 'unplaced';
  // Both net and gross: an out-and-back trip ends where it began, and a real
  // four-mile paddle must not be offered for discard as "no progress".
  const travelled = (session.totals?.distanceMiles ?? 0) + (session.totals?.runDistanceMiles ?? 0);
  return Math.abs(latest.riverMile - session.startMile!) < SHORT_FLOAT_MILES && travelled < SHORT_FLOAT_MILES
    ? 'stationary'
    : null;
}

/** The End dialog's message when Discard is on offer. */
export function discardCopy(reason: 'young' | 'unplaced' | 'stationary'): string {
  switch (reason) {
    case 'young':
      return 'This float just started, so nothing much has been recorded. Discard it, or end it and keep a recap in your float history.';
    case 'unplaced':
      return 'Eddy never placed you on the river, so there’s no distance to keep. Discard it, or end it and keep a recap of your time in your float history.';
    case 'stationary':
      return 'Eddy recorded less than a tenth of a mile of progress. Discard it, or end it and keep a recap in your float history.';
  }
}

export const ARRIVED_PROMPT_ID = 'arrived';
export const AWAY_PROMPT_ID = 'away';

export type EndPromptKind = 'arrived' | 'away';

/**
 * The paddler is away from the river right now: the latest usable fix is
 * fresh and well off it, and awaySince records how long that has held.
 */
export function awayNow(session: FloatSession, now: number): boolean {
  const last = session.last;
  return (
    session.awaySince != null &&
    last != null &&
    last.result.kind === 'off-route' &&
    last.result.offsetMeters > AWAY_FROM_RIVER_M &&
    now - last.at <= STALE_POSITION_MS
  );
}

/** Prompts this session has reached, before filtering out ones already sent. */
export function endPromptsDue(session: FloatSession, now: number): EndPromptKind[] {
  const due: EndPromptKind[] = [];
  if (session.arrivedAt != null || session.riverEndAt != null) due.push('arrived');
  if (awayNow(session, now) && (session.awayMs ?? 0) >= AWAY_PROMPT_MS) due.push('away');
  return due;
}

/**
 * When the float should be recorded as having ended, if it is time to end it
 * automatically; otherwise null. Arrival wins: it is when the float finished.
 */
export function autoEndAt(session: FloatSession | null, now: number): number | null {
  if (!session) return null;
  const reached = session.arrivedAt ?? session.riverEndAt;
  if (reached != null && now - reached >= AUTO_END_AFTER_ARRIVAL_MS && !continuingPastEnd(session, now)) {
    return session.pastTakeOut ? Math.max(reached, movementEndedAt(session) ?? reached) : reached;
  }
  if (awayNow(session, now) && (session.awayMs ?? 0) >= AUTO_END_AWAY_MS) return session.awaySince!;
  return null;
}

/** The notification an automatic end shows. Never claims an arrival nobody confirmed. */
export function autoEndCopy(session: FloatSession): { title: string; body: string } {
  if (session.arrivedAt != null) {
    return { title: 'Float finished', body: `Eddy ended your float at ${session.takeOut.name} and saved your recap.` };
  }
  if (session.riverEndAt != null) {
    return {
      title: 'Float ended',
      body: `Eddy stopped tracking at the river’s closest point to ${session.takeOut.name} and saved your recap.`,
    };
  }
  return {
    title: 'Float ended',
    body: `You looked to have left the ${session.route.riverName}, so Eddy stopped tracking and saved your recap.`,
  };
}
