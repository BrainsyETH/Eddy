// src/hooks/useStatewideConditions.ts
// Shared data source for every consumer of "all curated rivers + live
// readings": the map's condition network layer and the plan page's float
// window. Two CDN-cached endpoints, cached client-side by React Query so
// N consumers on a page cost one fetch each.
//
//   /api/usgs/mo-dataset?slim=1 — river geometry + gauge thresholds only
//   /api/usgs/mo-statewide      — live readings per gauge (15-min cadence,
//                                 USGS→NWS fallback handled server-side)

import { useQuery } from '@tanstack/react-query';
import type { MODataset, MORiver } from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideResponse, MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';

export function useStatewideConditions(): {
  rivers: MORiver[] | undefined;
  gauges: MoStatewideGauge[] | undefined;
} {
  const dataset = useQuery<MODataset, Error>({
    queryKey: ['mo-dataset', 'slim'],
    queryFn: async () => {
      const res = await fetch('/api/usgs/mo-dataset?slim=1');
      if (!res.ok) throw new Error('Failed to fetch river dataset');
      return (await res.json()) as MODataset;
    },
    staleTime: 10 * 60 * 1000, // geometries/thresholds barely change
    refetchOnWindowFocus: false,
  });
  const statewide = useQuery<MoStatewideResponse, Error>({
    queryKey: ['mo-statewide'],
    queryFn: async () => {
      const res = await fetch('/api/usgs/mo-statewide');
      if (!res.ok) throw new Error('Failed to fetch statewide readings');
      return (await res.json()) as MoStatewideResponse;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000, // matches the payload's 900s cadence
    refetchOnWindowFocus: false,
  });
  return { rivers: dataset.data?.rivers, gauges: statewide.data?.gauges };
}
