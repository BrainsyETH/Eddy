// eddy-ios/src/lib/floatEnding.ts
// Ending a float nobody remembered to end.
//
// People reach the take-out, load the boat and drive home with Eddy still
// tracking: high-accuracy GPS for hours, and a recap whose "total time"
// includes the drive. The common answer (Apple Watch workouts, Strava, Garmin)
// is to ask first and only then act, and that is the shape here:
//
//   arrived   a notification as the take-out is reached, offering Finish.
//   away      fixes keep placing the paddler more than a kilometre from the
//             river (floatSession.ts AWAY_FROM_RIVER_M) for AWAY_PROMPT_MS:
//             "Still floating?".
//   auto-end  still not ended AUTO_END_AFTER_ARRIVAL_MS after arriving, or
//             AUTO_END_AWAY_MS after leaving the river: Eddy ends the float
//             itself, says so, and saves the recap at the moment the float
//             actually finished (arrival, or leaving the river), not when the
//             phone noticed.
//
// Nothing here ends a float for being slow, stopped, or out of signal: a long
// lunch, an overnight on a gravel bar, or a dead zone all keep tracking. Only
// arriving, or going well away from the river, starts the clock.
//
// Pure, like floatSession.ts; covered by missouri-float-planner/src/lib/
// float-reminders.test.ts. Prompts travel through the reminder machinery in
// floatReminders.ts, so they get the same pending/sent bookkeeping.

import type { FloatSession } from './floatSession';

/** "Still floating?" after this long away from the river. */
export const AWAY_PROMPT_MS = 10 * 60_000;
/** Ended automatically this long after arriving at the take-out. */
export const AUTO_END_AFTER_ARRIVAL_MS = 60 * 60_000;
/** Ended automatically this long after leaving the river. */
export const AUTO_END_AWAY_MS = 45 * 60_000;

export const ARRIVED_PROMPT_ID = 'arrived';
export const AWAY_PROMPT_ID = 'away';

export type EndPromptKind = 'arrived' | 'away';

/** Prompts this session has reached, before filtering out ones already sent. */
export function endPromptsDue(session: FloatSession, now: number): EndPromptKind[] {
  const due: EndPromptKind[] = [];
  if (session.arrivedAt != null) due.push('arrived');
  if (session.awaySince != null && now - session.awaySince >= AWAY_PROMPT_MS) due.push('away');
  return due;
}

/**
 * When the float should be recorded as having ended, if it is time to end it
 * automatically; otherwise null. Arrival wins: it is when the float finished.
 */
export function autoEndAt(session: FloatSession | null, now: number): number | null {
  if (!session) return null;
  if (session.arrivedAt != null && now - session.arrivedAt >= AUTO_END_AFTER_ARRIVAL_MS) return session.arrivedAt;
  if (session.awaySince != null && now - session.awaySince >= AUTO_END_AWAY_MS) return session.awaySince;
  return null;
}

/** The notification an automatic end shows. */
export function autoEndCopy(session: FloatSession): { title: string; body: string } {
  return session.arrivedAt != null
    ? { title: 'Float finished', body: `Eddy ended your float at ${session.takeOut.name} and saved your recap.` }
    : {
        title: 'Float ended',
        body: `You looked to have left the ${session.route.riverName}, so Eddy stopped tracking and saved your recap.`,
      };
}
