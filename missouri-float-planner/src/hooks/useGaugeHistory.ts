// src/hooks/useGaugeHistory.ts
// React Query hook for fetching gauge history.
//
// Normalization happens once here, at the fetch boundary, via the SHARED
// normalizer (shared/history-normalize.ts) — the same one the iOS client
// runs — so a response cached before a field existed, or served by an older
// deploy mid-rollout, still satisfies the type every chart trusts. Deriving
// where a derivation exists (observedThrough from the last reading,
// seasonalRange from typical) rather than defaulting to null is the
// normalizer's rule, not this file's; see its header.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  normalizeGaugeHistory,
  type NormalizedGaugeHistory,
} from '@shared/history-normalize';
import type { GaugeHistoryReading as HistoricalReading } from '@/types/api';

export type { HistoricalReading, NormalizedGaugeHistory };
/** The normalized shape every consumer sees; the wire type is in types/api. */
export type GaugeHistoryResponse = NormalizedGaugeHistory;

/**
 * An explicit window for the expanded mode's 90d / 1y / custom ranges.
 * `days` keeps its behaviour exactly for every existing caller.
 */
export interface HistoryWindowRequest {
  from: string;
  to?: string | null;
  resolution?: 'auto' | 'instant' | 'daily';
}

async function fetchHistory(
  siteId: string,
  days: number,
  window?: HistoryWindowRequest | null,
): Promise<NormalizedGaugeHistory | null> {
  const params = new URLSearchParams({ days: String(days) });
  if (window?.from) params.set('from', window.from);
  if (window?.to) params.set('to', window.to);
  if (window?.resolution && window.resolution !== 'auto') {
    params.set('resolution', window.resolution);
  }
  const response = await fetch(`/api/gauges/${siteId}/history?${params.toString()}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error('Failed to fetch gauge history');
  }
  return normalizeGaugeHistory(await response.json());
}

export function useGaugeHistory(
  siteId: string | null,
  days: number = 14,
  window?: HistoryWindowRequest | null,
) {
  return useQuery<NormalizedGaugeHistory | null, Error>({
    queryKey: ['gaugeHistory', siteId, days, window?.from ?? null, window?.to ?? null, window?.resolution ?? 'auto'],
    queryFn: async (): Promise<NormalizedGaugeHistory | null> => {
      if (!siteId) return null;
      return fetchHistory(siteId, days, window);
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
        queryKey: ['gaugeHistory', siteId, days, null, null, 'auto'],
        queryFn: (): Promise<NormalizedGaugeHistory | null> => fetchHistory(siteId, days),
        staleTime: 30 * 60 * 1000,
      });
    }
  }, [queryClient]);
}
