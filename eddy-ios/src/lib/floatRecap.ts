import { finishFloatTotals } from '@eddy/geo';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { spanCalibration } from '@eddy/conditions/float-recap';
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
  // An unconfirmed launch must not be relabelled as the selected put-in.
  // Without any recording, a selected put-in still describes the planned map.
  const fromPutIn = session.putIn && (origin.id === session.putIn.id || session.startMile == null);
  const startMile = fromPutIn ? session.putIn!.riverMile : session.startMile;
  const routeSnapshot = startMile != null && Number.isFinite(startMile) && session.takeOut.riverMile > startMile
    ? {
      startMile, takeOutMile: session.takeOut.riverMile,
      startName: fromPutIn ? session.putIn!.name : 'Recorded start',
      calibration: spanCalibration(session.route.anchors),
    } : null;
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
    ...(routeSnapshot ? { routeSnapshot } : {}),
  };
}
