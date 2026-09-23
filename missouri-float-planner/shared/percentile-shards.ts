export const PERCENTILE_SHARDS = 256;
export function percentileShard(siteId: string): number {
  let hash = 2166136261;
  for (const char of siteId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % PERCENTILE_SHARDS;
}
export function percentileBatch(siteIds: string[], hour: number): string[] {
  const ids = [...new Set(siteIds)].filter(id => /^\d+$/.test(id) && percentileShard(id) === hour % PERCENTILE_SHARDS).sort();
  // Budget cutoffs must not always starve the same tail.
  const offset = ids.length ? Math.floor(hour / PERCENTILE_SHARDS) % ids.length : 0;
  return [...ids.slice(offset), ...ids.slice(0, offset)];
}
