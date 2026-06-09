// src/hooks/useConditions.ts
// React Query hook for fetching river conditions

import { useQuery } from '@tanstack/react-query';
import type { ConditionResponse } from '@/types/api';

interface UseConditionsOptions {
  putInAccessPointId?: string | null;
}

export function useConditions(riverId: string | null, options?: UseConditionsOptions) {
  const putInAccessPointId = options?.putInAccessPointId;

  return useQuery<ConditionResponse | null, Error>({
    queryKey: ['conditions', riverId, putInAccessPointId],
    queryFn: async (): Promise<ConditionResponse | null> => {
      if (!riverId) return null;

      const url = new URL(`/api/conditions/${riverId}`, window.location.origin);
      if (putInAccessPointId) {
        url.searchParams.set('putInAccessPointId', putInAccessPointId);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch conditions');
      }
      const data = (await response.json()) as ConditionResponse;
      return data;
    },
    enabled: !!riverId,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });
}
