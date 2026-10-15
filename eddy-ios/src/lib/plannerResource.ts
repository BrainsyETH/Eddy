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
  publish: (value: T | null, error: string | null) => void;
  errorMessage: string;
}) {
  let fresh = false;
  let cachedValue: T | null = null;
  const cached = Promise.resolve()
    .then(readCached)
    .then((value) => {
      cachedValue = value ?? null;
      if (!signal.aborted && !fresh && cachedValue !== null) publish(cachedValue, null);
    })
    .catch(() => {});
  try {
    const value = await fetchFresh(signal);
    fresh = true;
    if (!signal.aborted) publish(value, null);
  } catch {
    await cached;
    if (!signal.aborted && cachedValue === null) publish(null, errorMessage);
  }
}
