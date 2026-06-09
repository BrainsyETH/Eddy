// src/hooks/useNearbyServices.ts
// React Query hook for fetching nearby services directory

import { useQuery } from '@tanstack/react-query';
import type { NearbyServiceDirectory } from '@/types/api';

export function useNearbyServices(riverSlug: string | null) {
  return useQuery({
    queryKey: ['nearby-services', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      const response = await fetch(`/api/rivers/${riverSlug}/services`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.services || []) as NearbyServiceDirectory[];
    },
    enabled: !!riverSlug,
    staleTime: 5 * 60 * 1000, // 5 min — services change rarely
  });
}
