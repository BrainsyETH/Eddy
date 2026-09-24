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
