import { finishFloatTotals } from '@eddy/geo';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { recordedOrigin } from './floatOrigin';
import { floatAccount, type FloatSession } from './floatSession';

/**
 * Explicit allowlist: the active session contains private raw positions.
 *
 * A float that reached the take-out and stayed ended there, however late
 * Finish was tapped. One that carried on past it, or never reached it, ends
 * when it was ended: Finish, or for an automatic end, where its movement
 * stopped or the paddler left the river (floatEnding.ts). floatSession.ts
 * floatAccount decides which.
 */
export function recapFloat(session: FloatSession, now: number): CompletedFloat {
  const account = floatAccount(session, now);
  const endedAt = Math.max(session.startedAt, account.until);
  const elapsedMs = endedAt - session.startedAt;
  const totals = account.totals;
  const origin = recordedOrigin(session);
  return {
    version: 1,
    id: session.id,
    riverSlug: session.route.riverSlug,
    riverName: session.route.riverName,
    putInId: origin.id,
    putInName: origin.name,
    ...(origin.note ? { startNote: origin.note } : {}),
    takeOutId: session.takeOut.id,
    takeOutName: session.takeOut.name,
    boatType: session.boatType ?? null,
    startedAt: session.startedAt,
    endedAt,
    elapsedMs,
    ...finishFloatTotals(totals, elapsedMs),
    plannerMph: session.plannerMph,
    firstMile: totals.firstMile,
    lastMile: totals.last?.riverMile ?? null,
    // Arrival is recorded once, from a confirmed position; ending later, away
    // from the river or out of signal, does not undo it.
    reachedTakeOut: session.arrivedAt != null,
    measurementVersion: 1,
    // What the recap says about the start and the river covered; each absent
    // on sessions that predate it (docs/float-history-card-plan.md, phase 2).
    ...(session.startCondition ? { startCondition: session.startCondition } : {}),
    ...(session.riverSpan ? { riverSpan: session.riverSpan } : {}),
    ...(totals.coveredMiles !== undefined ? { coveredMiles: totals.coveredMiles } : {}),
    ...(session.startWeather ? { startWeather: session.startWeather } : {}),
  };
}
