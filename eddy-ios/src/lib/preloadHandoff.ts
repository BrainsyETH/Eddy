/** A short, one-use handoff from onboarding. Never changes normal refresh policy. */
export function createPreloadHandoff(now = Date.now, maxAgeMs = 30_000) {
  type Entry = { promise: Promise<unknown>; completedAt: number | null };
  const entries = new Map<string, Entry>();

  function peek<T>(key: string): Promise<T> | null {
    const entry = entries.get(key);
    if (!entry) return null;
    // The API owns its request deadline. Never expire work still in flight:
    // doing so would launch a second copy precisely when the network is slow.
    if (entry.completedAt !== null &&
        (now() - entry.completedAt >= maxAgeMs || now() < entry.completedAt)) {
      entries.delete(key);
      return null;
    }
    return entry.promise as Promise<T>;
  }

  return {
    peek,
    warm<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
      const existing = peek<T>(key);
      if (existing) return existing;
      const entry: Entry = { promise: Promise.resolve(), completedAt: null };
      const promise = Promise.resolve().then(fetcher).then(value => {
        entry.completedAt = now();
        return value;
      });
      entry.promise = promise;
      entries.set(key, entry);
      void promise.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      return promise;
    },
    take<T>(key: string): Promise<T> | null {
      const promise = peek<T>(key);
      entries.delete(key);
      return promise;
    },
    clear() { entries.clear(); },
  };
}
