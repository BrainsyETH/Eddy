// src/hooks/useGaugeHistory.ts
// React Query hook for fetching 7-day gauge history

import { useQuery } from '@tanstack/react-query';

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
