import { useQuery } from '@tanstack/react-query';
import type { EddyUpdatesResponse, RiverListItem, RiversResponse } from '@/types/api';

/** Public regional prose and the whole catalogue, independent of directory filters. */
export function useOzarksPulse(initialRivers: RiverListItem[], renderedAt: number) {
  const rivers = useQuery({
    queryKey: ['rivers'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/rivers', { signal });
      if (!response.ok) throw new Error('River conditions unavailable');
      const data = await response.json() as RiversResponse;
      if (!Array.isArray(data.rivers)) throw new Error('River conditions unavailable');
      return data.rivers;
    },
    initialData: initialRivers.length ? initialRivers : undefined,
    initialDataUpdatedAt: renderedAt,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
  const summary = useQuery({
    queryKey: ['ozarksPulse'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/eddy-updates', { signal });
      if (!response.ok) throw new Error('Ozarks summary unavailable');
      const data = await response.json() as EddyUpdatesResponse;
      // A successful null is deliberate: the server withheld the prose.
      return data.statewide ?? null;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
  return { rivers, summary };
}
