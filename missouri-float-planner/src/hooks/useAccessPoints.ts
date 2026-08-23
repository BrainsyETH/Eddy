// src/hooks/useAccessPoints.ts
// React Query hook for fetching access points

import { useQuery } from '@tanstack/react-query';
import type { AccessPointsResponse } from '@/types/api';

export function useAccessPoints(riverSlug: string | null) {
  return useQuery({
    queryKey: ['access-points', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      // `include=non_endpoints` asks for the places that are on the river but
      // are not launches — a park or campground with no ramp. The web draws them
      // and keeps them out of the put-in/take-out pickers, which is the deal the
      // parameter represents; a caller that cannot make that distinction must
      // not ask for them. See the route's header.
      const response = await fetch(
        `/api/rivers/${riverSlug}/access-points?include=non_endpoints`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch access points');
      }
      const data = (await response.json()) as AccessPointsResponse;
      return data.accessPoints;
    },
    enabled: !!riverSlug,
    placeholderData: (previousData) => previousData,
  });
}
