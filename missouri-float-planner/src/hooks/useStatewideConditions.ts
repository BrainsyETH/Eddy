// src/hooks/useStatewideConditions.ts
// Shared data source for every consumer of "all curated rivers + live
// readings": the map's condition network layer and the plan page's Filters
// panel. Two CDN-cached endpoints, cached client-side by React Query so
// N consumers on a page cost one fetch each.
//
//   /api/usgs/mo-dataset?slim=1 — river geometry + gauge thresholds only
//   /api/usgs/mo-statewide      — live readings per gauge (15-min cadence,
//                                 USGS→NWS fallback handled server-side)
//
// useConditionNetwork() layers the classification on top: one condition-
// coded geojson feature per curated river, plus per-condition counts and
// the newest reading timestamp — so the map layer that draws the network
// and the Filters UI that filters/summarizes it agree by construction.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { classifyStageFromThresholds, type MODataset, type MORiver } from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideResponse, MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import { conditionColor, CONDITION_ORDER, type ConditionCode } from '@shared/condition-system';
import { NO_DATA_WATER_COLOR } from '@/components/map/line-style';

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

export interface ConditionNetworkFeatureProps {
  riverId: string;
  slug: string;
  name: string;
  /** Resolved paint color (condition color, or the no-data water blue). */
  color: string;
  /** Verdict code — 'unknown' when the river has no rated reading. */
  code: ConditionCode;
}

export interface ConditionNetworkFeature {
  type: 'Feature';
  geometry: MORiver['geometry'];
  properties: ConditionNetworkFeatureProps;
}

/**
 * The statewide condition network as data: every curated river classified
 * (same primary-gauge path the Observatory uses) into a geojson feature
 * with `code` + `color` properties. Consumed by ConditionNetworkLayer for
 * rendering and by the plan page's Filters panel for counts/filtering.
 */
export function useConditionNetwork(excludeRiverId?: string): {
  collection: { type: 'FeatureCollection'; features: ConditionNetworkFeature[] } | null;
  /** Rivers per condition code (unfiltered by any UI selection). */
  countsByCode: Record<ConditionCode, number>;
  /** Newest actual USGS reading timestamp across gauges (not fetch time). */
  newestReadingAt: string | null;
} {
  const { rivers, gauges } = useStatewideConditions();

  const collection = useMemo(() => {
    if (!rivers?.length) return null;
    const readingBySite = new Map((gauges ?? []).map((g) => [g.site_no, g]));
    const features = rivers
      .filter((r) => r.id !== excludeRiverId && r.geometry?.coordinates?.length >= 2)
      .map((r): ConditionNetworkFeature => {
        const primary = (r.gauges ?? []).find((g) => g.is_primary);
        const reading = primary ? readingBySite.get(primary.site_id) : undefined;
        let code: ConditionCode = 'unknown';
        if (primary && reading) {
          const stageFt = reading.gaugeHeightFt ?? null;
          const value =
            primary.threshold_unit === 'ft' ? stageFt : reading.dischargeCfs ?? null;
          code = classifyStageFromThresholds(value, primary.threshold_unit, primary, stageFt);
        }
        return {
          type: 'Feature',
          geometry: r.geometry,
          properties: {
            riverId: r.id,
            slug: r.slug,
            name: r.name,
            code,
            color: code !== 'unknown' ? conditionColor(code) : NO_DATA_WATER_COLOR,
          },
        };
      });
    if (!features.length) return null;
    return { type: 'FeatureCollection' as const, features };
  }, [rivers, gauges, excludeRiverId]);

  const countsByCode = useMemo(() => {
    const counts = Object.fromEntries(CONDITION_ORDER.map((c) => [c, 0])) as Record<
      ConditionCode,
      number
    >;
    counts.unknown = 0;
    for (const f of collection?.features ?? []) counts[f.properties.code] += 1;
    return counts;
  }, [collection]);

  const newestReadingAt = useMemo(() => {
    let max: string | null = null;
    for (const g of gauges ?? []) {
      const t = g.readingTimestamp;
      if (t && !Number.isNaN(Date.parse(t)) && (!max || Date.parse(t) > Date.parse(max))) max = t;
    }
    return max;
  }, [gauges]);

  return { collection, countsByCode, newestReadingAt };
}
