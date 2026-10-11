// Preview rules only. A preview fix never seeds the session's tracker or pace.
import { locateOnRoute, type LngLat, type RouteIndex } from '@eddy/geo';

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
