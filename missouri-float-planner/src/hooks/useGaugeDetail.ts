// src/hooks/useGaugeDetail.ts
// React Query hook for one station's detail payload — /api/gauges/[siteId].
//
// The detail views were built entirely off the /api/gauges LIST, which is why
// the web never drew an NWS flood stage: floodStages (and the station-level
// facts beside it) ride only on the detail payload. This hook is the wiring
// that fixes that, shared by both detail views so neither grows its own fetch.
//
// A 404 resolves to null rather than throwing: "this station has no detail
// row" is an answer the views render (they already have the list row), not a
// retry-worthy failure.

import { useQuery } from '@tanstack/react-query';
import type { GaugeDetail, GaugeDetailResponse } from '@/app/api/gauges/[siteId]/route';

export type { GaugeDetail };

export function useGaugeDetail(siteId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery<GaugeDetail | null, Error>({
    queryKey: ['gaugeDetail', siteId],
    queryFn: async (): Promise<GaugeDetail | null> => {
      const response = await fetch(`/api/gauges/${encodeURIComponent(siteId!)}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error('Failed to fetch gauge detail');
      }
      const data = (await response.json()) as GaugeDetailResponse;
      return data.gauge;
    },
    enabled: Boolean(siteId) && (options?.enabled ?? true),
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
}
