// src/hooks/useLastYearComparison.ts
// Daily values for the prior-year window behind the chart's Last year layer.
//
// Fetches only while the layer is on and the selection is eligible. The
// selected dates are the ones the reader picked (custom ranges), or the local
// dates of the selected series' own requestedWindow (presets), so the prior
// window and the plotted window always describe the same days. Cached by
// station and exact prior window; a superseded request is cancelled through
// React Query's signal, and data is returned only for the current window.

import { useQuery } from '@tanstack/react-query';
import {
  lastYearAvailable,
  priorYearWindow,
  windowCalendarDates,
  type CalendarDates,
} from '@shared/chart-model';
import type { HistoryCapabilities } from '@shared/history-capabilities';
import { fetchHistory, useGaugeHistory, type HistoryWindowRequest, type HistoricalReading } from '@/hooks/useGaugeHistory';

const DAY_MS = 86_400_000;

export type LastYearStatus = 'off' | 'loading' | 'ready' | 'empty' | 'failed';

/** The readings the chart draws, with the dates they were aligned against. */
export interface LastYearComparison {
  readings: HistoricalReading[];
  dates: CalendarDates;
}

/** The selected window's length in days: the preset, or a custom window's span. */
export function selectedWindowDays(days: number, window?: HistoryWindowRequest | null): number {
  if (!window?.from || !window.to) return days;
  return Math.round((Date.parse(window.to) - Date.parse(window.from)) / DAY_MS);
}

/** One prior-year request. Exported so the request rules can be exercised
 *  against a real QueryClient without rendering. */
export function lastYearQueryOptions(siteId: string | null, prior: { from: string; to: string } | null) {
  return {
    queryKey: ['gaugeHistory', 'lastYear', siteId, prior?.from ?? null, prior?.to ?? null] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<HistoricalReading[] | null> => {
      const history = await fetchHistory(siteId!, selectedWindowDays(1, prior), { ...prior!, resolution: 'daily' }, signal);
      return history?.readings.some((reading) => reading.dischargeCfs != null) ? history.readings : null;
    },
    enabled: !!siteId && !!prior,
    staleTime: 12 * 60 * 60 * 1000,
  };
}

export function useLastYearComparison({
  siteId,
  days,
  window,
  dates,
  unit,
  capabilities,
  on,
}: {
  siteId: string | null;
  days: number;
  window?: HistoryWindowRequest | null;
  /** The calendar dates the reader picked, when they picked them. */
  dates?: CalendarDates | null;
  unit: 'ft' | 'cfs';
  capabilities: HistoryCapabilities | null;
  on: boolean;
}) {
  const eligible = lastYearAvailable(unit, capabilities, selectedWindowDays(days, window));
  const active = on && eligible;
  // The chart runs this same query; React Query shares it.
  const { data: primary } = useGaugeHistory(active && !dates ? siteId : null, days, window);
  const selected = dates ?? (primary?.requestedWindow ? windowCalendarDates(primary.requestedWindow) : null);
  const prior = active && selected ? priorYearWindow(selected) : null;

  const query = useQuery(lastYearQueryOptions(siteId, prior));

  const status: LastYearStatus = !active
    ? 'off'
    : !prior || query.isPending
      ? 'loading'
      : query.isError
        ? 'failed'
        : query.data
          ? 'ready'
          : 'empty';

  return {
    eligible,
    status,
    comparison: status === 'ready' && query.data && selected ? { readings: query.data, dates: selected } : null,
    retry: () => void query.refetch(),
  };
}
