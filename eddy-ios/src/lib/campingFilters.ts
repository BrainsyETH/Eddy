import type { CampingPlace } from '@eddy/types';
import type { Coords } from '@eddy/geo';
import { filterCamping } from './campingHeatmap';

export type CampingScope =
  | { kind: 'all' }
  | { kind: 'river'; slug: string }
  | { kind: 'favorites' }
  | { kind: 'nearby' };

export interface CampingFilterState {
  scope: CampingScope;
  locationRequest: number | null;
  locationFailed: boolean;
}

type Action =
  | { type: 'select'; scope: CampingScope }
  | { type: 'locate'; request: number }
  | { type: 'located'; request: number; found: boolean };

export function initialCampingFilters(river: unknown): CampingFilterState {
  return {
    scope: typeof river === 'string' && /^[a-z0-9-]{1,80}$/.test(river)
      ? { kind: 'river', slug: river }
      : { kind: 'all' },
    locationRequest: null,
    locationFailed: false,
  };
}

/** Keep the current rows until Nearby has a fix; a later choice cancels its result. */
export function campingFilterReducer(state: CampingFilterState, action: Action): CampingFilterState {
  switch (action.type) {
    case 'select':
      return { scope: action.scope, locationRequest: null, locationFailed: false };
    case 'locate':
      return { ...state, locationRequest: action.request, locationFailed: false };
    case 'located':
      if (state.locationRequest !== action.request) return state;
      return {
        scope: action.found ? { kind: 'nearby' } : state.scope,
        locationRequest: null,
        locationFailed: !action.found,
      };
  }
}

/** Tracked availability and the campground directory use the same exclusive scope. */
export function filterCampingScope<T extends CampingPlace>(
  rows: T[],
  scope: CampingScope,
  coords: Coords | null,
  favoriteRivers: ReadonlySet<string>,
): T[] {
  return filterCamping(rows, scope.kind === 'river' ? scope.slug : null, scope.kind === 'nearby', coords)
    .filter((row) => scope.kind !== 'favorites' || row.riverSlugs.some((slug) => favoriteRivers.has(slug)));
}
