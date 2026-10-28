/** Cached picker data can arrive first, but must never overwrite a fresh response. */
export async function loadPlannerResource<T>({
  readCached,
  fetchFresh,
  signal,
  publish,
  errorMessage,
}: {
  readCached: () => Promise<T | null | undefined>;
  fetchFresh: (signal: AbortSignal) => Promise<T>;
  signal: AbortSignal;
  /**
   * `settled` is true once nothing newer is coming: the fresh answer, or the
   * cached one the failed fetch fell back on. A caller deciding that something
   * is MISSING must wait for it; a cached list can simply predate it.
   */
  publish: (value: T | null, error: string | null, settled: boolean) => void;
  errorMessage: string;
}) {
  let fresh = false;
  let cachedValue: T | null = null;
  const cached = Promise.resolve()
    .then(readCached)
    .then((value) => {
      cachedValue = value ?? null;
      if (!signal.aborted && !fresh && cachedValue !== null) publish(cachedValue, null, false);
    })
    .catch(() => {});
  try {
    const value = await fetchFresh(signal);
    fresh = true;
    if (!signal.aborted) publish(value, null, true);
  } catch {
    await cached;
    if (signal.aborted) return;
    if (cachedValue === null) publish(null, errorMessage, true);
    // The cached list stands, and it is now the final answer this load has.
    else publish(cachedValue, null, true);
  }
}
