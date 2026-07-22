import { useQuery } from '@tanstack/react-query';
import type { MoForecastEntry, MoForecastResponse } from '@/app/api/usgs/mo-forecast/route';

export function useRiverForecast(siteId: string | null) {
  return useQuery<MoForecastEntry | null, Error>({
    queryKey: ['river-forecast', siteId],
    queryFn: async () => {
      if (!siteId) return null;
      const response = await fetch(`/api/usgs/mo-forecast?siteId=${encodeURIComponent(siteId)}`);
      if (!response.ok) throw new Error('Failed to fetch river forecast');
      const data: MoForecastResponse = await response.json();
      return data.entries.find((entry) => entry.site_no === siteId) ?? null;
    },
    enabled: !!siteId,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
    throwOnError: false,
  });
}
