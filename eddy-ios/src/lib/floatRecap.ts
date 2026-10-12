import { EMPTY_FLOAT_TOTALS, finishFloatTotals } from '@eddy/geo';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { viewSession, type FloatSession } from './floatSession';

/** Explicit allowlist: the active session contains private raw positions. */
export function recapFloat(session: FloatSession, now: number): CompletedFloat {
  const endedAt = Math.max(session.startedAt, now, session.totals?.last?.timestamp ?? 0);
  const elapsedMs = endedAt - session.startedAt;
  const totals = session.totals ?? EMPTY_FLOAT_TOTALS;
  const view = viewSession(session, endedAt);
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
    reachedTakeOut: view.status === 'live' && view.arrived,
    measurementVersion: 1,
  };
}
