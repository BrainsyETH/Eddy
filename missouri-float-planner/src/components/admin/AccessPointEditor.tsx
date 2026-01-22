'use client';

// src/components/admin/AccessPointEditor.tsx
// Access point editor with draggable markers

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from '@/components/map/MapContainer';
import { MapPin } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';

interface AccessPoint {
  id: string;
  name: string;
  riverName?: string;
  riverMile?: number;
  coordinates: {
    orig: { lng: number; lat: number };
    snap: { lng: number; lat: number } | null;
  };
}

interface AccessPointEditorProps {
  accessPoints: AccessPoint[];
  onUpdate: (id: string) => void;
}

export default function AccessPointEditor({
  accessPoints,
  onUpdate,
}: AccessPointEditorProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const rootsRef = useRef<Root[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, { lng: number; lat: number }>>(new Map());

  useEffect(() => {
    if (!map || !accessPoints.length) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    rootsRef.current.forEach((root) => root.unmount());
    markersRef.current = [];
    rootsRef.current = [];

    // Create draggable markers for each access point
    accessPoints.forEach((point) => {
      const coords = pendingUpdates.get(point.id) || point.coordinates.orig;
      const [lng, lat] = [coords.lng, coords.lat];

      // Create marker element
      const el = document.createElement('div');
      el.className = 'access-point-editor-marker';
      el.style.cssText = `
        background: linear-gradient(135deg, #39a0ca 0%, #2d7fa0 100%);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      `;

      // Render icon
      const root = createRoot(el);
      root.render(
        React.createElement(MapPin, { size: 16, color: 'white', strokeWidth: 2.5 })
      );
      rootsRef.current.push(root);

      // Create draggable marker
      const marker = new maplibregl.Marker({
        element: el,
        draggable: true,
        anchor: 'center',
      })
        .setLngLat([lng, lat])
        .addTo(map);

      // Handle drag events
      marker.on('dragstart', () => {
        el.style.boxShadow = '0 6px 20px rgba(57, 160, 202, 0.6)';
      });

      marker.on('drag', () => {
        // Update marker position visually
      });

      marker.on('dragend', async () => {
        const newLngLat = marker.getLngLat();
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

        // Store pending update
        setPendingUpdates((prev) => {
          const newMap = new Map(prev);
          newMap.set(point.id, { lng: newLngLat.lng, lat: newLngLat.lat });
          return newMap;
        });

        // Save to server
        try {
          const response = await fetch(`/api/admin/access-points/${point.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: newLngLat.lat,
              longitude: newLngLat.lng,
            }),
          });

          if (response.ok) {
            onUpdate(point.id);
            // Remove from pending updates
            setPendingUpdates((prev) => {
              const newMap = new Map(prev);
              newMap.delete(point.id);
              return newMap;
            });
          } else {
            console.error('Failed to update access point');
            // Revert marker position
            marker.setLngLat([lng, lat]);
          }
        } catch (error) {
          console.error('Error updating access point:', error);
          // Revert marker position
          marker.setLngLat([lng, lat]);
        }
      });

      // Show popup on click
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        new maplibregl.Popup({ offset: 20 })
          .setLngLat([lng, lat])
          .setHTML(`
            <div style="padding: 8px;">
              <strong>${point.name}</strong><br/>
              <span style="font-size: 12px; color: #666;">
                ${point.riverName || 'Unknown River'}<br/>
                ${point.riverMile ? `Mile ${point.riverMile.toFixed(1)}` : 'No river mile'}
              </span>
            </div>
          `)
          .addTo(map);
      });

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      rootsRef.current.forEach((root) => root.unmount());
      markersRef.current = [];
      rootsRef.current = [];
    };
  }, [map, accessPoints, pendingUpdates, onUpdate]);

  return null;
}
