// eddy-ios/src/float/loadFloatRoute.ts
// The river line and access points a float needs, from the phone first.
//
// The launch bundle seeds every river's line and put-ins (see
// seedOfflineBundle), so at a put-in with no signal this normally answers from
// disk. Only when the cache lacks a part does it ask the network, and a failed
// request is reported as exactly that, never as a route.

import { ApiError, fetchRiverAccessPoints, fetchRiverDetail } from '@/api/client';
import { readRiver } from '@/lib/riverCache';
import { routeFromRiver, type FloatRoute, type RouteProblem } from '@/lib/floatSession';
import type { RouteIndex } from '@eddy/geo';

export type LoadedRoute =
  | { ok: true; route: FloatRoute; index: RouteIndex }
  | { ok: false; reason: RouteProblem | 'offline' };

export async function loadFloatRoute(slug: string, signal?: AbortSignal): Promise<LoadedRoute> {
  const cached = await readRiver(slug);
  let river = cached?.payload.river;
  let accessPoints = cached?.payload.accessPoints;
  let fetchedAt = cached?.fetchedAt ?? null;

  if (!river || !accessPoints) {
    try {
      const [liveRiver, liveAccess] = await Promise.all([
        river ? Promise.resolve(river) : fetchRiverDetail(slug, signal),
        accessPoints ? Promise.resolve(accessPoints) : fetchRiverAccessPoints(slug, signal),
      ]);
      river = liveRiver;
      accessPoints = liveAccess;
      fetchedAt = new Date().toISOString();
    } catch (error) {
      if (error instanceof ApiError && error.message === 'Request cancelled') throw error;
      return { ok: false, reason: 'offline' };
    }
  }

  return routeFromRiver(river, accessPoints, fetchedAt);
}

/** What to tell someone whose float cannot start, in their terms. */
export function routeProblemCopy(reason: RouteProblem | 'offline'): string {
  switch (reason) {
    case 'offline':
      return 'Eddy doesn’t have this river saved on your phone yet, and can’t reach the internet to get it. Try again with a signal.';
    case 'no-river-data':
      return 'Eddy doesn’t have the river line and access points for this float.';
    case 'no-take-out':
      return 'That take-out isn’t on this river anymore. Choose another one.';
    case 'take-out-upstream':
      return 'That take-out is upstream of where this float starts.';
    case 'too-few-points':
    case 'too-few-anchors':
    case 'anchor-off-line':
    case 'anchors-out-of-order':
    case 'length-disagreement':
      return 'Eddy’s map data for this stretch doesn’t line up well enough to track progress honestly, so Float Mode isn’t available here yet.';
  }
}
