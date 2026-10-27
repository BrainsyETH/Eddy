// src/hooks/useRiverVisualPins.ts
// React Query hook for verified river-visual photo pins (map markers).

import { useQuery, useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { RiverVisualPin } from '@/types/api';

function riverVisualPinsQuery(riverSlug: string | null, enabled: boolean) {
  return {
    queryKey: ['river-visual-pins', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      const res = await fetch(`/api/rivers/${riverSlug}/visuals/pins`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.pins || []) as RiverVisualPin[];
    },
    enabled: !!riverSlug && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  };
}

export function useRiverVisualPins(riverSlug: string | null, enabled = true) {
  return useQuery(riverVisualPinsQuery(riverSlug, enabled));
}

const combinePins = (results: UseQueryResult<RiverVisualPin[]>[]) =>
  results.flatMap(result => result.data ?? []);

/** Reuse the per-river cache and CDN endpoints for the desktop regional map. */
export function useRegionalRiverVisualPins(riverSlugs: string[], enabled: boolean) {
  return useQueries({
    queries: riverSlugs.map(slug => riverVisualPinsQuery(slug, enabled)),
    combine: combinePins,
  });
}
