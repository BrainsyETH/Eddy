'use client';

// src/components/map/AccessPointMarkers.tsx
// Themed access point markers on the map

import { useEffect, useRef } from 'react';
import React from 'react';
import maplibregl from 'maplibre-gl';
import { MapPin, Flag, FlagOff, type LucideIcon } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { useMap } from './MapContainer';
import type { AccessPoint } from '@/types/api';

interface AccessPointMarkersProps {
  accessPoints: AccessPoint[];
  onMarkerClick?: (point: AccessPoint) => void;
  onReportIssue?: (point: AccessPoint) => void;
  selectedPutIn?: string | null;
  selectedTakeOut?: string | null;
}

export default function AccessPointMarkers({
  accessPoints,
  onMarkerClick,
  onReportIssue,
  selectedPutIn,
  selectedTakeOut,
}: AccessPointMarkersProps) {
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

    // Don't proceed if map isn't ready or no access points
    // Important: Check BEFORE clearing existing markers to avoid flicker during loading
    if (!map || !accessPoints.length) return;

    // Clear existing markers, popups, and React roots
    markersRef.current.forEach((marker) => marker.remove());
    popupsRef.current.forEach((popup) => popup.remove());
    rootsRef.current.forEach((root) => root.unmount());
    markersRef.current = [];
    popupsRef.current = [];
    rootsRef.current = [];

    const selectedPutInPoint = selectedPutIn
      ? accessPoints.find((point) => point.id === selectedPutIn)
      : null;
    const putInMile = selectedPutInPoint?.riverMile ?? null;

    // Create markers for each access point
    accessPoints.forEach((point) => {
      const isPutIn = point.id === selectedPutIn;
      const isTakeOut = point.id === selectedTakeOut;
      const isUpstreamChoice =
        putInMile !== null && !isPutIn && point.riverMile < putInMile;

      // Determine marker style based on state - using new color palette
      let bgColor = '#c7b8a6'; // river-gravel for neutral markers
      let borderColor = '#ffffff';
      let iconType: 'putin' | 'takeout' | 'neutral' = 'neutral';
      let scale = 1;
      let zIndex = 1;

      if (isPutIn) {
        bgColor = '#478559'; // river-forest (green) for put-in
        borderColor = '#ffffff';
        iconType = 'putin';
        scale = 1.2;
        zIndex = 10;
      } else if (isTakeOut) {
        bgColor = '#f95d9b'; // sky-warm (pink) for take-out
        borderColor = '#ffffff';
        iconType = 'takeout';
        scale = 1.2;
        zIndex = 10;
      } else {
        // Neutral marker - slightly different color for public/private
        bgColor = point.isPublic ? '#c7b8a6' : '#a8a29e'; // river-gravel variants
        iconType = 'neutral';
      }

      // Create custom marker element with React icon
      // Note: Avoid position: relative and will-change: transform as they interfere with MapLibre's positioning
      // Use larger base size on touch devices for better tap targets
      const isTouchDevice = !supportsHoverRef.current;
      const baseSize = isTouchDevice ? 36 : 32;
      const el = document.createElement('div');
      el.className = 'access-point-marker';
      el.style.cssText = `
        background: linear-gradient(135deg, ${bgColor} 0%, ${adjustColor(bgColor, -20)} 100%);
        width: ${baseSize * scale}px;
        height: ${baseSize * scale}px;
        border-radius: 50%;
        border: 3px solid ${borderColor};
        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 2px rgba(255,255,255,0.1);
        cursor: ${onMarkerClick ? 'pointer' : 'default'};
        display: flex;
        align-items: center;
        justify-content: center;
        transition: box-shadow 0.2s ease, border-width 0.2s ease;
        z-index: ${zIndex};
        pointer-events: auto;
        box-sizing: border-box;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      `;
      
      // Render lucide icon using React
      const iconSize = (isTouchDevice ? 18 : 16) * scale;
      let IconComponent: LucideIcon;
      
      if (iconType === 'putin') {
        IconComponent = Flag;
      } else if (iconType === 'takeout') {
        IconComponent = FlagOff;
      } else {
        IconComponent = MapPin;
      }
      
      // Create React root and render icon
      const root = createRoot(el);
      root.render(
        React.createElement(IconComponent, { size: iconSize, color: 'white', strokeWidth: 2.5 })
      );
      rootsRef.current.push(root);

      // Hover effect - no transform to prevent marker movement
      el.addEventListener('mouseenter', () => {
        const glowColor = isPutIn 
          ? 'rgba(71, 133, 89, 0.4)' // river-forest
          : isTakeOut 
          ? 'rgba(249, 93, 155, 0.4)' // sky-warm
          : 'rgba(57, 160, 202, 0.3)'; // river-water
        el.style.boxShadow = `0 6px 20px rgba(0,0,0,0.4), 0 0 20px ${glowColor}`;
        el.style.borderWidth = '4px';
        el.style.opacity = '1';
      });
      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3), 0 0 0 2px rgba(255,255,255,0.1)';
        el.style.borderWidth = '3px';
        el.style.opacity = '1';
      });

      // Create popup with flat, nature-inspired styling
      let selectionPrompt = '';
      if (onMarkerClick) {
        if (isPutIn) {
          selectionPrompt = `<p style="margin: 8px 0 0 0; font-size: 11px; color: #39a0ca; font-weight: 600;">Click to deselect put-in</p>`;
        } else if (isTakeOut) {
          selectionPrompt = `<p style="margin: 8px 0 0 0; font-size: 11px; color: #39a0ca; font-weight: 600;">Click to deselect take-out</p>`;
        } else if (!selectedPutIn) {
          selectionPrompt = `<p style="margin: 8px 0 0 0; font-size: 11px; color: #39a0ca; font-weight: 600;">Click to select as put-in</p>`;
        } else {
          selectionPrompt = `<p style="margin: 8px 0 0 0; font-size: 11px; color: #39a0ca; font-weight: 600;">Click to select as take-out</p>`;
        }
      }

      const popupContent = `
        <div style="padding: 12px; min-width: 180px; background: #161748; border: 2px solid rgba(255, 255, 255, 0.15); border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);">
          <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 14px; color: #ffffff;">
            ${point.name}
          </h3>
          <p style="margin: 0 0 8px 0; font-size: 12px; color: #c7b8a6;">
            Mile ${point.riverMile.toFixed(1)} • ${point.type.replace('_', ' ')}
          </p>
          ${point.isPublic 
            ? '<span style="display: inline-block; padding: 3px 10px; background: #478559; color: #ffffff; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid #478559;">Public Access</span>'
            : '<span style="display: inline-block; padding: 3px 10px; background: #c7b8a6; color: #161748; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid #c7b8a6;">Private</span>'
          }
          ${point.feeRequired 
            ? '<span style="display: inline-block; margin-left: 4px; padding: 3px 10px; background: #f95d9b; color: #ffffff; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid #f95d9b;">Fee Required</span>'
            : ''
          }
          ${point.description 
            ? `<p style="margin: 8px 0 0 0; font-size: 12px; color: #c7b8a6;">${point.description}</p>`
            : ''
          }
          ${isUpstreamChoice
            ? '<p style="margin: 8px 0 0 0; font-size: 11px; color: #fca5a5; font-weight: 600;">Upstream from your put-in</p>'
            : ''
          }
          ${selectionPrompt}
          ${onReportIssue
            ? `<button class="report-issue-btn" data-point-id="${point.id}" style="margin-top: 8px; padding: 4px 8px; font-size: 11px; color: #9ca3af; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
                Report Issue
              </button>`
            : ''
          }
        </div>
      `;

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 20,
        maxWidth: '240px',
        className: 'access-point-popup',
        // No anchor specified - MapLibre will auto-position to keep popup in view
      }).setHTML(popupContent);

      // Add click handler for Report Issue button
      if (onReportIssue) {
        popup.on('open', () => {
          const popupEl = popup.getElement();
          const reportBtn = popupEl?.querySelector('.report-issue-btn');
          if (reportBtn) {
            reportBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              popup.remove();
              onReportIssue(point);
            });
          }
        });
      }

      // Show popup on hover for hover-capable devices
      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', () => {
          el.style.zIndex = '1'; // Lower marker z-index when popup shows
          popup.setLngLat([point.coordinates.lng, point.coordinates.lat]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          el.style.zIndex = `${zIndex}`; // Restore original z-index
          popup.remove();
        });
      }

      // Create marker with click handler
      // Using 'map' alignment for stable positioning at all zoom levels
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([point.coordinates.lng, point.coordinates.lat])
        .addTo(map);

      // Add click handler - always allow clicks so user can deselect or change selection
      if (onMarkerClick) {
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          if (!supportsHoverRef.current) {
            popup.setLngLat([point.coordinates.lng, point.coordinates.lat]).addTo(map);
            map.once('click', () => popup.remove());
          }
          onMarkerClick(point);
          if (supportsHoverRef.current) {
            popup.remove();
          }
        });
      }

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });

    // Cleanup
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      popupsRef.current.forEach((popup) => popup.remove());
      rootsRef.current.forEach((root) => root.unmount());
      markersRef.current = [];
      popupsRef.current = [];
      rootsRef.current = [];
    };
  }, [map, accessPoints, onMarkerClick, onReportIssue, selectedPutIn, selectedTakeOut]);

  return null;
}

// Helper to darken/lighten colors
function adjustColor(color: string, amount: number): string {
  const clamp = (val: number) => Math.min(255, Math.max(0, val));
  
  // Remove # if present
  color = color.replace('#', '');
  
  // Parse RGB
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  // Adjust
  const newR = clamp(r + amount);
  const newG = clamp(g + amount);
  const newB = clamp(b + amount);
  
  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
