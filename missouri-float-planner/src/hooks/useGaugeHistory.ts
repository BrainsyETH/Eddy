// src/hooks/useGaugeHistory.ts
// React Query hook for fetching 7-day gauge history

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface HistoricalReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

export interface GaugeHistoryResponse {
  siteId: string;
  siteName: string;
  readings: HistoricalReading[];
  stats: {
    minDischarge: number | null;
    maxDischarge: number | null;
    minHeight: number | null;
    maxHeight: number | null;
  };
}

export function useGaugeHistory(siteId: string | null, days: number = 7) {
  return useQuery<GaugeHistoryResponse | null, Error>({
    queryKey: ['gaugeHistory', siteId, days],
    queryFn: async (): Promise<GaugeHistoryResponse | null> => {
      if (!siteId) return null;

      const response = await fetch(`/api/gauges/${siteId}/history?days=${days}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch gauge history');
      }

      return response.json();
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

  return useCallback((siteIds: string[], days: number = 7) => {
    for (const siteId of siteIds) {
      queryClient.prefetchQuery({
        queryKey: ['gaugeHistory', siteId, days],
        queryFn: async (): Promise<GaugeHistoryResponse | null> => {
          const response = await fetch(`/api/gauges/${siteId}/history?days=${days}`);
          if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error('Failed to fetch gauge history');
          }
          return response.json();
        },
        staleTime: 30 * 60 * 1000,
      });
    }
  }, [queryClient]);
}
