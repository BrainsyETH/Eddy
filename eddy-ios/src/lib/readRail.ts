import { floatableRank } from '../theme/conditions';

interface RankedRiver {
  id: string;
  name: string;
  currentCondition?: { code?: string | null } | null;
}

/**
 * The one Read ordering: favorites, then nearest, then most floatable, then
 * newest prose, then name. Shared by the validated Reads and the candidates
 * ranked before they arrive, so early Premium cards and photo prefetches name
 * the rivers the settled rail will show rather than a different three.
 */
export function compareReadRivers(
  a: RankedRiver,
  b: RankedRiver,
  context: {
    isFavorite: (id: string) => boolean;
    distances?: ReadonlyMap<string, number> | null;
  },
  /** When each river's prose was written; absent for unwritten candidates. */
  written?: { a?: string | null; b?: string | null },
): number {
  const favoriteOrder = Number(context.isFavorite(b.id)) - Number(context.isFavorite(a.id));
  if (favoriteOrder !== 0) return favoriteOrder;
  if (context.distances) {
    const distanceOrder = (context.distances.get(a.id) ?? Infinity) - (context.distances.get(b.id) ?? Infinity);
    if (distanceOrder !== 0) return distanceOrder;
  }
  const conditionOrder = floatableRank(a.currentCondition?.code ?? 'unknown') - floatableRank(b.currentCondition?.code ?? 'unknown');
  if (conditionOrder !== 0) return conditionOrder;
  if (written) {
    const writtenOrder = new Date(written.b ?? 0).getTime() - new Date(written.a ?? 0).getTime();
    if (writtenOrder) return writtenOrder;
  }
  return a.name.localeCompare(b.name);
}

/** Preserve candidate ranking; avoid already featured rivers where possible. */
export function selectReadRail<T>(
  candidates: readonly T[], reservedIds: ReadonlySet<string>, idOf: (item: T) => string,
): T[] {
  const distinct = candidates.filter((item) => !reservedIds.has(idOf(item)));
  return (distinct.length ? distinct : candidates).slice(0, 3);
}

/** Existing cards survive refresh/failure; empty and loading are different states. */
export function readRailState(count: number, loading: boolean, error: boolean) {
  if (count > 0) return 'ready';
  if (error) return 'error';
  return loading ? 'loading' : 'empty';
}
