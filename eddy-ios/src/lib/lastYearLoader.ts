// eddy-ios/src/lib/lastYearLoader.ts
// The request rules behind the chart's Last year layer, outside React so the
// web test suite can drive them (the app has no runner of its own).
//
//   · One request at a time: selecting another window aborts the one in flight,
//     and a response that lands for any window but the current one is dropped.
//   · Answers are cached by window; a failure is not an answer and is never
//     cached, so retry really asks again.

export type LastYearStatus = 'off' | 'loading' | 'ready' | 'empty' | 'failed';

export interface LastYearState<T> {
  key: string | null;
  status: LastYearStatus;
  /** Present only with status 'ready'. */
  readings: T[] | null;
}

/** Resolves to readings, null for "answered, nothing to draw", or undefined for a failed request. */
export type LastYearRequest<T> = (signal: AbortSignal) => Promise<T[] | null | undefined>;

export function createLastYearLoader<T>(onChange: (state: LastYearState<T>) => void, cacheSize = 8) {
  const cache = new Map<string, T[] | null>();
  let current: { key: string; request: LastYearRequest<T> } | null = null;
  let inFlight: AbortController | null = null;

  const run = () => {
    inFlight?.abort();
    inFlight = null;
    if (!current) {
      onChange({ key: null, status: 'off', readings: null });
      return;
    }
    const { key, request } = current;
    if (cache.has(key)) {
      const hit = cache.get(key) ?? null;
      onChange({ key, status: hit ? 'ready' : 'empty', readings: hit });
      return;
    }
    const controller = new AbortController();
    inFlight = controller;
    onChange({ key, status: 'loading', readings: null });
    void request(controller.signal).then(
      result => settle(controller, key, result),
      () => settle(controller, key, undefined),
    );
  };

  const settle = (controller: AbortController, key: string, result: T[] | null | undefined) => {
    if (controller.signal.aborted || current?.key !== key) return;
    inFlight = null;
    if (result === undefined) {
      onChange({ key, status: 'failed', readings: null });
      return;
    }
    const readings = result && result.length ? result : null;
    cache.set(key, readings);
    if (cache.size > cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    onChange({ key, status: readings ? 'ready' : 'empty', readings });
  };

  return {
    /** Ask for a window (or nothing). Re-selecting the current key is a no-op. */
    select(key: string | null, request: LastYearRequest<T>) {
      if ((current?.key ?? null) === key) return;
      current = key ? { key, request } : null;
      run();
    },
    /** Re-run the current window; a failure was never cached, so this refetches. */
    retry() {
      run();
    },
    dispose() {
      inFlight?.abort();
      inFlight = null;
      current = null;
    },
  };
}
