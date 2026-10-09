// eddy-ios/src/hooks/useLastYearHistory.ts
// Daily values for the prior-year window behind the chart's Last year layer.
// Fetches only while a window is passed; the request rules live in
// src/lib/lastYearLoader.ts, where the web suite tests them.

import { useEffect, useState } from 'react';
import type { GaugeHistoryReading } from '@eddy/types';
import { fetchGaugeHistory } from '@/api/client';
import { createLastYearLoader, type LastYearState, type LastYearStatus } from '@/lib/lastYearLoader';

export type { LastYearStatus };

const DAY_MS = 86_400_000;

export interface LastYearHistory {
  status: LastYearStatus;
  /** Only for the window currently asked for; null otherwise. */
  readings: GaugeHistoryReading[] | null;
  retry: () => void;
}

export function useLastYearHistory(siteId: string | null, window: { from: string; to: string } | null): LastYearHistory {
  const key = siteId && window ? `${siteId}:${window.from}:${window.to}` : null;
  const [state, setState] = useState<LastYearState<GaugeHistoryReading>>({ key: null, status: 'off', readings: null });
  const [loader] = useState(() => createLastYearLoader<GaugeHistoryReading>(setState));
  useEffect(() => {
    // Same key, new object: select() ignores it, so no refetch.
    loader.select(key, async signal => {
      if (!siteId || !window) return undefined;
      const days = Math.max(1, Math.round((Date.parse(window.to) - Date.parse(window.from)) / DAY_MS));
      const result = await fetchGaugeHistory(siteId, days, signal, window, 'daily');
      if (result === undefined) return undefined;
      return result?.readings.some(reading => reading.dischargeCfs != null) ? result.readings : null;
    });
  }, [loader, key, siteId, window]);

  useEffect(() => () => loader.dispose(), [loader]);

  if (!key) return { status: 'off', readings: null, retry: loader.retry };
  if (state.key !== key) return { status: 'loading', readings: null, retry: loader.retry };
  return { status: state.status, readings: state.readings, retry: loader.retry };
}
