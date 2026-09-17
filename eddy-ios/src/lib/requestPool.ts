/** Coalesce identical reads without letting one unmount cancel another reader. */
export function createRequestPool(maxEntries = 32, now = Date.now) {
  type Entry = { controller: AbortController; promise: Promise<unknown>; readers: number };
  const pending = new Map<string, Entry>();
  const cache = new Map<string, { value: unknown; expires: number }>();
  let generation = 0;
  const cancelled = () => Object.assign(new Error('Request cancelled'), { name: 'AbortError' });

  return {
    clear() { generation += 1; cache.clear(); },
    read<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, ttl = 0): Promise<T> {
      if (signal?.aborted) return Promise.reject(cancelled());
      const hit = cache.get(key);
      if (hit && hit.expires > now()) return Promise.resolve(hit.value as T);
      cache.delete(key);
      let entry = pending.get(key);
      if (!entry) {
        const controller = new AbortController();
        const startedGeneration = generation;
        const created: Entry = { controller, readers: 0, promise: Promise.resolve() };
        created.promise = Promise.resolve().then(() => fetcher(controller.signal)).then(value => {
          if (ttl > 0 && !controller.signal.aborted && generation === startedGeneration) {
            cache.set(key, { value, expires: now() + ttl });
            while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
          }
          return value;
        }).finally(() => { if (pending.get(key) === created) pending.delete(key); });
        pending.set(key, created);
        entry = created;
      }
      const held = entry;
      held.readers += 1;
      return new Promise<T>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return false;
          finished = true;
          signal?.removeEventListener('abort', abort);
          held.readers -= 1;
          return true;
        };
        const abort = () => {
          if (!finish()) return;
          if (held.readers === 0 && pending.get(key) === held) {
            pending.delete(key);
            held.controller.abort();
          }
          reject(cancelled());
        };
        signal?.addEventListener('abort', abort, { once: true });
        held.promise.then(value => { if (finish()) resolve(value as T); }, error => { if (finish()) reject(error); });
      });
    },
  };
}

/** Only bulky read-only payloads; never retain account, alert, or condition responses. */
export function navigationCacheTtl(path: string): number {
  return /^\/api\/(?:eddy-update\/|gauge-update\/|gauges\/[^/]+\/history\?|rivers\/[^/]+\/outlook(?:\?|$))/.test(path) ? 30_000 : 0;
}
