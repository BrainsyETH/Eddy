import type { RiverListItem, ConditionCode } from '@/types/api';
import type { DamSnapshot } from '@shared/dam-types';
import type { RiverGroup } from '@/lib/river-groups';
import { CONDITION_SYSTEM } from '@shared/condition-system';
import {
  buildRiverFilterMeta, conditionSortRank, haversineMiles, isFloatableNow,
  isRiverSortKey, isValidCoords, lengthBucket,
  type Coordinates, type RiverFilterMeta, type RiverSortKey,
} from '@/lib/rivers/filters';
import { stateName } from '@/lib/navigation/states';
import { isNavigationDam } from '@/lib/data/dam-grouping';

export type ConditionsKind = 'all' | 'rivers' | 'dams';
export type ConditionsSort = RiverSortKey | 'featured';
export interface ConditionsState {
  kind: ConditionsKind;
  q: string;
  state: string;
  sort: ConditionsSort;
  condition: string;
  floatable: boolean;
  type: string;
  diff: string;
  len: string;
}

interface DestinationBase {
  key: string;
  name: string;
  names: string[];
  state: string;
  href: string;
  coordinates?: Coordinates;
  aliases: string[];
  related: { term: string; label: string }[];
}
export type ConditionsDestination = DestinationBase & (
  | { kind: 'rivers'; river: RiverListItem; meta: RiverFilterMeta; group?: RiverGroup }
  | { kind: 'dams'; dam: DamSnapshot }
);

// Editorial choices, not measured popularity. These four slots mix both kinds.
export const FEATURED_DESTINATIONS = [
  'dam:swl-table-rock-dam', 'dam:swl-bull-shoals-dam', 'river:current', 'river:buffalo',
] as const;
export const DAM_DISCOVERY_ORDER = [
  'swl-table-rock-dam', 'swl-bull-shoals-dam', 'ameren-bagnell-dam',
  'swl-norfork-dam', 'swl-beaver-dam', 'swl-greers-ferry-dam',
] as const;

const ALIASES: Record<string, string[]> = {
  'dam:ameren-bagnell-dam': ['Lake Ozark', 'LOTO'],
};
const RELATED: Record<string, { term: string; label: string }[]> = {
  'dam:swl-table-rock-dam': [{ term: 'Lake Taneycomo', label: 'Releases into Lake Taneycomo' }],
};
const RIVER_FILTERS = ['condition', 'floatable', 'diff', 'len', 'type'] as const;
const RIVER_SORTS = new Set(['best', 'length_asc', 'length_desc']);
const isKind = (value: string | null): value is ConditionsKind => value === 'all' || value === 'rivers' || value === 'dams';
const isActive = (value: string | null) => Boolean(value && value !== 'all' && value !== '0');

export function parseConditionsState(params: URLSearchParams, defaultKind: ConditionsKind = 'all'): ConditionsState {
  const explicit = params.get('kind');
  const legacyRiver = RIVER_FILTERS.some(key => isActive(params.get(key))) || RIVER_SORTS.has(params.get('sort') ?? '');
  const kind = isKind(explicit) ? explicit : legacyRiver ? 'rivers' : defaultKind;
  const requestedSort = params.get('sort');
  const sort = requestedSort === 'featured' || (isRiverSortKey(requestedSort) && (kind === 'rivers' || !RIVER_SORTS.has(requestedSort)))
    ? requestedSort : kind === 'rivers' ? 'best' : 'featured';
  const floatable = kind === 'rivers' && params.get('floatable') === '1';
  const condition = params.get('condition') ?? 'all';
  return {
    kind, q: params.get('q') ?? '', state: params.get('state') && params.get('state') !== 'all' ? params.get('state')!.toUpperCase() : 'all', sort,
    condition: kind === 'rivers' && !floatable && Object.hasOwn(CONDITION_SYSTEM, condition) ? condition : 'all',
    floatable,
    type: kind === 'rivers' ? params.get('type') || 'all' : 'all',
    diff: kind === 'rivers' ? params.get('diff') || 'all' : 'all',
    len: kind === 'rivers' ? params.get('len') || 'all' : 'all',
  };
}

