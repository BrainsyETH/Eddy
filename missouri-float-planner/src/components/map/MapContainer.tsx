'use client';

// src/components/map/MapContainer.tsx
// Main map wrapper component using MapLibre GL JS

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AccessPoint } from '@/types/api';
import type { Coordinates } from '@/types/geo';

interface MapContainerProps {
  initialBounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  onAccessPointClick?: (point: AccessPoint) => void;
  selectedPutIn?: string | null;
  selectedTakeOut?: string | null;
  children?: React.ReactNode;
}

export default function MapContainer({
  initialBounds,
  onAccessPointClick,
  selectedPutIn,
  selectedTakeOut,
  children,
}: MapContainerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapStyleUrl =
      process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
      'https://demotiles.maplibre.org/style.json';

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyleUrl,
      center: initialBounds
        ? [
            (initialBounds[0] + initialBounds[2]) / 2,
            (initialBounds[1] + initialBounds[3]) / 2,
          ]
        : [-91.5, 37.8], // Center of Missouri
      zoom: initialBounds ? 8 : 7,
      bounds: initialBounds
        ? new maplibregl.LngLatBounds(
            [initialBounds[0], initialBounds[1]],
            [initialBounds[2], initialBounds[3]]
          )
        : undefined,
      fitBoundsOptions: {
        padding: 50,
      },
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initialBounds]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      {mapLoaded && map.current && (
        <MapProvider map={map.current}>{children}</MapProvider>
      )}
    </div>
  );
}

// Context to share map instance with child components
import { createContext, useContext } from 'react';

const MapContext = createContext<maplibregl.Map | null>(null);

export function useMap() {
  const map = useContext(MapContext);
  if (!map) {
    throw new Error('useMap must be used within MapContainer');
  }
  return map;
}

// Wrapper component that provides map context
export function MapProvider({
  map,
  children,
}: {
  map: maplibregl.Map | null;
  children: React.ReactNode;
}) {
  return (
    <MapContext.Provider value={map}>{children}</MapContext.Provider>
  );
}
