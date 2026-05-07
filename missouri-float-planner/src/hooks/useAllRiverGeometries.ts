// src/hooks/useAllRiverGeometries.ts
// Fetches every river's geometry + current condition in a single batch.
// Used by the /plan overview map to render all rivers at once.

import { useQuery } from '@tanstack/react-query';
import type { ConditionCode } from '@/types/api';

export interface RiverGeometry {
  id: string;
  slug: string;
  name: string;
  geometry: GeoJSON.LineString;
  smoothedGeometry: GeoJSON.LineString | null;
  conditionCode: ConditionCode;
}

interface RiverGeometriesResponse {
  rivers: RiverGeometry[];
}

export function useAllRiverGeometries() {
  return useQuery({
    queryKey: ['river-geometries'],
    queryFn: async () => {
      const res = await fetch('/api/rivers/geometries');
      if (!res.ok) throw new Error('Failed to fetch river geometries');
      const data = (await res.json()) as RiverGeometriesResponse;
      return data.rivers;
    },
    staleTime: 10 * 60 * 1000,
  });
}
