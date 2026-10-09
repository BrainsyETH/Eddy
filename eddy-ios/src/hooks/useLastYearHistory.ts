// eddy-ios/src/hooks/useLastYearHistory.ts
// Daily values for the prior-year window behind the chart's Last year layer.
//
// Fetches only while a window is passed (the layer is on and the selected
// series is the one asked for). Cached by station and exact prior window;
// failures are never cached. A response for any other window is discarded, and
// readings are returned only for the window currently asked for.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GaugeHistoryReading } from '@eddy/types';
import { fetchGaugeHistory } from '@/api/client';

const CACHE_SIZE = 8;
const DAY_MS = 86_400_000;

export type LastYearStatus = 'off' | 'loading' | 'ready' | 'empty' | 'failed';

export interface LastYearHistory {
  status: LastYearStatus;
  /** Only for the window currently asked for; null otherwise. */
  readings: GaugeHistoryReading[] | null;
  retry: () => void;
}

export function useLastYearHistory(siteId: string | null, window: { from: string; to: string } | null): LastYearHistory {
  const key = siteId && window ? `${siteId}:${window.from}:${window.to}` : null;
  const [state, setState] = useState<{ key: string | null; status: LastYearStatus; readings: GaugeHistoryReading[] | null }>(
    { key: null, status: 'off', readings: null },
  );
  const cache = useRef(new Map<string, GaugeHistoryReading[] | null>());
  const inFlight = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    if (!key || !siteId || !window) return;

    if (cache.current.has(key)) {
      const hit = cache.current.get(key) ?? null;
      setState({ key, status: hit ? 'ready' : 'empty', readings: hit });
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;
    setState({ key, status: 'loading', readings: null });
    const days = Math.max(1, Math.round((Date.parse(window.to) - Date.parse(window.from)) / DAY_MS));
    void fetchGaugeHistory(siteId, days, controller.signal, window, 'daily').then(result => {
      if (controller.signal.aborted) return;
      if (inFlight.current === controller) inFlight.current = null;
      if (result === undefined) {
        setState({ key, status: 'failed', readings: null });
        return;
      }
      const readings = result && result.readings.some(reading => reading.dischargeCfs != null) ? result.readings : null;
      cache.current.set(key, readings);
      if (cache.current.size > CACHE_SIZE) {
        const oldest = cache.current.keys().next().value;
        if (oldest !== undefined) cache.current.delete(oldest);
      }
      setState({ key, status: readings ? 'ready' : 'empty', readings });
    });
    return () => controller.abort();
    // `window` is represented by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);

  if (!key) return { status: 'off', readings: null, retry };
  if (state.key !== key) return { status: 'loading', readings: null, retry };
  return { status: state.status, readings: state.readings, retry };
}
