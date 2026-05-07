'use client';

// src/components/map/AllRiversLayer.tsx
// Renders every river's polyline on the same MapLibre map at once, colored
// by current condition. Used by the /plan overview when no river is selected.
//
// Implementation note: a single FeatureCollection source + data-driven paint
// is far cheaper than instantiating RiverLayer N times — that component owns
// hard-coded singleton source IDs and can't multi-instance.

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import { CONDITION_COLORS } from '@/constants';
import type { RiverGeometry } from '@/hooks/useAllRiverGeometries';

interface AllRiversLayerProps {
  rivers: RiverGeometry[];
}

const SOURCE_ID = 'all-rivers-source';
const GLOW_LAYER_ID = 'all-rivers-glow';
const MAIN_LAYER_ID = 'all-rivers-main';

// MapLibre data-driven `match` expression mapping conditionCode → color.
// Mirrors CONDITION_COLORS keys; expression form is required because we paint
// via the source feature property at render time.
const COLOR_MATCH_EXPRESSION: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'conditionCode'],
  'flowing', CONDITION_COLORS.flowing,
  'good', CONDITION_COLORS.good,
  'low', CONDITION_COLORS.low,
  'too_low', CONDITION_COLORS.too_low,
  'high', CONDITION_COLORS.high,
  'dangerous', CONDITION_COLORS.dangerous,
  CONDITION_COLORS.unknown,
];

export default function AllRiversLayer({ rivers }: AllRiversLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map || rivers.length === 0) return;

    const hasSource = (id: string) => {
      try { return map.getSource(id) !== undefined; } catch { return false; }
    };
    const hasLayer = (id: string) => {
      try { return map.getLayer(id) !== undefined; } catch { return false; }
    };

    const buildFeatureCollection = (): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
      type: 'FeatureCollection',
      features: rivers
        .filter(r => (r.smoothedGeometry?.coordinates?.length ?? r.geometry.coordinates.length) > 0)
        .map(r => ({
          type: 'Feature',
          geometry: r.smoothedGeometry ?? r.geometry,
          properties: {
            riverId: r.id,
            slug: r.slug,
            name: r.name,
            conditionCode: r.conditionCode,
          },
        })),
    });

    const apply = () => {
      const fc = buildFeatureCollection();

      if (hasSource(SOURCE_ID)) {
        try {
          (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(fc);
        } catch (err) {
          console.warn('Error updating all-rivers source:', err);
        }
      } else {
        try {
          map.addSource(SOURCE_ID, { type: 'geojson', data: fc });
        } catch (err) {
          console.warn('Error adding all-rivers source:', err);
          return;
        }
      }

      if (!hasLayer(GLOW_LAYER_ID)) {
        try {
          map.addLayer({
            id: GLOW_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            paint: {
              'line-color': COLOR_MATCH_EXPRESSION,
              'line-width': 8,
              'line-opacity': 0.25,
              'line-blur': 4,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
        } catch (err) {
          console.warn('Error adding all-rivers glow layer:', err);
        }
      }

      if (!hasLayer(MAIN_LAYER_ID)) {
        try {
          map.addLayer({
            id: MAIN_LAYER_ID,
            type: 'line',
            source: SOURCE_ID,
            paint: {
              'line-color': COLOR_MATCH_EXPRESSION,
              'line-width': 3,
              'line-opacity': 0.9,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
        } catch (err) {
          console.warn('Error adding all-rivers main layer:', err);
        }
      }
    };

    if (map.loaded()) {
      apply();
    } else {
      map.once('load', apply);
    }

    return () => {
      try {
        if (hasLayer(MAIN_LAYER_ID)) map.removeLayer(MAIN_LAYER_ID);
        if (hasLayer(GLOW_LAYER_ID)) map.removeLayer(GLOW_LAYER_ID);
        if (hasSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // ignore cleanup errors during unmount
      }
    };
  }, [map, rivers]);

  return null;
}
