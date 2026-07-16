'use client';

// src/components/map/ConditionNetworkLayer.tsx
// The statewide condition network: EVERY curated river drawn in its live
// condition color — the Observatory's statewide picture, on the interactive
// map. This is what makes the Immersive style read like Eddy instead of a
// generic satellite map, and it gives Natural/planner views the "where is
// it floatable right now" answer at a glance.
//
// Data comes from two existing CDN-cached endpoints (no new API surface):
//   /api/usgs/mo-dataset    — curated rivers with geometry + gauge thresholds
//   /api/usgs/mo-statewide  — live readings per gauge (15-min cadence, with
//                             the USGS→NWS fallback logic server-side)
// Verdicts are classified client-side with the same exported
// classifyStageFromThresholds the Observatory uses, primary gauge per river.
//
// Rendering: one geojson source with a per-feature `color` property,
// casing + data-driven line at the curated style's line anchor — beneath
// every label, and beneath the focused river / route layers (which mount
// after this one and therefore stack above it). A `excludeRiverId` prop
// keeps the page's hero river out of the network so the two never
// double-draw.

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMap } from './MapContainer';
import { ANCHORS, addLayerAt } from './layer-anchors';
import {
  NETWORK_LINE_WIDTH,
  NETWORK_CASING_WIDTH,
  CASING_COLOR,
  NO_DATA_WATER_COLOR,
} from './line-style';
import { conditionColor } from '@shared/condition-system';
import {
  classifyStageFromThresholds,
  type MODataset,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideResponse } from '@/app/api/usgs/mo-statewide/route';

const SOURCE_ID = 'condition-network-source';
const LINE_LAYER_ID = 'condition-network-layer';
const CASING_LAYER_ID = 'condition-network-casing-layer';

function useConditionNetwork() {
  const dataset = useQuery<MODataset, Error>({
    queryKey: ['mo-dataset'],
    queryFn: async () => {
      const res = await fetch('/api/usgs/mo-dataset');
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

export default function ConditionNetworkLayer({
  excludeRiverId,
}: {
  /** The page's hero river — rendered by ConditionRiverLayer/RouteLayer
   *  instead, so the network skips it. */
  excludeRiverId?: string;
}) {
  const map = useMap();
  const { rivers, gauges } = useConditionNetwork();

  // FeatureCollection with one condition-colored feature per curated river.
  // Same classification path the Observatory's scrubbed-day view uses:
  // primary gauge, threshold_unit picks the reading, flood stage overrides.
  const collection = useMemo(() => {
    if (!rivers?.length) return null;
    const readingBySite = new Map(
      (gauges ?? []).map((g) => [g.site_no, g]),
    );
    const features = rivers
      .filter((r) => r.id !== excludeRiverId && r.geometry?.coordinates?.length >= 2)
      .map((r) => {
        const primary = (r.gauges ?? []).find((g) => g.is_primary);
        const reading = primary ? readingBySite.get(primary.site_id) : undefined;
        let color = NO_DATA_WATER_COLOR;
        if (primary && reading) {
          const stageFt = reading.gaugeHeightFt ?? null;
          const value =
            primary.threshold_unit === 'ft' ? stageFt : reading.dischargeCfs ?? null;
          const verdict = classifyStageFromThresholds(
            value,
            primary.threshold_unit,
            primary,
            stageFt,
          );
          if (verdict !== 'unknown') color = conditionColor(verdict);
        }
        return {
          type: 'Feature' as const,
          geometry: r.geometry,
          properties: { riverId: r.id, slug: r.slug, color },
        };
      });
    if (!features.length) return null;
    return { type: 'FeatureCollection' as const, features };
  }, [rivers, gauges, excludeRiverId]);

  useEffect(() => {
    if (!map || !collection) return;

    if (!map.loaded()) {
      const handleLoad = () => {
        // Map loaded, effect will re-run
      };
      map.once('load', handleLoad);
      return () => {
        map.off('load', handleLoad);
      };
    }

    const hasLayer = (id: string): boolean => {
      try {
        return map.getLayer(id) !== undefined;
      } catch {
        return false;
      }
    };

    try {
      map.addSource(SOURCE_ID, { type: 'geojson', data: collection });

      addLayerAt(map, {
        id: CASING_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': CASING_COLOR, 'line-width': NETWORK_CASING_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      addLayerAt(map, {
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': NETWORK_LINE_WIDTH,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);
    } catch (err) {
      console.warn('Error adding condition network layers:', err);
    }

    return () => {
      try {
        for (const id of [LINE_LAYER_ID, CASING_LAYER_ID]) {
          if (hasLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [map, collection]);

  return null;
}
