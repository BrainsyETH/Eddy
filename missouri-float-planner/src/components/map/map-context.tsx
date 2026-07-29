'use client';

// src/components/map/map-context.tsx
// The map instance, shared with layer components.
//
// Lifted out of MapContainer.tsx, which still re-exports both names so every
// existing `import { useMap } from './MapContainer'` keeps working. The split
// exists to break an import cycle: MapContainer now renders a layer component
// itself (PublicLandsLayer — a basemap overlay switched from its own layers
// panel, not page data), and that component needs useMap. With the context
// living in MapContainer, the two modules would import each other.

import { createContext, useContext } from 'react';
import type maplibregl from 'maplibre-gl';

const MapContext = createContext<maplibregl.Map | null>(null);

export function useMap() {
  const map = useContext(MapContext);
  if (!map) {
    throw new Error('useMap must be used within MapContainer');
  }
  return map;
}

/** Wrapper component that provides the map instance to layer children. */
export function MapProvider({
  map,
  children,
}: {
  map: maplibregl.Map | null;
  children: React.ReactNode;
}) {
  return <MapContext.Provider value={map}>{children}</MapContext.Provider>;
}
