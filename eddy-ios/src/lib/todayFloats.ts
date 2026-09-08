/** Local calendar date, so the rail does not rotate at 6 p.m. in Missouri. */
export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dailyRank(dayKey: string, id: string): number {
  let hash = 2166136261;
  const value = `${dayKey}:${id}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A daily rotation rather than render-time randomness.
 *
 * Each float gets an independent date-seeded rank. The order changes from one
 * day to the next, stays put through refreshes, and does not reshuffle every
 * existing card when a new editorial float is added to the API response.
 */
export function dailyFavoriteFloats<T extends { id: string }>(
  floats: T[],
  dayKey = localDayKey(new Date()),
): T[] {
  return [...floats].sort(
    (a, b) => dailyRank(dayKey, a.id) - dailyRank(dayKey, b.id) || a.id.localeCompare(b.id),
  );
}

/** One daily favorite hero: rivers first, then any saved place as a fallback. */
export function dailyHighlightedFavorite<
  T extends { kind: string; entityId: string },
>(favorites: T[], dayKey = localDayKey(new Date())): T | null {
  const rivers = favorites.filter((item) => item.kind === 'river');
  const pool = rivers.length > 0 ? rivers : favorites;
  return [...pool].sort((a, b) => {
    const aKey = `${a.kind}:${a.entityId}`;
    const bKey = `${b.kind}:${b.entityId}`;
    return dailyRank(dayKey, aKey) - dailyRank(dayKey, bKey) || aKey.localeCompare(bKey);
  })[0] ?? null;
}
