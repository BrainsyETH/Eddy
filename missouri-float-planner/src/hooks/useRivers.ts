// src/hooks/useRivers.ts
// React Query hook for fetching rivers

import { useQuery } from '@tanstack/react-query';
import type { RiversResponse, RiverDetailResponse } from '@/types/api';

export function useRivers() {
  return useQuery({
    queryKey: ['rivers'],
    queryFn: async () => {
      const response = await fetch('/api/rivers');
      if (!response.ok) {
        throw new Error('Failed to fetch rivers');
      }
      const data = (await response.json()) as RiversResponse;
      return data.rivers;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes — rivers rarely change
  });
}

export function useRiver(slug: string) {
  return useQuery({
    queryKey: ['river', slug],
    queryFn: async () => {
      const response = await fetch(`/api/rivers/${slug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch river');
      }
      const data = (await response.json()) as RiverDetailResponse;
      return data.river;
    },
    enabled: !!slug,
    // Keep the previously selected river's data on screen while the next
    // one loads. Without this, switching rivers flips isLoading true and
    // the planner unmounts the whole map (PlanPageClient's riverLoading
    // guard) — so the map "reloaded" on every switch. Now isLoading is only
    // true on the very first load; switches keep the map mounted and just
    // ease the camera to the new bounds.
    placeholderData: (previousData) => previousData,
  });
}
