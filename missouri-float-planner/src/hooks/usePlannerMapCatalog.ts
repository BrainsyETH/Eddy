import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MODataset } from '@/lib/usgs/mo-statewide-data';
import { plannerMapPlaces } from '@/lib/planner-map-catalog';

/** Same catalogue as Live River Map; no per-river request fan-out. */
export function usePlannerMapCatalog(enabled: boolean) {
  const query = useQuery<MODataset>({
    queryKey: ['planner-map-catalog'],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/usgs/mo-dataset', { signal });
      if (!response.ok) throw new Error('Could not load access points');
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const places = useMemo(() => plannerMapPlaces(query.data), [query.data]);
  return { ...query, places };
}
