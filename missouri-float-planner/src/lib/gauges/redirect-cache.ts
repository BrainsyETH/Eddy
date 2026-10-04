/** Per-instance cache: bounds repeated public-catalog reads, not cold crawls.
 * Never persist outages or serve a mapping beyond its TTL. In-flight reads for
 * the same slug share a promise; the map is bounded even during a crawl.
 */
export function createGaugeRedirectCache(
  lookup: (slug: string) => Promise<string | null>,
  { ttlMs = 300_000, maxEntries = 2048, now = Date.now } = {},
) {
  const entries = new Map<string, { value: Promise<string | null>; expiresAt: number }>();
  return (slug: string): Promise<string | null> => {
    const cached = entries.get(slug);
    if (cached && cached.expiresAt > now()) {
      entries.delete(slug);
      entries.set(slug, cached);
      return cached.value;
    }
    entries.delete(slug);
    const entry = { value: Promise.resolve(null) as Promise<string | null>, expiresAt: now() + ttlMs };
    entry.value = Promise.resolve().then(() => lookup(slug)).catch(error => {
      if (entries.get(slug) === entry) entries.delete(slug);
      throw error;
    });
    entries.set(slug, entry);
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    return entry.value;
  };
}
