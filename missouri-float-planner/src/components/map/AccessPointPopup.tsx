'use client';

// src/components/map/AccessPointPopup.tsx
// Popup component for access point information

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import type { AccessPoint } from '@/types/api';

interface AccessPointPopupProps {
  point: AccessPoint | null;
  coordinates: { lng: number; lat: number } | null;
}

export default function AccessPointPopup({
  point,
  coordinates,
}: AccessPointPopupProps) {
  const map = useMap();
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!point || !coordinates) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    // Create popup content
    const popupContent = document.createElement('div');
    popupContent.className = 'access-point-popup';
    popupContent.innerHTML = `
      <div class="p-2">
        <h3 class="font-semibold text-sm mb-1">${point.name}</h3>
        <p class="text-xs text-gray-600 mb-1">River Mile: ${point.riverMile.toFixed(1)}</p>
        <p class="text-xs text-gray-600 mb-1">Type: ${point.type.replace('_', ' ')}</p>
        ${point.description ? `<p class="text-xs text-gray-500 mt-1">${point.description}</p>` : ''}
        ${point.feeRequired ? `<p class="text-xs text-orange-600 mt-1">💰 Fee Required</p>` : ''}
      </div>
    `;

    // Create or update popup
    if (popupRef.current) {
      popupRef.current.setLngLat([coordinates.lng, coordinates.lat]);
      popupRef.current.setDOMContent(popupContent);
    } else {
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        anchor: 'bottom',
      })
        .setLngLat([coordinates.lng, coordinates.lat])
        .setDOMContent(popupContent)
        .addTo(map);
    }

    // Cleanup
    return () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, point, coordinates]);

  return null;
}
