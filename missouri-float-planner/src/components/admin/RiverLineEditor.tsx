'use client';

// src/components/admin/RiverLineEditor.tsx
// River line editor with vertex editing

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from '@/components/map/MapContainer';

interface River {
  id: string;
  name: string;
  slug: string;
  lengthMiles: number;
  geometry: GeoJSON.LineString | null;
}

interface RiverLineEditorProps {
  rivers: River[];
  onUpdate: (id: string) => void;
}

export default function RiverLineEditor({
  rivers,
}: RiverLineEditorProps) {
  const map = useMap();
  const sourcesRef = useRef<Set<string>>(new Set());
  const layersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!map || !rivers.length) return;

    // Store refs in local variables for cleanup
    const currentSources = new Set(sourcesRef.current);
    const currentLayers = new Set(layersRef.current);

    // Clean up existing sources and layers
    currentSources.forEach((id) => {
      try {
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      } catch {}
    });
    currentLayers.forEach((id) => {
      try {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      } catch {}
    });
    sourcesRef.current.clear();
    layersRef.current.clear();

    // Add river lines
    rivers.forEach((river) => {
      if (!river.geometry || !river.geometry.coordinates) return;

      const sourceId = `river-edit-${river.id}`;
      const layerId = `river-edit-layer-${river.id}`;

      const coords = river.geometry.coordinates;

      // Add source
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          },
        });
        sourcesRef.current.add(sourceId);
      } else {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }

      // Add line layer
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#39a0ca',
            'line-width': 2,
            'line-opacity': 0.9,
          },
        });
        layersRef.current.add(layerId);
      }

      // Add vertex markers (simplified - just show the line for now)
      // Full vertex editing would require more complex implementation
    });

    return () => {
      // Use the stored refs for cleanup
      const sourcesToClean = new Set(sourcesRef.current);
      const layersToClean = new Set(layersRef.current);
      
      sourcesToClean.forEach((id) => {
        try {
          if (map.getSource(id)) map.removeSource(id);
        } catch {}
      });
      layersToClean.forEach((id) => {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
        } catch {}
      });
    };
  }, [map, rivers]);

  // Handle line click to select river for editing
  useEffect(() => {
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      // Find which river was clicked (simplified - would need proper hit testing)
      // For now, just log
      console.log('River line clicked at:', e.lngLat);
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map]);

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10 max-w-md">
      <p className="text-sm text-bluff-600 mb-2">
        Click on a river line to edit. Full vertex editing coming soon.
      </p>
      <p className="text-xs text-bluff-500">
        Currently showing {rivers.length} river{rivers.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
