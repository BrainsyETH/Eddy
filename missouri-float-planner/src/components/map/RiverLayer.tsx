'use client';

// src/components/map/RiverLayer.tsx
// Displays river lines on the map

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import type { GeoJSON } from 'geojson';

interface RiverLayerProps {
  riverGeometry?: GeoJSON.LineString;
  selected?: boolean;
  routeGeometry?: GeoJSON.LineString;
}

export default function RiverLayer({
  riverGeometry,
  selected = false,
  routeGeometry,
}: RiverLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!riverGeometry) return;

    const sourceId = 'river-source';
    const layerId = 'river-layer';
    const routeSourceId = 'route-source';
    const routeLayerId = 'route-layer';

    // Add or update river source
    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        geometry: riverGeometry,
        properties: {},
      });
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: riverGeometry,
          properties: {},
        },
      });

      // Add river layer
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': selected ? '#1e40af' : '#60a5fa',
            'line-width': selected ? 4 : 2,
            'line-opacity': 0.8,
          },
        });
      }
    }

    // Update layer style if selection changed
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-color', selected ? '#1e40af' : '#60a5fa');
      map.setPaintProperty(layerId, 'line-width', selected ? 4 : 2);
    }

    // Add route highlight if provided
    if (routeGeometry) {
      if (map.getSource(routeSourceId)) {
        (map.getSource(routeSourceId) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          geometry: routeGeometry,
          properties: {},
        });
      } else {
        map.addSource(routeSourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: routeGeometry,
            properties: {},
          },
        });

        if (!map.getLayer(routeLayerId)) {
          map.addLayer({
            id: routeLayerId,
            type: 'line',
            source: routeSourceId,
            paint: {
              'line-color': '#3b82f6',
              'line-width': 6,
              'line-opacity': 0.9,
              'line-dasharray': [2, 2],
            },
          });
        }
      }
    } else {
      // Remove route layer if no route
      if (map.getLayer(routeLayerId)) {
        map.removeLayer(routeLayerId);
      }
      if (map.getSource(routeSourceId)) {
        map.removeSource(routeSourceId);
      }
    }

    // Cleanup
    return () => {
      // Don't remove sources/layers on unmount - let parent handle cleanup
    };
  }, [map, riverGeometry, selected, routeGeometry]);

  return null;
}
