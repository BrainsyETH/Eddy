// Preview rules only. A preview fix never seeds the session's tracker or pace.
import { locateOnRoute, type LngLat, type RouteIndex } from '@eddy/geo';
import type { StartCondition } from '@eddy/conditions/float-archive';
import { nearLaunch } from './floatOrigin';
import type { FloatRoute } from './floatSession';

export interface FloatSetup {
  riverSlug?: string;
  putInId?: string;
  takeOutId?: string;
  boatType?: string;
}

/** Only an unchanged route may reuse a saved plan's package or share code. */
export function sameFloatStretch(a: FloatSetup, b: FloatSetup): boolean {
  return Boolean(a.riverSlug && a.putInId && a.takeOutId &&
    a.riverSlug === b.riverSlug && a.putInId === b.putInId && a.takeOutId === b.takeOutId);
}

/** Includes the GPS origin. A revised stretch cannot inherit old tiles or estimates. */
export function floatSetupKey(setup: FloatSetup, origin?: LngLat | null): string {
  return [setup.riverSlug ?? '', setup.putInId ?? (origin ? origin.join(',') : 'location'), setup.takeOutId ?? ''].join('|');
}

/** Use an eligible upstream anchor to bound the server's partial-stretch estimate. */
export function estimateStartId(route: FloatRoute, putInId: string | undefined, startMile: number | null): string | null {
  if (putInId) return putInId;
  if (startMile == null || !Number.isFinite(startMile)) return null;
  const ends = route.anchors.filter(a => a.endpoint).sort((a, b) => a.riverMile - b.riverMile);
  const upstream = ends.filter(a => a.riverMile <= startMile).at(-1);
  return upstream?.id ?? (ends[0] && ends[0].riverMile - startMile <= 0.1 ? ends[0].id : null);
}

/** Never reuse a typical, withheld, expired, or future-dated result as current water. */
export function currentMovingSpeed(result: {
  estimateBasis: string;
  estimatedAt: string;
  floatTime: { movingSpeedMph?: number | null } | null;
} | null, now: number): number | null {
  if (!result || result.estimateBasis !== 'today') return null;
  const age = now - Date.parse(result.estimatedAt);
  const speed = result.floatTime?.movingSpeedMph;
  return age >= 0 && age < 5 * 60_000 && speed != null && Number.isFinite(speed) && speed > 0 ? speed : null;
}

/**
 * The condition a float started now keeps in its recap.
 *
 * Its own rule, never currentMovingSpeed's: float time is withheld at Flood
 * and on dam tailwaters, so a speed rule would drop the condition on exactly
 * the floats it matters most for. Only the estimate's freshness is judged
 * here; the gauge reading's own age and quality travel with it and are
 * judged against the start (float-recap.ts floatCondition).
 */
export function currentStartCondition(result: {
  estimateBasis: string;
  estimatedAt: string;
  condition?: StartCondition | null;
} | null, now: number): StartCondition | null {
  const condition = result?.condition;
  if (!result || !condition || result.estimateBasis !== 'today') return null;
  const age = now - Date.parse(result.estimatedAt);
  if (!(age >= 0 && age < 5 * 60_000)) return null;
  return typeof condition.code === 'string' && (condition.code as string) !== 'unknown' &&
    typeof condition.gaugeName === 'string' && (condition.usgsSiteId === null || typeof condition.usgsSiteId === 'string') &&
    typeof condition.observedAt === 'string' && typeof condition.accuracyWarning === 'boolean'
    ? condition
    : null;
}

export interface StartFix {
  point: LngLat;
  accuracy: number | null;
  timestamp: number;
}

export const START_FIX_MAX_AGE_MS = 120_000;

export function usableStartFix(fix: StartFix | null, now: number): fix is StartFix {
  return Boolean(
    fix &&
      Number.isFinite(fix.timestamp) &&
      now >= fix.timestamp &&
      now - fix.timestamp < START_FIX_MAX_AGE_MS &&
      fix.accuracy != null &&
      Number.isFinite(fix.accuracy) &&
      fix.accuracy >= 0 &&
      fix.accuracy <= 100 &&
      Number.isFinite(fix.point[0]) &&
      Math.abs(fix.point[0]) <= 180 &&
      Number.isFinite(fix.point[1]) &&
      Math.abs(fix.point[1]) <= 90,
  );
}

/** Nearby access-point suggestions are not evidence that someone is on a river. */
export function startRiverPosition(index: RouteIndex, fix: StartFix | null, now: number) {
  if (!usableStartFix(fix, now)) return null;
  const hit = locateOnRoute(index, fix.point);
  return hit && hit.offsetMeters <= 150 ? hit : null;
}

/** "Near" requires both a good fix and proximity to the access itself. */
export function putInLocation(index: RouteIndex, fix: StartFix | null, now: number,
  putIn: { name: string; lngLat: LngLat; mile: number }) {
  if (!usableStartFix(fix, now)) return null;
  const hit = startRiverPosition(index, fix, now);
  if (nearLaunch(fix.point, fix.accuracy, putIn.lngLat)) return {
    label: `Near ${putIn.name}`, canSwitch: false,
    ...(!hit ? { note: 'This launch is outside Eddy’s mapped river. Distance tracking begins when GPS finds you on the mapped river.' } : {}),
  };
  if (!hit) return null;
  const delta = hit.riverMile - putIn.mile;
  return { label: Math.abs(delta) < 0.1
    ? `GPS puts you by ${putIn.name} · check your launch`
    : `${Math.abs(delta).toFixed(1)} mi ${delta > 0 ? 'below' : 'above'} ${putIn.name}`,
    canSwitch: true };
}
