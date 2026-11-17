// src/hooks/useEddyUpdates.ts
// Shared React Query hook for the batched public river summaries. Statewide
// prose is a separate response field; this hook intentionally returns only the
// per-river map used by the website cards.

import { useQuery } from '@tanstack/react-query';
import type { EddyUpdatesResponse, EddyUpdateEntry } from '@/app/api/eddy-updates/route';

export type { EddyUpdateEntry };

export function useEddyUpdates() {
  return useQuery<Record<string, EddyUpdateEntry>, Error>({
    queryKey: ['eddyUpdates'],
    queryFn: async (): Promise<Record<string, EddyUpdateEntry>> => {
      const res = await fetch('/api/eddy-updates');
      if (!res.ok) throw new Error('Failed to fetch Eddy updates');
      const data = (await res.json()) as EddyUpdatesResponse;
      return data.updates;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
