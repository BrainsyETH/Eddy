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

      // Orange color for driving route (distinct from blue river)
      const routeColor = '#f97316'; // orange-500
      const outlineColor = '#ffffff';

      const geojsonData: GeoJSON.Feature = {
        type: 'Feature',
        geometry: routeGeometry,
        properties: {},
      };

      // Always clean up first to ensure fresh state after style changes
      cleanup();

      // Add source
      try {
        map.addSource(DRIVE_SOURCE_ID, {
          type: 'geojson',
          data: geojsonData,
        });
      } catch (err) {
        console.warn('Error adding drive route source:', err);
        return;
      }

      // Verify source was added before continuing
      if (!hasSource()) {
        console.warn('Drive route source not available after adding');
        return;
      }

      // Add white outline/casing layer for visibility
      try {
        map.addLayer({
          id: DRIVE_GLOW_LAYER_ID,
          type: 'line',
          source: DRIVE_SOURCE_ID,
          paint: {
            'line-color': outlineColor,
            'line-width': 6,
            'line-opacity': 0.8,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        });
      } catch (err) {
        console.warn('Error adding drive route outline layer:', err);
      }

      // Add main route layer with prominent dashed pattern
      try {
        map.addLayer({
          id: DRIVE_LAYER_ID,
          type: 'line',
          source: DRIVE_SOURCE_ID,
          paint: {
            'line-color': routeColor,
            'line-width': 4,
            'line-opacity': 1,
            'line-dasharray': [3, 2],
          },
          layout: {
            'line-cap': 'butt',
            'line-join': 'round',
          },
        });
      } catch (err) {
        console.warn('Error adding drive route layer:', err);
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
