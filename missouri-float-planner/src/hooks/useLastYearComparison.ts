// src/hooks/useLastYearComparison.ts
// Daily values for the prior-year window behind the chart's Last year layer.
//
// Fetches only while the layer is on, the selection is eligible, and the
// selected series has loaded — the prior window is derived from that series'
// own requestedWindow, so the two always describe the same dates. Cached by
// station and exact prior window. A superseded request is cancelled through
// React Query's signal, and readings are returned only for the current window.

import { useQuery } from '@tanstack/react-query';
import { lastYearAvailable, priorYearWindow } from '@shared/chart-model';
import type { HistoryCapabilities } from '@shared/history-capabilities';
import { fetchHistory, useGaugeHistory, type HistoryWindowRequest, type HistoricalReading } from '@/hooks/useGaugeHistory';

const DAY_MS = 86_400_000;

export type LastYearStatus = 'off' | 'loading' | 'ready' | 'empty' | 'failed';

/** The selected window's length in days: the preset, or a custom window's span. */
export function selectedWindowDays(days: number, window?: HistoryWindowRequest | null): number {
  if (!window?.from || !window.to) return days;
  return Math.round((Date.parse(window.to) - Date.parse(window.from)) / DAY_MS);
}

export function useLastYearComparison({
  siteId,
  days,
  window,
  unit,
  capabilities,
  on,
}: {
  siteId: string | null;
  days: number;
  window?: HistoryWindowRequest | null;
  unit: 'ft' | 'cfs';
  capabilities: HistoryCapabilities | null;
  on: boolean;
}) {
  const eligible = lastYearAvailable(unit, capabilities, selectedWindowDays(days, window));
  const active = on && eligible;
  // The chart runs this same query; React Query shares it.
  const { data: primary } = useGaugeHistory(active ? siteId : null, days, window);
  const prior = active && primary?.requestedWindow ? priorYearWindow(primary.requestedWindow) : null;

  const query = useQuery({
    queryKey: ['gaugeHistory', 'lastYear', siteId, prior?.from ?? null, prior?.to ?? null],
    queryFn: ({ signal }) =>
      fetchHistory(siteId!, selectedWindowDays(days, prior), { ...prior!, resolution: 'daily' }, signal),
    enabled: !!siteId && !!prior,
    staleTime: 12 * 60 * 60 * 1000,
  });

  const readings: HistoricalReading[] | null =
    query.data?.readings.some((reading) => reading.dischargeCfs != null) ? query.data.readings : null;
  const status: LastYearStatus = !active
    ? 'off'
    : !prior || query.isPending
      ? 'loading'
      : query.isError
        ? 'failed'
        : readings
          ? 'ready'
          : 'empty';

  return {
    eligible,
    status,
    readings: status === 'ready' ? readings : null,
    retry: () => void query.refetch(),
  };
}
