/** A short, one-use handoff from onboarding. Never changes normal refresh policy. */
export function createPreloadHandoff(now = Date.now, maxAgeMs = 30_000) {
  const entries = new Map<string, { promise: Promise<unknown>; started: number }>();
  function peek<T>(key: string): Promise<T> | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (now() - entry.started >= maxAgeMs || now() < entry.started) {
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
      const entry = { promise: Promise.resolve().then(fetcher), started: now() };
      entries.set(key, entry);
      void entry.promise.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
      return entry.promise;
    },
    take<T>(key: string): Promise<T> | null {
      const promise = peek<T>(key);
      entries.delete(key);
      return promise;
    },
    clear() { entries.clear(); },
  };
}
