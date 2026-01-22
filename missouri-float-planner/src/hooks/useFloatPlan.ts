// src/hooks/useFloatPlan.ts
// React Query hook for calculating float plans
// vesselTypeId is included in queryKey for native caching of different vessel types

import { useQuery } from '@tanstack/react-query';
import type { PlanResponse } from '@/types/api';

interface PlanParams {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId?: string;
  tripDurationDays?: number;
}

export function useFloatPlan(params: PlanParams | null) {
  return useQuery({
    // Include vesselTypeId explicitly in queryKey for instant vessel switching
    // TanStack Query will cache each vessel type separately
    queryKey: [
      'float-plan',
      params?.riverId,
      params?.startId,
      params?.endId,
      params?.vesselTypeId,
      params?.tripDurationDays,
    ],
    queryFn: async () => {
      if (!params) return null;
      const searchParams = new URLSearchParams({
        riverId: params.riverId,
        startId: params.startId,
        endId: params.endId,
      });
      if (params.vesselTypeId) {
        searchParams.set('vesselTypeId', params.vesselTypeId);
      }
      if (params.tripDurationDays && params.tripDurationDays > 1) {
        searchParams.set('tripDurationDays', params.tripDurationDays.toString());
      }
      const response = await fetch(`/api/plan?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to calculate float plan');
      }
      const data = (await response.json()) as PlanResponse;
      return data.plan;
    },
    enabled: !!params && !!params.riverId && !!params.startId && !!params.endId,
    // Keep previous data while fetching new vessel type for smoother UX
    placeholderData: (previousData) => previousData,
    // Stale time of 5 minutes - conditions don't change that fast
    staleTime: 5 * 60 * 1000,
  });
}
