import type { CampingPlace } from '@eddy/types';
import type { Coords } from '@eddy/geo';
import { filterCamping } from './campingHeatmap';
import type { CampingSort } from './campingStay';

export type CampingScope =
  | { kind: 'all' }
  | { kind: 'river'; slug: string }
  | { kind: 'favorites' }
  | { kind: 'nearby' };

/** What a location request is for: the Nearby scope or the Nearest sort. */
export type LocationPurpose = 'nearby' | 'nearest';

export interface CampingFilterState {
  scope: CampingScope;
  /** An explicit sort; null lets resolveCampingSort pick the default. */
  sort: CampingSort | null;
  locationRequest: number | null;
  /** Which control the pending or failed request belongs to. */
  locationPurpose: LocationPurpose | null;
  locationFailed: boolean;
}

type Action =
  | { type: 'select'; scope: CampingScope }
  | { type: 'sort'; sort: CampingSort }
  | { type: 'locate'; request: number; purpose?: LocationPurpose }
  | { type: 'located'; request: number; found: boolean }
  | { type: 'dismiss' };

const idle = { locationRequest: null, locationPurpose: null, locationFailed: false } as const;

export function initialCampingFilters(river: unknown): CampingFilterState {
  return {
    scope: typeof river === 'string' && /^[a-z0-9-]{1,80}$/.test(river)
      ? { kind: 'river', slug: river }
      : { kind: 'all' },
    sort: null,
    ...idle,
  };
}

/**
 * Keep the current rows and order until a fix arrives. Any later choice — a
 * scope or a sort — supersedes a pending request, so a slow fix can never
 * override what the reader picked after asking for it.
 */
export function campingFilterReducer(state: CampingFilterState, action: Action): CampingFilterState {
  switch (action.type) {
    case 'select':
      return { ...state, scope: action.scope, ...idle };
    case 'sort':
      return { ...state, sort: action.sort, ...idle };
    case 'locate':
      return { ...state, locationRequest: action.request, locationPurpose: action.purpose ?? 'nearby', locationFailed: false };
    case 'located': {
      if (state.locationRequest !== action.request) return state;
      const purpose = state.locationPurpose ?? 'nearby';
      if (!action.found) return { ...state, locationRequest: null, locationPurpose: purpose, locationFailed: true };
      return {
        ...state,
        ...(purpose === 'nearby' ? { scope: { kind: 'nearby' } as const } : { sort: 'nearest' as const }),
        ...idle,
      };
    }
    case 'dismiss':
      return { ...state, ...idle };
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
