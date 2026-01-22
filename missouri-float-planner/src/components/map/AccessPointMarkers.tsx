'use client';

// src/components/map/AccessPointMarkers.tsx
// Displays access point markers on the map

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import type { AccessPoint } from '@/types/api';

interface AccessPointMarkersProps {
  accessPoints: AccessPoint[];
  onMarkerClick?: (point: AccessPoint) => void;
  selectedPutIn?: string | null;
  selectedTakeOut?: string | null;
}

export default function AccessPointMarkers({
  accessPoints,
  onMarkerClick,
  selectedPutIn,
  selectedTakeOut,
}: AccessPointMarkersProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Create markers for each access point
    accessPoints.forEach((point) => {
      const isPutIn = point.id === selectedPutIn;
      const isTakeOut = point.id === selectedTakeOut;

      // Determine marker color and icon
      let markerColor = point.isPublic ? '#10b981' : '#ef4444'; // Green for public, red for private
      let markerIcon = '📍';

      if (isPutIn) {
        markerColor = '#3b82f6'; // Blue for put-in
        markerIcon = '🚩';
      } else if (isTakeOut) {
        markerColor = '#8b5cf6'; // Purple for take-out
        markerIcon = '🏁';
      }

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'access-point-marker';
      el.style.cssText = `
        background-color: ${markerColor};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
      `;
      el.textContent = markerIcon;

      // Create marker
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([point.coordinates.lng, point.coordinates.lat])
        .addTo(map);

      // Add click handler
      el.addEventListener('click', () => {
        onMarkerClick?.(point);
      });

      markersRef.current.push(marker);
    });

    // Cleanup
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [map, accessPoints, onMarkerClick, selectedPutIn, selectedTakeOut]);

  return null;
}
