// src/hooks/useAccessPoints.ts
// React Query hook for fetching access points

import { useQuery } from '@tanstack/react-query';
import type { AccessPointsResponse } from '@/types/api';

export function useAccessPoints(riverSlug: string | null) {
  return useQuery({
    queryKey: ['access-points', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      const response = await fetch(`/api/rivers/${riverSlug}/access-points`);
      if (!response.ok) {
        throw new Error('Failed to fetch access points');
      }
      const data = (await response.json()) as AccessPointsResponse;
      return data.accessPoints;
    },
    enabled: !!riverSlug,
  });
}
