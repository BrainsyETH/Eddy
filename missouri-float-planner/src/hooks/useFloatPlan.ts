// src/hooks/useFloatPlan.ts
// React Query hook for calculating float plans

import { useQuery } from '@tanstack/react-query';
import type { PlanResponse } from '@/types/api';

interface PlanParams {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId?: string;
}

export function useFloatPlan(params: PlanParams | null) {
  return useQuery({
    queryKey: ['float-plan', params],
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
      const response = await fetch(`/api/plan?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to calculate float plan');
      }
      const data = (await response.json()) as PlanResponse;
      return data.plan;
    },
    enabled: !!params && !!params.riverId && !!params.startId && !!params.endId,
  });
}
