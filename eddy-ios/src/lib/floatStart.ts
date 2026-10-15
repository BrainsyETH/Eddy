// Preview rules only. A preview fix never seeds the session's tracker or pace.
import { locateOnRoute, type LngLat, type RouteIndex } from '@eddy/geo';
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
  return [...route.anchors].filter(a => a.endpoint && a.riverMile <= startMile)
    .sort((a, b) => b.riverMile - a.riverMile)[0]?.id ?? null;
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

/** Discard this setup's native pages, preserving the screen that launched it. */
export function completedFloatRoutes<T extends { key?: string; name: string }>(
  routes: readonly T[],
  startKey: string,
) {
  const entry = routes.findIndex((route) => route.key === startKey);
  let cut = entry;
  if (cut < 0) {
    cut = routes.length;
    while (cut > 0 && routes[cut - 1].name === 'float-start') cut--;
  }
  return [...routes.slice(0, cut), { name: 'float-mode' }];
}