/** Preserve unrelated URL parameters; category is always explicit after interaction. */
export function conditionsParams(state: ConditionsState, current = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(current);
  params.set('kind', state.kind);
  const values: Record<string, string | null> = {
    q: state.q || null, state: state.state === 'all' ? null : state.state, sort: state.sort,
    condition: state.kind === 'rivers' && !state.floatable && state.condition !== 'all' ? state.condition : null,
    floatable: state.kind === 'rivers' && state.floatable ? '1' : null,
    type: state.kind === 'rivers' && state.type !== 'all' ? state.type : null,
    diff: state.kind === 'rivers' && state.diff !== 'all' ? state.diff : null,
    len: state.kind === 'rivers' && state.len !== 'all' ? state.len : null,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === null) params.delete(key); else params.set(key, value);
  }
  return params;
}

export function buildConditionsDestinations(rivers: RiverListItem[], dams: DamSnapshot[], groups: RiverGroup[] = []): ConditionsDestination[] {
  const meta = buildRiverFilterMeta(rivers);
  const byId = new Map(groups.map(group => [group.riverId, group]));
  return [
    ...rivers.map((river): ConditionsDestination => {
      const key = `river:${river.slug}`;
      const group = byId.get(river.id);
      return {
        kind: 'rivers', key, name: river.name, names: [river.name], state: river.state,
        href: river.path, coordinates: group?.primaryGauge.coordinates,
        aliases: ALIASES[key] ?? [],
        related: [...(RELATED[key] ?? []), ...(group?.allGauges.map(gauge => ({ term: gauge.name, label: gauge.name })) ?? [])],
        river, group, meta: meta[river.id],
      };
    }),
    ...dams.map((dam): ConditionsDestination => {
      const key = `dam:${dam.id}`;
      return {
        kind: 'dams', key, name: dam.name, names: [dam.name, ...(dam.lakeName ? [dam.lakeName] : [])],
        state: dam.state, href: `/dams/${dam.id}`, coordinates: { lat: dam.lat, lng: dam.lon },
        aliases: ALIASES[key] ?? [], related: RELATED[key] ?? [], dam,
      };
    }),
  ];
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export interface ConditionsMatch { rank: number; relatedLabel?: string }

/** Exact name → prefix → alias → name contains → related destination. */
export function matchConditionsDestination(destination: ConditionsDestination, query: string): ConditionsMatch | null {
  const q = normalize(query);
  if (!q) return { rank: 0 };
  const names = destination.names.map(normalize);
  if (names.includes(q)) return { rank: 0 };
  if (names.some(name => name.startsWith(q))) return { rank: 1 };
  const terms = q.split(' ');
  const matches = (name: string) => terms.every(term => name.includes(term));
  if (destination.aliases.map(normalize).some(matches)) return { rank: 2 };
  if (names.some(matches)) return { rank: 3 };
  const related = destination.related.find(item => matches(normalize(item.term)));
  if (related) return { rank: 4, relatedLabel: related.label };
  // State searches remain useful, including compound queries such as "bull ar".
  const context = normalize(`${destination.names.join(' ')} ${destination.state} ${stateName(destination.state)}`);
  return matches(context) ? { rank: 5 } : null;
}

export function destinationCondition(destination: ConditionsDestination): ConditionCode {
  return destination.kind === 'rivers' ? destination.group?.condition.code ?? destination.river.currentCondition?.code ?? 'unknown' : 'unknown';
}

export function editorialRank(destination: ConditionsDestination): number {
  const featured = FEATURED_DESTINATIONS.indexOf(destination.key as typeof FEATURED_DESTINATIONS[number]);
  if (featured !== -1) return featured;
  if (destination.kind === 'dams') {
    const rank = DAM_DISCOVERY_ORDER.indexOf(destination.dam.id as typeof DAM_DISCOVERY_ORDER[number]);
    if (rank !== -1) return 10 + rank;
    if (isNavigationDam(destination.dam.id)) return 1000;
  }
  return 100;
}

export function featuredDestinations(destinations: ConditionsDestination[]): ConditionsDestination[] {
  const byKey = new Map(destinations.map(destination => [destination.key, destination]));
  return FEATURED_DESTINATIONS.flatMap(key => byKey.has(key) ? [byKey.get(key)!] : []);
}

export function conditionsStates(destinations: ConditionsDestination[], kind: ConditionsKind): string[] {
  return [...new Set(destinations.filter(destination => kind === 'all' || destination.kind === kind).map(destination => destination.state))]
    .filter(Boolean).sort((a, b) => stateName(a).localeCompare(stateName(b)));
}

export function changeConditionsKind(state: ConditionsState, kind: ConditionsKind, destinations: ConditionsDestination[]): ConditionsState {
  const next = parseConditionsState(new URLSearchParams({ ...Object.fromEntries(conditionsParams(state)), kind }));
  if (next.state !== 'all' && !conditionsStates(destinations, kind).includes(next.state)) next.state = 'all';
  return next;
}

export function destinationDistance(destination: ConditionsDestination, location: Coordinates | null): number | null {
  return isValidCoords(location) && isValidCoords(destination.coordinates) ? haversineMiles(location, destination.coordinates) : null;
}

export function selectConditionsDestinations(destinations: ConditionsDestination[], state: ConditionsState, location: Coordinates | null = null): ConditionsDestination[] {
  const matches = new Map<string, ConditionsMatch>();
  const filtered = destinations.filter(destination => {
    if (state.kind !== 'all' && state.kind !== destination.kind) return false;
    if (state.state !== 'all' && state.state !== destination.state) return false;
    if (state.kind === 'rivers' && destination.kind === 'rivers') {
      const code = destinationCondition(destination);
      if (state.floatable ? !isFloatableNow(code) : state.condition !== 'all' && state.condition !== code) return false;
      if (state.type !== 'all' && destination.meta.riverType !== state.type) return false;
      if (state.diff !== 'all' && destination.meta.difficultyTier !== state.diff) return false;
      if (state.len !== 'all' && lengthBucket(destination.meta.lengthMiles) !== state.len) return false;
    }
    const match = matchConditionsDestination(destination, state.q);
    if (!match) return false;
    matches.set(destination.key, match);
    return true;
  });
  const byName = (a: ConditionsDestination, b: ConditionsDestination) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  return filtered.sort((a, b) => {
    if (normalize(state.q)) return matches.get(a.key)!.rank - matches.get(b.key)!.rank || editorialRank(a) - editorialRank(b) || byName(a, b);
    if (state.sort === 'name') return byName(a, b);
    if (state.sort === 'nearest' && location) return (destinationDistance(a, location) ?? Infinity) - (destinationDistance(b, location) ?? Infinity) || byName(a, b);
    if (state.kind === 'rivers' && state.sort === 'best') return conditionSortRank(destinationCondition(a)) - conditionSortRank(destinationCondition(b)) || byName(a, b);
    if (state.kind === 'rivers' && (state.sort === 'length_asc' || state.sort === 'length_desc')) {
      const length = (destination: ConditionsDestination) => destination.kind === 'rivers' ? destination.meta.lengthMiles : null;
      const delta = state.sort === 'length_asc'
        ? (length(a) ?? Infinity) - (length(b) ?? Infinity)
        : (length(b) ?? -Infinity) - (length(a) ?? -Infinity);
      return delta || byName(a, b);
    }
    return editorialRank(a) - editorialRank(b) || byName(a, b);
  });
}
