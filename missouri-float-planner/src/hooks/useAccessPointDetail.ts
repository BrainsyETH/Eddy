'use client';

import { useQuery } from '@tanstack/react-query';
import type { AccessPointDetailResponse } from '@/types/api';

/** One selected place at a time; never show the previous place while loading. */
export function useAccessPointDetail(riverSlug: string, slug: string, id: string) {
  return useQuery({
    queryKey: ['access-point-detail', riverSlug, slug, id],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/rivers/${encodeURIComponent(riverSlug)}/access/${encodeURIComponent(slug)}?includeEstimates=0`, { signal });
      if (!response.ok) throw new Error('Access details unavailable');
      const data = await response.json() as AccessPointDetailResponse;
      if (data.accessPoint?.id !== id) throw new Error('Access details do not match this place');
      return data;
    },
    enabled: !!riverSlug && !!slug,
    staleTime: 60_000,
  });
}
