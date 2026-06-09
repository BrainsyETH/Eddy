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
  });
}
