'use client';

// src/components/map/HazardMarkers.tsx
// Safety-critical hazard markers on the map. Modeled on POIMarkers but with a
// visually distinct "warning" treatment (rounded-square + AlertTriangle icon)
// so hazards read differently from round access/POI markers.

import { useEffect, useRef } from 'react';
import React from 'react';
import maplibregl from 'maplibre-gl';
import { AlertTriangle } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { useMap } from './MapContainer';
import { HAZARD_TYPES, HAZARD_SEVERITY_COLORS } from '@/constants';
import type { Hazard } from '@/types/api';
import { escapeHtml } from '@/lib/escape-html';

interface HazardMarkersProps {
  hazards: Hazard[];
}

export default function HazardMarkers({ hazards }: HazardMarkersProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupsRef = useRef<maplibregl.Popup[]>([]);
  const rootsRef = useRef<Root[]>([]);
  const supportsHoverRef = useRef(false);

  useEffect(() => {
    supportsHoverRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(hover: hover)').matches;

    if (!map || !hazards.length) return;

    // Clear existing
    markersRef.current.forEach((marker) => marker.remove());
    popupsRef.current.forEach((popup) => popup.remove());
    rootsRef.current.forEach((root) => root.unmount());
    markersRef.current = [];
    popupsRef.current = [];
    rootsRef.current = [];

    const isTouchDevice = !supportsHoverRef.current;
    const shapeSize = isTouchDevice ? 28 : 24;

    hazards.forEach((hazard) => {
      const lng = hazard.coordinates?.lng;
      const lat = hazard.coordinates?.lat;
      if (typeof lng !== 'number' || typeof lat !== 'number') return;

      const color = HAZARD_SEVERITY_COLORS[hazard.severity] ?? '#f97316';

      // Outer transparent hit area (≥44px on touch) wrapping an inner colored
      // rounded-square so hazards are easy to tap yet read as a "warning" shape.
      const el = document.createElement('div');
      el.className = 'hazard-marker';
      const hitSize = isTouchDevice ? 44 : shapeSize;
      el.style.cssText = `
        width: ${hitSize}px;
        height: ${hitSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        background: transparent;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      `;

      const shape = document.createElement('div');
      shape.style.cssText = `
        background: ${color};
        width: ${shapeSize}px;
        height: ${shapeSize}px;
        border-radius: 6px;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        transition: box-shadow 0.2s ease;
      `;
      el.appendChild(shape);

      const iconSize = isTouchDevice ? 15 : 13;
      const root = createRoot(shape);
      root.render(
        React.createElement(AlertTriangle, { size: iconSize, color: '#1A1814', strokeWidth: 2.5 })
      );
      rootsRef.current.push(root);

      // Hover effect
      el.addEventListener('mouseenter', () => {
        shape.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
      });
      el.addEventListener('mouseleave', () => {
        shape.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      });

      const typeLabel = HAZARD_TYPES[hazard.type] || 'Hazard';
      const milePart =
        typeof hazard.riverMile === 'number' ? ` · Mile ${hazard.riverMile.toFixed(1)}` : '';
      const portageLine = hazard.portageRequired
        ? `<p style="margin: 6px 0 0 0; font-size: 11px; font-weight: 600; color: #fbbf24;">Portage required${
            hazard.portageSide ? ` (${hazard.portageSide === 'either' ? 'either side' : `${hazard.portageSide} side`})` : ''
          }</p>`
        : '';

      const popupContent = `
        <div style="padding: 10px; min-width: 160px; max-width: 220px; background: #161748; border: 2px solid rgba(255, 255, 255, 0.15); border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);">
          <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 13px; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(hazard.name)}
          </h3>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #c7b8a6;">
            ${typeLabel}${milePart}
          </p>
          ${hazard.description ? `<p style="margin: 0; font-size: 11px; color: #d1d5db; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${escapeHtml(hazard.description)}</p>` : ''}
          ${portageLine}
        </div>
      `;

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 16,
        maxWidth: '240px',
        className: 'hazard-popup',
      }).setHTML(popupContent);

      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', () => {
          popup.setLngLat([lng, lat]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
      } else {
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          popup.setLngLat([lng, lat]).addTo(map);
          map.once('click', () => popup.remove());
        });
      }

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([lng, lat])
        .addTo(map);

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      popupsRef.current.forEach((popup) => popup.remove());
      rootsRef.current.forEach((root) => root.unmount());
      markersRef.current = [];
      popupsRef.current = [];
      rootsRef.current = [];
    };
  }, [map, hazards]);

  return null;
}
