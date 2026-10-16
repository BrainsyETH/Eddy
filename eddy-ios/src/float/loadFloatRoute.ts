// eddy-ios/src/float/loadFloatRoute.ts
// The river line and access points a float needs, from the phone first.
//
// A downloaded trip's own route package comes first: it is saved outside the
// cache and cannot be cleared with it, and it fixes the distance basis the
// trip's map was planned on. Otherwise the cached river: the launch bundle
// seeds every river's line and put-ins (see seedOfflineBundle), so at a put-in
// with no signal this normally answers from disk. Only when the cache lacks a
// part does it ask the network, and a failed request is reported as exactly
// that, never as a route.
//
// Known hazards ride along when the phone has them (the launch bundle seeds
// them with the put-ins). They are never fetched to start a float and never
// block one: a float with no hazard data simply shows none ahead.

import { ApiError, fetchRiverAccessPoints, fetchRiverDetail } from '@/api/client';
import { readRiver } from '@/lib/riverCache';
import { indexRoute, routeFromRiver, withHazards, type FloatRoute, type RouteProblem } from '@/lib/floatSession';
import type { RouteIndex } from '@eddy/geo';
import type { MapAccessPoint } from '@eddy/types';
import { readTripPackage } from './tripDownloads';

export type LoadedRoute =
  | { ok: true; riverId?: string; route: FloatRoute; index: RouteIndex; accessPoints?: readonly MapAccessPoint[] }
  | { ok: false; reason: RouteProblem | 'offline' };

export async function loadFloatRoute(slug: string, signal?: AbortSignal, tripKey?: string | null): Promise<LoadedRoute> {
  const cached = await readRiver(slug);
  if (tripKey) {
    const pkg = await readTripPackage(tripKey);
    if (pkg && pkg.route.riverSlug === slug) {
      const built = indexRoute(pkg.route);
      // A package saved before hazards were carried takes them from the cache.
      if (built.ok) return {
        ok: true,
        riverId: cached?.payload.river?.id,
        route: withHazards(pkg.route, built.index, cached?.payload.hazards),
        index: built.index,
        accessPoints: cached?.payload.accessPoints,
      };
    }
  }
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

  const loaded = routeFromRiver(river, accessPoints, fetchedAt, cached?.payload.hazards);
  // Picker photos stay separate from the route saved with every GPS update.
  return loaded.ok ? { ...loaded, riverId: river.id, accessPoints } : loaded;
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
      return 'Eddy’s map data for this stretch doesn’t line up well enough to track progress honestly, so River Mode isn’t available here yet.';
  }
}
