import { EMPTY_FLOAT_TOTALS, finishFloatTotals } from '@eddy/geo';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import type { FloatSession } from './floatSession';

/**
 * Explicit allowlist: the active session contains private raw positions.
 *
 * A float that reached the take-out ended there, however late Finish was
 * tapped (accounting stopped at arrival too; floatSession.ts applyFix). One
 * that did not ends when it was ended, or, for an automatic end, when the
 * paddler left the river (floatEnding.ts).
 */
export function recapFloat(session: FloatSession, now: number): CompletedFloat {
  const finished = session.arrivedAt ?? now;
  const endedAt = Math.max(session.startedAt, finished, session.totals?.last?.timestamp ?? 0);
  const elapsedMs = endedAt - session.startedAt;
  const totals = session.totals ?? EMPTY_FLOAT_TOTALS;
  return {
    version: 1,
    id: session.id,
    riverSlug: session.route.riverSlug,
    riverName: session.route.riverName,
    putInId: session.putIn?.id ?? null,
    putInName: session.putIn?.name ?? null,
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
  };
}
