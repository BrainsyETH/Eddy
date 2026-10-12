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
//             unbroken evidence of being away: Eddy ends the float itself,
//             says so, and saves the recap at the moment the float actually
//             finished, not when the phone noticed.
//
// Away is judged on evidence, never on a timer alone: a GPS gap, a fix back
// on the river that is still being confirmed, or a bank within a kilometre
// all stop the clock (floatSession.ts applyFix clears awaySince), and a
// stale away fix ends nothing. Nothing here ends a float for being slow,
// stopped, or out of signal.
//
// Pure, like floatSession.ts; covered by missouri-float-planner/src/lib/
// float-reminders.test.ts. Prompts travel through the reminder machinery in
// floatReminders.ts, so they get the same pending/sent bookkeeping.

import { AWAY_FROM_RIVER_M, STALE_POSITION_MS, type FloatSession } from './floatSession';

/** "Still floating?" after this long away from the river. */
export const AWAY_PROMPT_MS = 10 * 60_000;
/** Ended automatically this long after arriving at the take-out. */
export const AUTO_END_AFTER_ARRIVAL_MS = 60 * 60_000;
/** Ended automatically this long after leaving the river. */
export const AUTO_END_AWAY_MS = 45 * 60_000;

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
  if (awayNow(session, now) && now - session.awaySince! >= AWAY_PROMPT_MS) due.push('away');
  return due;
}

/**
 * When the float should be recorded as having ended, if it is time to end it
 * automatically; otherwise null. Arrival wins: it is when the float finished.
 */
export function autoEndAt(session: FloatSession | null, now: number): number | null {
  if (!session) return null;
  if (session.arrivedAt != null && now - session.arrivedAt >= AUTO_END_AFTER_ARRIVAL_MS) return session.arrivedAt;
  if (session.riverEndAt != null && now - session.riverEndAt >= AUTO_END_AFTER_ARRIVAL_MS) return session.riverEndAt;
  if (awayNow(session, now) && now - session.awaySince! >= AUTO_END_AWAY_MS) return session.awaySince!;
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
