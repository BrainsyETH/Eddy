'use client';

// src/components/admin/RiverLineEditor.tsx
// River line editor with selection and visual feedback

import { useEffect, useRef, useState } from 'react';
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
  onRefresh?: () => void;
}

export default function RiverLineEditor({
  rivers,
  onUpdate,
  onRefresh,
}: RiverLineEditorProps) {
  const map = useMap();
  const sourcesRef = useRef<Set<string>>(new Set());
  const layersRef = useRef<Set<string>>(new Set());
  const [selectedRiverId, setSelectedRiverId] = useState<string | null>(null);
  const [hoveredRiverId, setHoveredRiverId] = useState<string | null>(null);

  useEffect(() => {
    if (!map || !rivers.length) return;

    // Track sources and layers added in this effect run for cleanup
    const sourcesAdded: string[] = [];
    const layersAdded: string[] = [];

    // Clean up existing sources and layers from previous runs
    const previousSources = new Set(sourcesRef.current);
    const previousLayers = new Set(layersRef.current);
    
    previousSources.forEach((id) => {
      try {
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      } catch {}
    });
    previousLayers.forEach((id) => {
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
            properties: { id: river.id, name: river.name },
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
          },
        });
        sourcesRef.current.add(sourceId);
        sourcesAdded.push(sourceId);
      } else {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: { id: river.id, name: river.name },
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }

      // Determine line style based on selection/hover state
      const isSelected = selectedRiverId === river.id;
      const isHovered = hoveredRiverId === river.id;
      
      const lineColor = isSelected 
        ? '#f95d9b' // sky-warm for selected
        : isHovered 
          ? '#39a0ca' // river-water for hovered
          : '#39a0ca'; // default river-water
      
      const lineWidth = isSelected ? 4 : isHovered ? 3 : 2;
      const lineOpacity = isSelected ? 1 : isHovered ? 0.9 : 0.7;

      // Add or update line layer
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': lineColor,
            'line-width': lineWidth,
            'line-opacity': lineOpacity,
          },
        });
        layersRef.current.add(layerId);
        layersAdded.push(layerId);
      } else {
        // Update existing layer style
        map.setPaintProperty(layerId, 'line-color', lineColor);
        map.setPaintProperty(layerId, 'line-width', lineWidth);
        map.setPaintProperty(layerId, 'line-opacity', lineOpacity);
      }
    });

    return () => {
      // Clean up sources and layers added in this effect run
      sourcesAdded.forEach((id) => {
        try {
          if (map.getSource(id)) map.removeSource(id);
        } catch {}
      });
      layersAdded.forEach((id) => {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
        } catch {}
      });
    };
  }, [map, rivers, selectedRiverId, hoveredRiverId]);

  // Handle line click and hover to select river
  useEffect(() => {
    if (!map || !rivers.length) return;

    // Get all layer IDs for querying
    const layerIds = rivers
      .filter((r) => r.geometry && r.geometry.coordinates)
      .map((r) => `river-edit-layer-${r.id}`);

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      // Find which river was clicked using feature query
      const features = map.queryRenderedFeatures(e.point, {
        layers: layerIds,
      });

      if (features.length > 0) {
        const feature = features[0];
        const riverId = feature.properties?.id;
        if (riverId) {
          setSelectedRiverId(riverId);
          onUpdate(riverId);
        }
      }
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: layerIds,
      });

      if (features.length > 0) {
        const riverId = features[0].properties?.id;
        if (riverId && hoveredRiverId !== riverId) {
          setHoveredRiverId(riverId);
          map.getCanvas().style.cursor = 'pointer';
        }
      } else if (hoveredRiverId) {
        setHoveredRiverId(null);
        map.getCanvas().style.cursor = '';
      }
    };

    const handleMouseLeave = () => {
      setHoveredRiverId(null);
      map.getCanvas().style.cursor = '';
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMouseMove);
    map.on('mouseleave', handleMouseLeave);

    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.off('mouseleave', handleMouseLeave);
      map.getCanvas().style.cursor = '';
    };
  }, [map, rivers, hoveredRiverId, onUpdate]);

  const selectedRiver = selectedRiverId 
    ? rivers.find((r) => r.id === selectedRiverId)
    : null;

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-10 max-w-md">
      <div className="space-y-2">
        <p className="text-sm font-medium text-bluff-700 mb-2">
          River Line Editor
        </p>
        <p className="text-xs text-bluff-600">
          Click on a river line to select it. Full vertex editing coming soon.
        </p>
        {selectedRiver && (
          <div className="mt-3 p-3 bg-river-50 border border-river-200 rounded-lg">
            <p className="text-sm font-semibold text-ozark-800">
              {selectedRiver.name}
            </p>
            <p className="text-xs text-bluff-600 mt-1">
              {selectedRiver.lengthMiles.toFixed(1)} miles
            </p>
            <button
              onClick={() => {
                setSelectedRiverId(null);
                onRefresh?.();
              }}
              className="mt-2 px-3 py-1.5 bg-river-500 text-white rounded text-xs font-medium hover:bg-river-600 transition-colors"
            >
              Deselect
            </button>
          </div>
        )}
        <p className="text-xs text-bluff-500 mt-2">
          Showing {rivers.length} river{rivers.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
