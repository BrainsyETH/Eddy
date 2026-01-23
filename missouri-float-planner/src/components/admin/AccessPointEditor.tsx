'use client';

// src/components/admin/AccessPointEditor.tsx
// Access point editor with draggable markers showing original vs new positions

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
  riverMile: number | null;
  coordinates: {
    orig: { lng: number; lat: number };
    snap: { lng: number; lat: number } | null;
  };
}

interface AccessPointEditorProps {
  accessPoints: AccessPoint[];
  onUpdate: (id: string) => void;
  onRefresh?: () => void;
  addMode?: boolean;
  onMapClick?: (coords: { lng: number; lat: number }) => void;
}

export default function AccessPointEditor({
  accessPoints,
  onUpdate,
  onRefresh,
  addMode = false,
  onMapClick,
}: AccessPointEditorProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const originalMarkersRef = useRef<maplibregl.Marker[]>([]);
  const linesRef = useRef<maplibregl.GeoJSONSource[]>([]);
  const rootsRef = useRef<Root[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, { lng: number; lat: number }>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());

  // Handle map click for adding new points
  useEffect(() => {
    if (!map || !addMode || !onMapClick) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      // Only trigger if clicking directly on the map canvas, not on markers
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

  // ESC key to cancel add mode
  useEffect(() => {
    if (!addMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Parent component handles the actual state change via onMapClick(null) or similar
        // For now, just reset cursor as visual feedback
        if (map) map.getCanvas().style.cursor = '';
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addMode, map]);

  useEffect(() => {
    if (!map || !accessPoints.length) return;

    // Clear existing markers and lines
    markersRef.current.forEach((marker) => marker.remove());
    originalMarkersRef.current.forEach((marker) => marker.remove());
    rootsRef.current.forEach((root) => root.unmount());
    linesRef.current.forEach((source) => {
      try {
        const sourceId = source.id;
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch {}
    });
    markersRef.current = [];
    originalMarkersRef.current = [];
    rootsRef.current = [];
    linesRef.current = [];

    // Create markers for each access point
    accessPoints.forEach((point) => {
      const newCoords = pendingUpdates.get(point.id);
      const hasMoved = newCoords !== undefined;
      const currentCoords = newCoords || point.coordinates.orig;
      const [lng, lat] = [currentCoords.lng, currentCoords.lat];
      const [origLng, origLat] = [point.coordinates.orig.lng, point.coordinates.orig.lat];

      // Show original position as a ghost marker if moved
      if (hasMoved) {
        const origEl = document.createElement('div');
        origEl.className = 'access-point-original-marker';
        origEl.style.cssText = `
          background: rgba(199, 184, 166, 0.4);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px dashed rgba(199, 184, 166, 0.8);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 5;
        `;

        const origIcon = document.createElement('div');
        origIcon.innerHTML = '●';
        origIcon.style.cssText = 'color: rgba(199, 184, 166, 0.6); font-size: 8px;';
        origEl.appendChild(origIcon);

        const origMarker = new maplibregl.Marker({
          element: origEl,
          anchor: 'center',
          rotationAlignment: 'map',
          pitchAlignment: 'map',
        })
          .setLngLat([origLng, origLat])
          .addTo(map);
        originalMarkersRef.current.push(origMarker);

        // Add line connecting original to new position
        const lineSourceId = `ap-line-${point.id}`;
        if (!map.getSource(lineSourceId)) {
          map.addSource(lineSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [[origLng, origLat], [lng, lat]],
              },
            },
          });
          const source = map.getSource(lineSourceId) as maplibregl.GeoJSONSource;
          linesRef.current.push(source);

          map.addLayer({
            id: `ap-line-layer-${point.id}`,
            type: 'line',
            source: lineSourceId,
            paint: {
              'line-color': '#c7b8a6',
              'line-width': 2,
              'line-opacity': 0.5,
              'line-dasharray': [2, 2],
            },
          });
        } else {
          (map.getSource(lineSourceId) as maplibregl.GeoJSONSource).setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [[origLng, origLat], [lng, lat]],
            },
          });
        }
      }

      // Create draggable marker for current/new position
      const el = document.createElement('div');
      el.className = 'access-point-editor-marker';
      const isSaving = savingIds.has(point.id);
      const hasError = errorIds.has(point.id);
      
      el.style.cssText = `
        background: ${hasError 
          ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' 
          : isSaving 
            ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
            : 'linear-gradient(135deg, #39a0ca 0%, #2d7fa0 100%)'};
        width: ${hasMoved ? '36px' : '32px'};
        height: ${hasMoved ? '36px' : '32px'};
        border-radius: 50%;
        border: 3px solid #ffffff;
        box-shadow: ${hasMoved 
          ? '0 6px 20px rgba(57, 160, 202, 0.6)' 
          : '0 4px 12px rgba(0,0,0,0.3)'};
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: ${hasMoved ? '1000' : '100'};
        transition: all 0.2s ease;
      `;

      // Render icon
      const root = createRoot(el);
      root.render(
        React.createElement(MapPin, { 
          size: hasMoved ? 18 : 16, 
          color: 'white', 
          strokeWidth: 2.5 
        })
      );
      rootsRef.current.push(root);

      // Create draggable marker
      const marker = new maplibregl.Marker({
        element: el,
        draggable: true,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([lng, lat])
        .addTo(map);

      // Handle drag events
      marker.on('dragstart', () => {
        el.style.boxShadow = '0 8px 24px rgba(57, 160, 202, 0.8)';
        el.style.transform = 'scale(1.1)';
      });

      marker.on('drag', () => {
        // Update line if it exists
        if (hasMoved) {
          const newLngLat = marker.getLngLat();
          const lineSourceId = `ap-line-${point.id}`;
          const source = map.getSource(lineSourceId) as maplibregl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [[origLng, origLat], [newLngLat.lng, newLngLat.lat]],
              },
            });
          }
        }
      });

      marker.on('dragend', async () => {
        const newLngLat = marker.getLngLat();
        el.style.boxShadow = hasMoved 
          ? '0 6px 20px rgba(57, 160, 202, 0.6)' 
          : '0 4px 12px rgba(0,0,0,0.3)';
        el.style.transform = 'scale(1)';

        // Check if position actually changed
        const distance = Math.sqrt(
          Math.pow(newLngLat.lng - origLng, 2) + Math.pow(newLngLat.lat - origLat, 2)
        );
        const threshold = 0.0001; // ~11 meters

        if (distance < threshold) {
          // Position hasn't changed meaningfully, revert
          marker.setLngLat([origLng, origLat]);
          setPendingUpdates((prev) => {
            const newMap = new Map(prev);
            newMap.delete(point.id);
            return newMap;
          });
          return;
        }

        // Store pending update
        setPendingUpdates((prev) => {
          const newMap = new Map(prev);
          newMap.set(point.id, { lng: newLngLat.lng, lat: newLngLat.lat });
          return newMap;
        });

        // Save to server
        setSavingIds((prev) => new Set(prev).add(point.id));
        setErrorIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(point.id);
          return newSet;
        });

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
            const data = await response.json();
            // Update with server response (includes snapped position)
            if (data.accessPoint) {
              setPendingUpdates((prev) => {
                const newMap = new Map(prev);
                newMap.delete(point.id);
                return newMap;
              });
            }
            onUpdate(point.id);
            onRefresh?.();
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to update access point:', errorData);
            setErrorIds((prev) => new Set(prev).add(point.id));
            // Revert marker position after a delay
            setTimeout(() => {
              marker.setLngLat([origLng, origLat]);
              setPendingUpdates((prev) => {
                const newMap = new Map(prev);
                newMap.delete(point.id);
                return newMap;
              });
              setErrorIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(point.id);
                return newSet;
              });
            }, 2000);
          }
        } catch (error) {
          console.error('Error updating access point:', error);
          setErrorIds((prev) => new Set(prev).add(point.id));
          setTimeout(() => {
            marker.setLngLat([origLng, origLat]);
            setPendingUpdates((prev) => {
              const newMap = new Map(prev);
              newMap.delete(point.id);
              return newMap;
            });
            setErrorIds((prev) => {
              const newSet = new Set(prev);
              newSet.delete(point.id);
              return newSet;
            });
          }, 2000);
        } finally {
          setSavingIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(point.id);
            return newSet;
          });
        }
      });

      // Show popup on click
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = new maplibregl.Popup({ 
          offset: 20,
          className: 'admin-access-point-popup',
        })
          .setLngLat([lng, lat])
          .setHTML(`
            <div style="padding: 12px; min-width: 200px;">
              <strong style="font-size: 14px; color: #161748;">${point.name}</strong><br/>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                ${point.riverName || 'Unknown River'}<br/>
                ${point.riverMile ? `Mile ${point.riverMile.toFixed(1)}` : 'No river mile'}
              </div>
              ${hasMoved ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #39a0ca;">
                  <strong>Moved:</strong> ${(Math.sqrt(
                    Math.pow(lng - origLng, 2) + Math.pow(lat - origLat, 2)
                  ) * 111000).toFixed(0)}m from original
                </div>
              ` : ''}
              ${isSaving ? '<div style="margin-top: 4px; color: #f59e0b; font-size: 11px;">Saving...</div>' : ''}
              ${hasError ? '<div style="margin-top: 4px; color: #dc2626; font-size: 11px;">Error saving</div>' : ''}
            </div>
          `)
          .addTo(map);
        
        // Remove popup when clicking elsewhere
        setTimeout(() => {
          map.once('click', () => popup.remove());
        }, 100);
      });

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      originalMarkersRef.current.forEach((marker) => marker.remove());
      rootsRef.current.forEach((root) => root.unmount());
      linesRef.current.forEach((source) => {
        try {
          const sourceId = source.id;
          if (map.getSource(sourceId)) {
            const layerId = `ap-line-layer-${sourceId.replace('ap-line-', '')}`;
            if (map.getLayer(layerId)) {
              map.removeLayer(layerId);
            }
            map.removeSource(sourceId);
          }
        } catch {}
      });
      markersRef.current = [];
      originalMarkersRef.current = [];
      rootsRef.current = [];
      linesRef.current = [];
    };
  }, [map, accessPoints, pendingUpdates, savingIds, errorIds, onUpdate, onRefresh]);

  return null;
}
