'use client';

// src/components/map/RiverPhotoMarkers.tsx
// Community river-photo pins: a circular thumbnail ringed by the photo's
// condition color, with an image-preview popup. Modeled on POIMarkers.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import { presentPopup } from './popup-manager';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { escapeHtml } from '@/lib/escape-html';
import { shortenGaugeName } from '@/lib/gauge/format-name';
import type { RiverVisualPin } from '@/types/api';

interface RiverPhotoMarkersProps {
  pins: RiverVisualPin[];
}

export default function RiverPhotoMarkers({ pins }: RiverPhotoMarkersProps) {
  const map = useMap();
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupsRef = useRef<maplibregl.Popup[]>([]);
  const supportsHoverRef = useRef(false);

  useEffect(() => {
    supportsHoverRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(hover: hover)').matches;

    if (!map || !pins.length) return;

    // Clear existing
    markersRef.current.forEach((marker) => marker.remove());
    popupsRef.current.forEach((popup) => popup.remove());
    markersRef.current = [];
    popupsRef.current = [];

    const isTouchDevice = !supportsHoverRef.current;
    const size = isTouchDevice ? 40 : 34;

    pins.forEach((pin) => {
      if (pin.lat == null || pin.lng == null) return;
      // A pin with no image has nothing to render, and passing a null URL into
      // the popup markup below would throw and take down the whole planner page.
      if (!pin.imageUrl) return;
      const ring = CONDITION_COLORS[pin.conditionCode] || '#0d9488';

      // Outer element is a transparent ≥44px hit area (touch target); the
      // visible thumbnail lives in an inner child. Don't set inline position —
      // MapLibre owns it.
      const el = document.createElement('div');
      el.className = 'river-photo-marker';
      el.style.cssText = `
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        cursor: pointer;
        pointer-events: auto;
        box-sizing: border-box;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        z-index: 0;
      `;

      const circle = document.createElement('div');
      circle.className = 'river-photo-marker-thumb';
      circle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid ${ring};
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        overflow: hidden;
        background: #e5e7eb;
        pointer-events: none;
        box-sizing: border-box;
      `;

      const img = document.createElement('img');
      img.src = pin.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
      circle.appendChild(img);
      el.appendChild(circle);

      const label = CONDITION_SHORT_LABELS[pin.conditionCode] || pin.conditionCode;
      const stageFlow = [
        pin.gaugeHeightFt != null ? `${pin.gaugeHeightFt} ft` : null,
        pin.dischargeCfs != null ? `${pin.dischargeCfs} cfs` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      // Name the gauge the reading came from, so "4.34 ft" isn't ambiguous.
      const gaugeLabel = pin.gaugeName ? shortenGaugeName(pin.gaugeName) : null;

      const popupContent = `
        <div style="width: 180px;">
          <img src="${escapeHtml(pin.imageUrl)}" alt="" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px 6px 0 0; display: block;" />
          <div style="padding: 8px 10px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${ring}; display: inline-block;"></span>
              <span style="font-weight: 600; font-size: 12px; color: var(--color-text-primary);">${escapeHtml(label)}</span>
            </div>
            ${stageFlow ? `<p style="margin: 0; font-size: 11px; color: var(--color-text-secondary);">${escapeHtml(stageFlow)}</p>` : ''}
            ${stageFlow && gaugeLabel ? `<p style="margin: 1px 0 0 0; font-size: 10px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">at ${escapeHtml(gaugeLabel)} gauge</p>` : ''}
            ${pin.accessPointName ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(pin.accessPointName)}</p>` : ''}
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        maxWidth: '200px',
        className: 'river-photo-popup',
      }).setHTML(popupContent);

      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', () => {
          presentPopup(map, popup, [pin.lng, pin.lat]);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
        // Click pins the card; stop propagation so it doesn't fall through to
        // the river line's hit layer beneath.
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          presentPopup(map, popup, [pin.lng, pin.lat]);
        });
      } else {
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          presentPopup(map, popup, [pin.lng, pin.lat]);
          map.once('click', () => popup.remove());
        });
      }

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      popupsRef.current.forEach((popup) => popup.remove());
      markersRef.current = [];
      popupsRef.current = [];
    };
  }, [map, pins]);

  return null;
}
