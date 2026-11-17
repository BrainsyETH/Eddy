// src/hooks/useRivers.ts
// React Query hook for fetching rivers

import { loadRiver, loadRivers } from '@/lib/rivers-request';
import { useQuery } from '@tanstack/react-query';

export function useRivers() {
  return useQuery({
    queryKey: ['rivers'],
    queryFn: ({ signal }) => loadRivers(signal),
    staleTime: 10 * 60 * 1000, // 10 minutes — rivers rarely change
  });
}

export function useRiver(slug: string) {
  return useQuery({
    queryKey: ['river', slug],
    queryFn: ({ signal }) => loadRiver(slug, signal),
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
