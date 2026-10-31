// eddy-ios/src/lib/floatHazardData.ts
// Whether a float knows its hazards, and a bounded refresh of them at start.
//
// A route's `hazards` field carries three states, and River Mode must not
// blur them on a safety surface:
//   - absent: hazard data was never on the phone for this float (or a float
//     started by an older build), so "nothing ahead" is not known;
//   - []: hazards were loaded and none sit on this stretch's line;
//   - a list: the mapped hazards, in river order.
// routeFromRiver/withHazards (floatSession.ts) leave the field absent when no
// hazard lands on the line; withKnownHazards below writes [] instead whenever
// a hazard list was actually in hand.
//
// A float started from a cached river or a downloaded trip used to copy in
// whatever hazards the phone held, however old. refreshRouteHazards asks the
// API once, inside a short budget, and keeps what the route already had on
// any failure, so a slow or missing signal never holds the start.
//
// Pure (the fetch and offline hint are passed in), so it is tested from
// missouri-float-planner/src/lib/float-hazard-data.test.ts.

import type { Hazard } from '@eddy/types';
import type { RouteIndex } from '@eddy/geo';
import { placeHazards, type FloatRoute } from './floatSession';

export type HazardDataState = 'unavailable' | 'none' | 'mapped';

export function hazardDataState(route: Pick<FloatRoute, 'hazards'>): HazardDataState {
  if (!Array.isArray(route.hazards)) return 'unavailable';
  return route.hazards.length > 0 ? 'mapped' : 'none';
}

/**
 * Place a hazard list onto the route, replacing what it had. With no list in
 * hand (null/undefined) the route is returned unchanged: an unknown is never
 * turned into "none".
 */
export function withKnownHazards(route: FloatRoute, index: RouteIndex, hazards: readonly Hazard[] | null | undefined): FloatRoute {
  if (!Array.isArray(hazards)) return route;
  return { ...route, hazards: placeHazards(index, hazards) };
}

/** Long enough for one small request on a fair signal; short enough not to be noticed. */
export const HAZARD_REFRESH_BUDGET_MS = 4_000;

export interface HazardRefreshDeps {
  fetchHazards: (slug: string, signal: AbortSignal) => Promise<Hazard[]>;
  /** True only when the phone says it is offline; unknown is not offline. */
  offline?: () => Promise<boolean>;
}

/**
 * The route with fresh hazards when the API answers inside the budget, else
 * the route as it was. Never rejects, and never waits past the budget.
 */
export async function refreshRouteHazards(
  route: FloatRoute,
  index: RouteIndex,
  deps: HazardRefreshDeps,
  budgetMs = HAZARD_REFRESH_BUDGET_MS,
): Promise<FloatRoute> {
  if (await deps.offline?.().catch(() => false)) return route;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });
  try {
    const fresh = await Promise.race([deps.fetchHazards(route.riverSlug, controller.signal), timeout]);
    return fresh ? withKnownHazards(route, index, fresh) : route;
  } catch {
    return route;
  } finally {
    if (timer) clearTimeout(timer);
    // A late answer is dropped, not applied to a float that has started.
    controller.abort();
  }
}

/**
 * The line Float tools shows under "Ahead" about hazards, so an empty list
 * is never read as a clear river when Eddy simply has no hazard data.
 * `aheadCount` is the mapped hazards still ahead on this stretch. When the
 * caller also knows the total item count, known-empty coverage gets one line.
 */
export function hazardAheadNote(route: Pick<FloatRoute, 'hazards'>, aheadCount: number, itemCount?: number): string | null {
  if (hazardDataState(route) === 'unavailable') {
    return 'Hazard data isn’t available for this float. Eddy can’t show hazards ahead; watch the water.';
  }
  if (itemCount === 0) return 'No mapped stops or hazards ahead.';
  return aheadCount > 0 ? null : 'No mapped hazards ahead.';
}
