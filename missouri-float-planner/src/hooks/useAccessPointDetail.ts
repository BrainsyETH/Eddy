// src/hooks/useAccessPointDetail.ts
// React Query hook for fetching access point detail

import { useQuery } from '@tanstack/react-query';
import type { AccessPointDetailResponse } from '@/types/api';

export function useAccessPointDetail(
  riverSlug: string | null,
  accessSlug: string | null
) {
  return useQuery<AccessPointDetailResponse, Error>({
    queryKey: ['access-point-detail', riverSlug, accessSlug],
    queryFn: async (): Promise<AccessPointDetailResponse> => {
      if (!riverSlug || !accessSlug) {
        throw new Error('Missing river or access point slug');
      }

      const response = await fetch(
        `/api/rivers/${riverSlug}/access/${accessSlug}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Access point not found');
        }
        throw new Error('Failed to fetch access point details');
      }

      return response.json();
    },
    enabled: !!riverSlug && !!accessSlug,
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}
