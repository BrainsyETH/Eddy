'use client';

// src/components/map/RouteLayer.tsx
// Displays the selected float route on the map

import { useEffect } from 'react';
import { useMap } from './MapContainer';
import type { GeoJSON } from 'geojson';

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
    const routeGlowLayerId = 'float-route-glow-layer';

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
        if (hasLayer(routeGlowLayerId)) map.removeLayer(routeGlowLayerId);
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
    const glowColor = isUpstream ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)';

    // Add or update route source
    if (hasSource(routeSourceId)) {
      try {
        (map.getSource(routeSourceId) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          geometry,
          properties: {},
        });
        // Update colors if direction changed
        if (hasLayer(routeLayerId)) {
          map.setPaintProperty(routeLayerId, 'line-color', routeColor);
        }
        if (hasLayer(routeGlowLayerId)) {
          map.setPaintProperty(routeGlowLayerId, 'line-color', glowColor);
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

        // Route glow layer (underneath)
        if (!hasLayer(routeGlowLayerId)) {
          map.addLayer({
            id: routeGlowLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
              'line-color': glowColor,
              'line-width': 14,
              'line-opacity': 0.6,
              'line-blur': 4,
            },
          });
        }

        // Main route line
        if (!hasLayer(routeLayerId)) {
          map.addLayer({
            id: routeLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
              'line-color': routeColor,
              'line-width': 5,
              'line-opacity': 1,
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });
        }
      } catch (err) {
        console.warn('Error adding route source/layers:', err);
      }
    }

    // Cleanup on unmount
    return () => {
      try {
        if (hasLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (hasLayer(routeGlowLayerId)) map.removeLayer(routeGlowLayerId);
        if (hasSource(routeSourceId)) map.removeSource(routeSourceId);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [map, routeGeometry, isUpstream]);

  return null;
}
