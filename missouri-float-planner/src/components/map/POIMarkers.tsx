'use client';

// src/components/map/POIMarkers.tsx
// Distinct POI markers on the map (different color from access point markers)

import { useEffect, useRef } from 'react';
import React from 'react';
import maplibregl from 'maplibre-gl';
import { Star, type LucideIcon, Droplets, Mountain, Landmark, Eye, CircleDot } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { useMap } from './MapContainer';
import type { PointOfInterest } from '@/types/nps';

interface POIMarkersProps {
  pois: PointOfInterest[];
  activeMileRange?: { min: number; max: number } | null;
}

const POI_ICONS: Record<string, LucideIcon> = {
  spring: Droplets,
  cave: Mountain,
  historical_site: Landmark,
  scenic_viewpoint: Eye,
  waterfall: Droplets,
  geological: CircleDot,
  other: Star,
};

// POI marker color — teal/turquoise to distinguish from access points (brown) and gauges (varied)
const POI_COLOR = '#0d9488'; // teal-600
const POI_COLOR_DARK = '#0f766e'; // teal-700

export default function POIMarkers({ pois, activeMileRange }: POIMarkersProps) {
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

    if (!map || !pois.length) return;

    // Clear existing
    markersRef.current.forEach((marker) => marker.remove());
    popupsRef.current.forEach((popup) => popup.remove());
    rootsRef.current.forEach((root) => root.unmount());
    markersRef.current = [];
    popupsRef.current = [];
    rootsRef.current = [];

    const isTouchDevice = !supportsHoverRef.current;
    const baseSize = isTouchDevice ? 28 : 24;

    pois.forEach((poi) => {
      if (!poi.latitude || !poi.longitude) return;

      const IconComponent = POI_ICONS[poi.type] || POI_ICONS.other;

      // Determine if this POI is within the active route
      const isOnRoute = activeMileRange && poi.riverMile !== null
        ? poi.riverMile >= activeMileRange.min && poi.riverMile <= activeMileRange.max
        : false;
      const hasActiveRoute = !!activeMileRange;

      // Highlighted: larger, glowing; Dimmed: smaller, transparent
      const markerSize = hasActiveRoute && isOnRoute ? baseSize + 6 : baseSize;
      const opacity = hasActiveRoute && !isOnRoute ? '0.35' : '1';
      const border = hasActiveRoute && isOnRoute ? '3px solid #ffffff' : '2px solid #ffffff';
      const shadow = hasActiveRoute && isOnRoute
        ? `0 4px 16px rgba(0,0,0,0.35), 0 0 12px rgba(13, 148, 136, 0.5)`
        : '0 2px 8px rgba(0,0,0,0.25)';

      const el = document.createElement('div');
      el.className = 'poi-marker';
      el.style.cssText = `
        background: linear-gradient(135deg, ${POI_COLOR} 0%, ${POI_COLOR_DARK} 100%);
        width: ${markerSize}px;
        height: ${markerSize}px;
        border-radius: 50%;
        border: ${border};
        box-shadow: ${shadow};
        opacity: ${opacity};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: box-shadow 0.2s ease, opacity 0.3s ease;
        pointer-events: auto;
        box-sizing: border-box;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      `;

      const iconSize = isTouchDevice ? 14 : 12;
      const root = createRoot(el);
      root.render(
        React.createElement(IconComponent, { size: iconSize, color: 'white', strokeWidth: 2.5 })
      );
      rootsRef.current.push(root);

      // Hover effect
      el.addEventListener('mouseenter', () => {
        el.style.boxShadow = `0 4px 16px rgba(0,0,0,0.35), 0 0 16px rgba(13, 148, 136, 0.4)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
      });

      // Type label
      const typeLabels: Record<string, string> = {
        spring: 'Spring',
        cave: 'Cave',
        historical_site: 'Historic Site',
        scenic_viewpoint: 'Scenic Viewpoint',
        waterfall: 'Waterfall',
        geological: 'Geological Feature',
        other: 'Point of Interest',
      };

      const popupContent = `
        <div style="padding: 10px; min-width: 160px; max-width: 200px; background: #161748; border: 2px solid rgba(255, 255, 255, 0.15); border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);">
          <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 13px; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${poi.name}
          </h3>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #c7b8a6;">
            ${typeLabels[poi.type] || 'Point of Interest'}${poi.riverMile !== null ? ` · Mile ${poi.riverMile.toFixed(1)}` : ''}
          </p>
          ${poi.description ? `<p style="margin: 0; font-size: 11px; color: #d1d5db; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${poi.description}</p>` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 16,
        maxWidth: '220px',
        className: 'poi-popup',
      }).setHTML(popupContent);

      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', () => {
          popup.setLngLat([poi.longitude, poi.latitude]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
      } else {
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          popup.setLngLat([poi.longitude, poi.latitude]).addTo(map);
          map.once('click', () => popup.remove());
        });
      }

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([poi.longitude, poi.latitude])
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
  }, [map, pois, activeMileRange]);

  return null;
}
