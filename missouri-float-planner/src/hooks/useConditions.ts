// src/hooks/useConditions.ts
// React Query hook for fetching river conditions

import { useQuery } from '@tanstack/react-query';
import type { ConditionResponse } from '@/types/api';

export function useConditions(riverId: string | null) {
  return useQuery({
    queryKey: ['conditions', riverId],
    queryFn: async () => {
      if (!riverId) return null;
      const response = await fetch(`/api/conditions/${riverId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch conditions');
      }
      const data = (await response.json()) as ConditionResponse;
      return data.condition;
    },
    enabled: !!riverId,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}
