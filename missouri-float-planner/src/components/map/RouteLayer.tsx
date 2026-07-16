'use client';

// src/components/map/RouteLayer.tsx
// Displays the selected float route on the map.
//
// Two crisp line layers — a neutral casing under a colored line — instead
// of the old soft blurred glow. Widths interpolate across zoom so the
// route stays readable from state framing (z7) to gravel-bar framing
// (z16) instead of going hairline or chunky. Both layers insert at the
// curated style's line anchor, BELOW every label: a route can never cover
// a town name (see ./layer-anchors.ts).

import { useEffect } from 'react';
import { useMap } from './MapContainer';
import { ANCHORS, addLayerAt } from './layer-anchors';
import type { GeoJSON } from 'geojson';

// Zoom-interpolated widths (exponential 1.5 tracks how fast ground size
// shrinks per zoom level). Casing reads as a ~2px halo around the line.
const ROUTE_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.5], ['zoom'],
  7, 2,
  10, 3.5,
  13, 5.5,
  16, 8,
];
const CASING_WIDTH: maplibregl.ExpressionSpecification = [
  'interpolate', ['exponential', 1.5], ['zoom'],
  7, 4,
  10, 6.5,
  13, 9,
  16, 12.5,
];
// Neutral casing: separates the route color from terrain/hillshade on the
// light curated style and stays crisp on satellite.
const CASING_COLOR = 'rgba(255, 255, 255, 0.9)';

interface RouteLayerProps {
  routeGeometry: GeoJSON.LineString | GeoJSON.Feature | null;
  isUpstream?: boolean; // Color the route differently if upstream
}

export default function RouteLayer({
  routeGeometry,
  isUpstream = false,
}: RouteLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Wait for map to be loaded
    if (!map.loaded()) {
      const handleLoad = () => {
        // Map loaded, effect will re-run
      };
      map.once('load', handleLoad);
      return () => {
        map.off('load', handleLoad);
      };
    }

    const routeSourceId = 'float-route-source';
    const routeLayerId = 'float-route-layer';
    const routeCasingLayerId = 'float-route-casing-layer';

    // Helper to safely check if source exists
    const hasSource = (id: string): boolean => {
      try {
        return map.getSource(id) !== undefined;
      } catch {
        return false;
      }
    };

    // Helper to safely check if layer exists
    const hasLayer = (id: string): boolean => {
      try {
        return map.getLayer(id) !== undefined;
      } catch {
        return false;
      }
    };

    // Remove existing layers/source if no route geometry
    if (!routeGeometry) {
      try {
        if (hasLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (hasLayer(routeCasingLayerId)) map.removeLayer(routeCasingLayerId);
        if (hasSource(routeSourceId)) map.removeSource(routeSourceId);
      } catch (err) {
        console.warn('Error removing route layers:', err);
      }
      return;
    }

    // Extract geometry from Feature if needed
    const geometry = 'type' in routeGeometry && routeGeometry.type === 'Feature'
      ? (routeGeometry as GeoJSON.Feature).geometry as GeoJSON.LineString
      : routeGeometry as GeoJSON.LineString;

    // Route colors - green for downstream (valid), red for upstream (warning)
    const routeColor = isUpstream ? '#ef4444' : '#22c55e'; // red-500 or green-500

    // Add or update route source
    if (hasSource(routeSourceId)) {
      try {
        (map.getSource(routeSourceId) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          geometry,
          properties: {},
        });
        // Update color if direction changed
        if (hasLayer(routeLayerId)) {
          map.setPaintProperty(routeLayerId, 'line-color', routeColor);
        }
      } catch (err) {
        console.warn('Error updating route source:', err);
      }
    } else {
      try {
        map.addSource(routeSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry,
            properties: {},
          },
        });

        // Casing first, then the line — both immediately before the line
        // anchor, so the line stacks above its casing and both stay below
        // labels.
        if (!hasLayer(routeCasingLayerId)) {
          addLayerAt(map, {
            id: routeCasingLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
              'line-color': CASING_COLOR,
              'line-width': CASING_WIDTH,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          }, ANCHORS.lines);
        }

        // Main route line
        if (!hasLayer(routeLayerId)) {
          addLayerAt(map, {
            id: routeLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
              'line-color': routeColor,
              'line-width': ROUTE_WIDTH,
              'line-opacity': 1,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          }, ANCHORS.lines);
        }
      } catch (err) {
        console.warn('Error adding route source/layers:', err);
      }
    }

    // Cleanup on unmount
    return () => {
      try {
        if (hasLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (hasLayer(routeCasingLayerId)) map.removeLayer(routeCasingLayerId);
        if (hasSource(routeSourceId)) map.removeSource(routeSourceId);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [map, routeGeometry, isUpstream]);

  return null;
}
