// src/hooks/useHazards.ts
// React Query hook for fetching river hazards (low-water dams, strainers, rapids, etc.)

import { useQuery } from '@tanstack/react-query';
import type { Hazard } from '@/types/api';

export function useHazards(riverSlug: string | null | undefined) {
  return useQuery({
    queryKey: ['hazards', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      const response = await fetch(`/api/rivers/${riverSlug}/hazards`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.hazards || []) as Hazard[];
    },
    enabled: !!riverSlug,
    staleTime: 5 * 60 * 1000, // 5 min - hazards change infrequently
    refetchOnWindowFocus: true,
  });
}
