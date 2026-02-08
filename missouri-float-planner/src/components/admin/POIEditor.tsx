'use client';

// src/components/admin/POIEditor.tsx
// POI editor with draggable markers on the geography editor map

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from '@/components/map/MapContainer';
import { Landmark } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { adminFetch } from '@/hooks/useAdminAuth';
import React from 'react';

export interface POI {
  id: string;
  riverId: string | null;
  riverName: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  bodyText: string | null;
  type: string;
  source: string;
  npsId: string | null;
  npsUrl: string | null;
  latitude: number;
  longitude: number;
  riverMile: number | null;
  images: { url: string; title: string; altText: string; caption: string; credit: string }[];
  amenities: string[];
  active: boolean;
  isOnWater: boolean;
}

interface POIEditorProps {
  pois: POI[];
  onRefresh?: () => void;
  addMode?: boolean;
  onMapClick?: (coords: { lng: number; lat: number }) => void;
  onSelectPOI?: (poi: POI | null) => void;
  selectedPOIId?: string;
}

// Color by POI type
const POI_TYPE_COLORS: Record<string, string> = {
  spring: '#06b6d4',       // cyan
  cave: '#8b5cf6',         // purple
  historical_site: '#d97706', // amber
  scenic_viewpoint: '#16a34a', // green
  waterfall: '#2563eb',    // blue
  geological: '#dc2626',   // red
  other: '#6b7280',        // gray
};

export default function POIEditor({
  pois,
  onRefresh,
  addMode = false,
  onMapClick,
  onSelectPOI,
  selectedPOIId,
}: POIEditorProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const rootsRef = useRef<Root[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Handle map click for adding new POIs
  useEffect(() => {
    if (!map || !addMode || !onMapClick) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.target !== map.getCanvas()) return;
      onMapClick({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    };

    map.on('click', handleClick);
    map.getCanvas().style.cursor = 'crosshair';

    return () => {
      map.off('click', handleClick);
      map.getCanvas().style.cursor = '';
    };
  }, [map, addMode, onMapClick]);

  useEffect(() => {
    if (!map || !pois.length) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    rootsRef.current.forEach((root) => root.unmount());
    markersRef.current = [];
    rootsRef.current = [];

    pois.forEach((poi) => {
      if (!poi.latitude || !poi.longitude) return;

      const isSelected = selectedPOIId === poi.id;
      const isSaving = savingIds.has(poi.id);
      const color = POI_TYPE_COLORS[poi.type] || POI_TYPE_COLORS.other;

      const el = document.createElement('div');
      el.className = 'poi-editor-marker';

      const markerSize = isSelected ? '38px' : '30px';
      const markerBorder = isSelected ? `4px solid ${color}` : `3px solid ${poi.active ? '#ffffff' : '#fef3c7'}`;
      const markerShadow = isSelected
        ? `0 0 0 3px ${color}40, 0 6px 20px ${color}80`
        : '0 4px 12px rgba(0,0,0,0.3)';
      const opacity = poi.active ? '1' : '0.5';

      el.style.cssText = `
        background: ${isSaving ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : color};
        width: ${markerSize};
        height: ${markerSize};
        border-radius: 8px;
        border: ${markerBorder};
        box-shadow: ${markerShadow};
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: ${isSelected ? '2000' : '100'};
        transition: all 0.2s ease;
        opacity: ${opacity};
      `;

      const root = createRoot(el);
      root.render(
        React.createElement(Landmark, {
          size: isSelected ? 18 : 14,
          color: 'white',
          strokeWidth: 2.5,
        })
      );
      rootsRef.current.push(root);

      const marker = new maplibregl.Marker({
        element: el,
        draggable: true,
        anchor: 'center',
      })
        .setLngLat([poi.longitude, poi.latitude])
        .addTo(map);

      // Handle drag to reposition
      marker.on('dragend', async () => {
        const newLngLat = marker.getLngLat();

        setSavingIds((prev) => new Set(prev).add(poi.id));
        try {
          const response = await adminFetch(`/api/admin/pois/${poi.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: newLngLat.lat,
              longitude: newLngLat.lng,
            }),
          });

          if (response.ok) {
            onRefresh?.();
          } else {
            // Revert on failure
            marker.setLngLat([poi.longitude, poi.latitude]);
          }
        } catch {
          marker.setLngLat([poi.longitude, poi.latitude]);
        } finally {
          setSavingIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(poi.id);
            return newSet;
          });
        }
      });

      // Click to select
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectPOI?.(poi);
      });

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      rootsRef.current.forEach((root) => root.unmount());
      markersRef.current = [];
      rootsRef.current = [];
    };
  }, [map, pois, savingIds, onRefresh, onSelectPOI, selectedPOIId]);

  return null;
}
