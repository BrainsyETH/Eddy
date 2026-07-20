// src/hooks/useRiverVisualPins.ts
// React Query hook for verified river-visual photo pins (map markers).

import { useQuery } from '@tanstack/react-query';
import type { RiverVisualPin } from '@/types/api';

export function useRiverVisualPins(riverSlug: string | null, enabled = true) {
  return useQuery({
    queryKey: ['river-visual-pins', riverSlug],
    queryFn: async () => {
      if (!riverSlug) return [];
      const res = await fetch(`/api/rivers/${riverSlug}/visuals/pins`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.pins || []) as RiverVisualPin[];
    },
    enabled: !!riverSlug && enabled,
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
