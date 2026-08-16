// src/hooks/useGaugeHistory.ts
// React Query hook for fetching gauge history (default 14-day)

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type {
  GaugeHistoryReading as HistoricalReading,
  GaugeHistoryResponse,
} from '@/types/api';

export type { HistoricalReading, GaugeHistoryResponse };

/**
 * Fill in the context fields a payload may not carry.
 *
 * GaugeHistoryResponse declares `typical`, `forecast` and friends as required,
 * which is true of what the endpoint sends TODAY and not true of everything a
 * browser can hand this hook: a response cached before those fields existed, or
 * one served by an older deploy mid-rollout. TypeScript cannot see either case,
 * so `history.typical.length` would be a TypeError at render with no compile
 * error anywhere near it.
 *
 * Normalizing once here — rather than making every field optional and pushing a
 * `?? []` onto each of the three charts — means the rest of the app can trust
 * the type it has been given.
 */
function normalizeHistory(raw: Partial<GaugeHistoryResponse> | null): GaugeHistoryResponse | null {
  if (!raw || !Array.isArray(raw.readings)) return null;
  return {
    siteId: raw.siteId ?? '',
    siteName: raw.siteName ?? '',
    readings: raw.readings,
    observedThrough: raw.observedThrough ?? raw.readings.at(-1)?.timestamp ?? null,
    sampled: raw.sampled ?? false,
    typical: raw.typical ?? [],
    forecast: raw.forecast ?? [],
    forecastIssuedAt: raw.forecastIssuedAt ?? null,
    sourceUrl: raw.sourceUrl ?? null,
    stats: raw.stats ?? {
      minDischarge: null,
      maxDischarge: null,
      minHeight: null,
      maxHeight: null,
    },
  };
}

async function fetchHistory(siteId: string, days: number): Promise<GaugeHistoryResponse | null> {
  const response = await fetch(`/api/gauges/${siteId}/history?days=${days}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error('Failed to fetch gauge history');
  }
  return normalizeHistory(await response.json());
}

export function useGaugeHistory(siteId: string | null, days: number = 14) {
  return useQuery<GaugeHistoryResponse | null, Error>({
    queryKey: ['gaugeHistory', siteId, days],
    queryFn: async (): Promise<GaugeHistoryResponse | null> => {
      if (!siteId) return null;
      return fetchHistory(siteId, days);
    },
    enabled: !!siteId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
  });
}

/**
 * Hook that returns a function to prefetch gauge history for multiple sites.
 * Call with an array of site IDs to warm the cache in the background.
 */
export function useGaugeHistoryPrefetch() {
  const queryClient = useQueryClient();

  return useCallback((siteIds: string[], days: number = 14) => {
    for (const siteId of siteIds) {
      queryClient.prefetchQuery({
        queryKey: ['gaugeHistory', siteId, days],
        queryFn: (): Promise<GaugeHistoryResponse | null> => fetchHistory(siteId, days),
        staleTime: 30 * 60 * 1000,
      });
    }
  }, [queryClient]);
}
