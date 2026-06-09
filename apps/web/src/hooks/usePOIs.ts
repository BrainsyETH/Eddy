// src/hooks/usePOIs.ts
// React Query hook for fetching points of interest

import { useQuery } from '@tanstack/react-query';
import type { PointOfInterest } from '@/types/nps';

export function usePOIs(riverSlug: string | null) {
  return useQuery({
    queryKey: ['pois', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      const response = await fetch(`/api/rivers/${riverSlug}/pois`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.pois || []) as PointOfInterest[];
    },
    enabled: !!riverSlug,
    staleTime: 30 * 1000, // 30s - pick up admin edits faster
    refetchOnWindowFocus: true,
  });
}
