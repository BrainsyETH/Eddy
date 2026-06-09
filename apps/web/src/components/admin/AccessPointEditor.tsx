'use client';

// src/components/admin/AccessPointEditor.tsx
// Access point editor with draggable markers showing original vs new positions

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from '@/components/map/MapContainer';
import { MapPin } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { adminFetch } from '@/hooks/useAdminAuth';
import React from 'react';

interface AccessPoint {
  id: string;
  name: string;
  slug: string;
  riverId: string;
  riverName?: string;
  riverMile: number | null;
  type: string;
  isPublic: boolean;
  ownership: string | null;
  description: string | null;
  feeRequired?: boolean;
  approved: boolean;
  hasInvalidCoords?: boolean;
  hasMissingCoords?: boolean;
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
  onApprovalChange?: (id: string, approved: boolean) => Promise<void>;
  onSelectAccessPoint?: (point: AccessPoint | null) => void;
  selectedAccessPointId?: string;
}

export default function AccessPointEditor({
  accessPoints,
  onUpdate,
  onRefresh,
  addMode = false,
  onMapClick,
  onApprovalChange,
  onSelectAccessPoint,
  selectedAccessPointId,
}: AccessPointEditorProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const originalMarkersRef = useRef<maplibregl.Marker[]>([]);
  const rootsRef = useRef<Root[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupCloseHandlerRef = useRef<(() => void) | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, { lng: number; lat: number }>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const lineSourceIdsRef = useRef<string[]>([]);

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
    // Remove layers and sources - must remove layer first, then source
    lineSourceIdsRef.current.forEach((sourceId) => {
      try {
        const layerId = `ap-line-layer-${sourceId.replace('ap-line-', '')}`;
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (e) {
        console.warn('Error cleaning up map layer/source:', e);
      }
    });
    markersRef.current = [];
    originalMarkersRef.current = [];
    rootsRef.current = [];
    lineSourceIdsRef.current = [];

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
          lineSourceIdsRef.current.push(lineSourceId);

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
      const isApproving = approvingIds.has(point.id);
      const isApproved = point.approved;
      const isSelected = selectedAccessPointId === point.id;

      // Color coding: selected = purple, approved = blue, unapproved = orange/amber, error = red
      const getMarkerColor = () => {
        if (hasError) return 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
        if (isSaving || isApproving) return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        if (isSelected) return 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'; // Purple for selected
        if (!isApproved) return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'; // Orange for unapproved
        return 'linear-gradient(135deg, #39a0ca 0%, #2d7fa0 100%)'; // Blue for approved
      };

      const markerSize = isSelected ? '40px' : hasMoved ? '36px' : '32px';
      const markerBorder = isSelected ? '4px solid #8b5cf6' : `3px solid ${isApproved ? '#ffffff' : '#fef3c7'}`;
      const markerShadow = isSelected
        ? '0 0 0 3px rgba(139, 92, 246, 0.4), 0 6px 20px rgba(139, 92, 246, 0.5)'
        : hasMoved
          ? '0 6px 20px rgba(57, 160, 202, 0.6)'
          : '0 4px 12px rgba(0,0,0,0.3)';

      el.style.cssText = `
        background: ${getMarkerColor()};
        width: ${markerSize};
        height: ${markerSize};
        border-radius: 50%;
        border: ${markerBorder};
        box-shadow: ${markerShadow};
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: ${isSelected ? '2000' : hasMoved ? '1000' : '100'};
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
          const response = await adminFetch(`/api/admin/access-points/${point.id}`, {
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

      // Click handler - call selection callback to open detail panel
      el.addEventListener('click', (e) => {
        e.stopPropagation();

        // If we have a selection callback, use the detail panel instead of popup
        if (onSelectAccessPoint) {
          onSelectAccessPoint(point);
          return;
        }

        // Fallback: Show popup on click if no selection callback
        // Remove existing popup and clean up any pending close handler
        if (popupRef.current) {
          popupRef.current.remove();
        }
        if (popupCloseHandlerRef.current) {
          map.off('click', popupCloseHandlerRef.current);
          popupCloseHandlerRef.current = null;
        }

        // Create popup content with current data
        const approvalStatusColor = isApproved ? '#22c55e' : '#f97316';
        const approvalStatusText = isApproved ? 'Visible in app' : 'Hidden (not approved)';
        const approvalButtonText = isApproved ? 'Hide from App' : 'Approve for App';
        const approvalButtonColor = isApproved ? '#f97316' : '#22c55e';

        const popupContent = `
          <div style="padding: 12px; min-width: 220px; background: white; border-radius: 8px;">
            <strong style="font-size: 14px; color: #161748;">${point.name}</strong>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              ${point.riverName || 'Unknown River'}
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 2px;">
              ${point.riverMile !== null ? `Mile ${point.riverMile.toFixed(1)}` : 'No river mile data'}
              ${point.type ? ` • ${point.type.replace('_', ' ')}` : ''}
            </div>
            <div style="margin-top: 8px; padding: 6px 8px; background: ${isApproved ? '#f0fdf4' : '#fff7ed'}; border-radius: 4px; display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${approvalStatusColor};"></span>
              <span style="font-size: 11px; color: ${approvalStatusColor}; font-weight: 500;">${approvalStatusText}</span>
            </div>
            ${hasMoved ? `
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #39a0ca;">
                <strong>Moved:</strong> ${(Math.sqrt(
                  Math.pow(lng - origLng, 2) + Math.pow(lat - origLat, 2)
                ) * 111000).toFixed(0)}m from original
              </div>
            ` : ''}
            ${isSaving ? '<div style="margin-top: 4px; color: #f59e0b; font-size: 11px;">Saving location...</div>' : ''}
            ${isApproving ? '<div style="margin-top: 4px; color: #f59e0b; font-size: 11px;">Updating approval...</div>' : ''}
            ${hasError ? '<div style="margin-top: 4px; color: #dc2626; font-size: 11px;">Error saving</div>' : ''}
            <div style="margin-top: 10px; display: flex; gap: 8px;">
              <button
                id="approve-btn-${point.id}"
                style="flex: 1; padding: 6px 10px; background: ${approvalButtonColor}; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: pointer;"
              >
                ${approvalButtonText}
              </button>
            </div>
            <div style="margin-top: 8px; font-size: 10px; color: #999;">
              ID: ${point.id.slice(0, 8)}...
            </div>
          </div>
        `;

        popupRef.current = new maplibregl.Popup({
          offset: 20,
          className: 'admin-access-point-popup',
          closeButton: true,
          closeOnClick: false,
        })
          .setLngLat([lng, lat])
          .setHTML(popupContent)
          .addTo(map);

        // Add approval button click handler
        setTimeout(() => {
          const approveBtn = document.getElementById(`approve-btn-${point.id}`);
          if (approveBtn && onApprovalChange) {
            approveBtn.addEventListener('click', async (btnEvent) => {
              btnEvent.stopPropagation();
              setApprovingIds((prev) => new Set(prev).add(point.id));
              try {
                await onApprovalChange(point.id, !isApproved);
                // Close popup and refresh
                if (popupRef.current) {
                  popupRef.current.remove();
                  popupRef.current = null;
                }
                onRefresh?.();
              } catch (error) {
                console.error('Error changing approval:', error);
              } finally {
                setApprovingIds((prev) => {
                  const newSet = new Set(prev);
                  newSet.delete(point.id);
                  return newSet;
                });
              }
            });
          }
        }, 0);

        // Create close handler and track it for cleanup
        const closeHandler = () => {
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
          popupCloseHandlerRef.current = null;
        };
        popupCloseHandlerRef.current = closeHandler;

        // Register close on map click (after a brief delay to avoid immediate close)
        setTimeout(() => {
          if (popupCloseHandlerRef.current === closeHandler) {
            map.once('click', closeHandler);
          }
        }, 100);
      });

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      originalMarkersRef.current.forEach((marker) => marker.remove());
      rootsRef.current.forEach((root) => root.unmount());
      lineSourceIdsRef.current.forEach((sourceId) => {
        try {
          const layerId = `ap-line-layer-${sourceId.replace('ap-line-', '')}`;
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        } catch {}
      });
      // Clean up popup and its close handler
      if (popupCloseHandlerRef.current) {
        map.off('click', popupCloseHandlerRef.current);
        popupCloseHandlerRef.current = null;
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      markersRef.current = [];
      originalMarkersRef.current = [];
      rootsRef.current = [];
      lineSourceIdsRef.current = [];
    };
  }, [map, accessPoints, pendingUpdates, savingIds, errorIds, onUpdate, onRefresh, onSelectAccessPoint, selectedAccessPointId]);

  return null;
}
