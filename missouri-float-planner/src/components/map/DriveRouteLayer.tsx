'use client';

// src/components/map/DriveRouteLayer.tsx
// Displays the shuttle driving route on the map as a blue dashed line

import { useEffect } from 'react';
import { useMap } from './MapContainer';

interface DriveRouteLayerProps {
  routeGeometry: GeoJSON.LineString | null;
}

const DRIVE_SOURCE_ID = 'drive-route-source';
const DRIVE_LAYER_ID = 'drive-route-layer';
const DRIVE_GLOW_LAYER_ID = 'drive-route-glow-layer';

export default function DriveRouteLayer({
  routeGeometry,
}: DriveRouteLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Helper to safely check if source exists
    const hasSource = (): boolean => {
      try {
        return map.getSource(DRIVE_SOURCE_ID) !== undefined;
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

    // Helper to clean up layers and source
    const cleanup = () => {
      try {
        if (hasLayer(DRIVE_LAYER_ID)) map.removeLayer(DRIVE_LAYER_ID);
        if (hasLayer(DRIVE_GLOW_LAYER_ID)) map.removeLayer(DRIVE_GLOW_LAYER_ID);
        if (hasSource()) map.removeSource(DRIVE_SOURCE_ID);
      } catch {
        // Ignore cleanup errors
      }
    };

    // Function to add/update the drive route
    const addDriveRoute = () => {
      if (!routeGeometry || !routeGeometry.coordinates || routeGeometry.coordinates.length === 0) {
        cleanup();
        return;
      }

      // Blue color for driving route
      const routeColor = '#3b82f6'; // blue-500
      const glowColor = 'rgba(59, 130, 246, 0.4)';

      const geojsonData: GeoJSON.Feature = {
        type: 'Feature',
        geometry: routeGeometry,
        properties: {},
      };

      // Add or update source
      if (hasSource()) {
        try {
          const source = map.getSource(DRIVE_SOURCE_ID) as maplibregl.GeoJSONSource;
          source.setData(geojsonData);
        } catch (err) {
          console.warn('Error updating drive route source:', err);
        }
      } else {
        try {
          map.addSource(DRIVE_SOURCE_ID, {
            type: 'geojson',
            data: geojsonData,
          });
        } catch (err) {
          console.warn('Error adding drive route source:', err);
          return;
        }
      }

      // Add glow layer if it doesn't exist
      if (!hasLayer(DRIVE_GLOW_LAYER_ID)) {
        try {
          map.addLayer({
            id: DRIVE_GLOW_LAYER_ID,
            type: 'line',
            source: DRIVE_SOURCE_ID,
            paint: {
              'line-color': glowColor,
              'line-width': 8,
              'line-opacity': 0.6,
              'line-blur': 2,
            },
          });
        } catch (err) {
          console.warn('Error adding drive route glow layer:', err);
        }
      }

      // Add main route layer if it doesn't exist
      if (!hasLayer(DRIVE_LAYER_ID)) {
        try {
          map.addLayer({
            id: DRIVE_LAYER_ID,
            type: 'line',
            source: DRIVE_SOURCE_ID,
            paint: {
              'line-color': routeColor,
              'line-width': 3,
              'line-opacity': 0.9,
              'line-dasharray': [2, 2],
            },
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
          });
        } catch (err) {
          console.warn('Error adding drive route layer:', err);
        }
      }
    };

    // Wait for map style to be loaded
    const setupRoute = () => {
      if (map.isStyleLoaded()) {
        addDriveRoute();
      } else {
        map.once('style.load', addDriveRoute);
      }
    };

    // Handle style changes (style change removes all custom layers)
    const handleStyleLoad = () => {
      addDriveRoute();
    };

    setupRoute();
    map.on('style.load', handleStyleLoad);

    // Cleanup on unmount or when routeGeometry changes
    return () => {
      map.off('style.load', handleStyleLoad);
      cleanup();
    };
  }, [map, routeGeometry]);

  return null;
}
