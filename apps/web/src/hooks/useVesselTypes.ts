// src/hooks/useVesselTypes.ts
// React Query hook for fetching vessel types

import { useQuery } from '@tanstack/react-query';
import type { VesselTypesResponse } from '@/types/api';

export function useVesselTypes() {
  return useQuery({
    queryKey: ['vessel-types'],
    queryFn: async () => {
      const response = await fetch('/api/vessel-types');
      if (!response.ok) {
        throw new Error('Failed to fetch vessel types');
      }
      const data = (await response.json()) as VesselTypesResponse;
      return data.vesselTypes;
    },
    staleTime: 60 * 60 * 1000, // 1 hour — vessel types are essentially static
  });
}
