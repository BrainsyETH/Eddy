// src/lib/lakes/bounded-reader.ts
// A read shared across requests for a bounded time, per server instance.
//
// The lake page's neighbours used the public pages' `unstable_cache` loaders,
// which serve an expired entry, however old, to the request that finds it and
// refresh in the background. That is the reason the dam page left them
// (dam-page-snapshot.ts): on a page that sees little traffic, the first reader
// after a quiet night was handed last night's rivers. This keeps a value for at
// most `ttlMs` after it was read, so the bound holds by construction; the same
// arrangement as the dam directory's row reader (dam-directory-source.ts).
//
// Joins a read already in flight, and never caches a failure: a rejected read
// rejects for its callers and the next request asks again.

export function createBoundedReader<T>(read: () => Promise<T>, ttlMs: number, clock: () => number = Date.now): () => Promise<T> {
  let cached: { value: T; readAt: number } | null = null;
  let pending: Promise<T> | null = null;
  return function readBounded(): Promise<T> {
    if (cached && clock() - cached.readAt < ttlMs) return Promise.resolve(cached.value);
    if (!pending) {
      const started = read().then((value) => {
        cached = { value, readAt: clock() };
        return value;
      });
      pending = started;
      const clear = () => { if (pending === started) pending = null; };
      started.then(clear, clear);
    }
    return pending;
  };
}
