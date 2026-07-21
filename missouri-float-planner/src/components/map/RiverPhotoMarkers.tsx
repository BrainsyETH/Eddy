'use client';

// src/components/map/RiverPhotoMarkers.tsx
// Community river-photo pins: a circular thumbnail ringed by the photo's
// condition color, with an image-preview popup. Photos taken at the same spot
// (they default to their access point's coordinates) collapse into ONE pin
// with a count badge whose popup flips through the stack. Modeled on
// POIMarkers.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import { presentPopup } from './popup-manager';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { shortenGaugeName } from '@/lib/gauge/format-name';
import { photoTakenLabel } from '@/lib/river-visuals';
import type { RiverVisualPin } from '@/types/api';

interface RiverPhotoMarkersProps {
  pins: RiverVisualPin[];
}

/** Current-level shots first (the stack's face should show "now"), then newest. */
function byRelevance(a: RiverVisualPin, b: RiverVisualPin): number {
  const am = a.matchesCurrent !== false ? 0 : 1;
  const bm = b.matchesCurrent !== false ? 0 : 1;
  if (am !== bm) return am - bm;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

    // Same-spot photos (identical coordinates) would stack into an unclickable
    // pile of markers — group them and render one pin per location instead.
    const groups = new Map<string, RiverVisualPin[]>();
    for (const pin of pins) {
      if (pin.lat == null || pin.lng == null) continue;
      // A pin with no image has nothing to render (defensive; the API already
      // excludes unpublished rows).
      if (!pin.imageUrl) continue;
      const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
      const group = groups.get(key);
      if (group) group.push(pin);
      else groups.set(key, [pin]);
    }

    groups.forEach((group) => {
      group.sort(byRelevance);
      const primary = group[0];
      const lng = primary.lng as number;
      const lat = primary.lat as number;
      // De-emphasize only when NOTHING in the stack matches the current level.
      // A missing field (stale cached API response) counts as a match.
      const matches = group.some((p) => p.matchesCurrent !== false);
      const size = matches ? (isTouchDevice ? 40 : 34) : (isTouchDevice ? 28 : 24);
      const ring = CONDITION_COLORS[primary.conditionCode] || '#0d9488';

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
        z-index: ${matches ? 1 : 0};
      `;
      // Keyboard + screen-reader affordance (AccessPointMarkers sets the bar).
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      const levelLabel = CONDITION_SHORT_LABELS[primary.conditionCode] || primary.conditionCode;
      const takenLabel = photoTakenLabel(primary.capturedAt, primary.createdAt);
      el.setAttribute(
        'aria-label',
        group.length > 1
          ? `${group.length} river photos${primary.accessPointName ? ` near ${primary.accessPointName}` : ''}. Press to preview.`
          : `River photo${primary.accessPointName ? ` near ${primary.accessPointName}` : ''}, ${levelLabel} level${takenLabel ? `, ${takenLabel.toLowerCase()}` : ''}. Press to preview.`
      );

      const circle = document.createElement('div');
      circle.className = 'river-photo-marker-thumb';
      circle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: ${matches ? 3 : 2}px solid ${ring};
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        overflow: hidden;
        background: #e5e7eb;
        pointer-events: none;
        box-sizing: border-box;
        opacity: ${matches ? 1 : 0.55};
      `;

      const img = document.createElement('img');
      img.src = primary.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
      circle.appendChild(img);
      el.appendChild(circle);

      // Stack size badge for grouped photos.
      if (group.length > 1) {
        const badge = document.createElement('span');
        badge.textContent = String(group.length);
        badge.setAttribute('aria-hidden', 'true');
        badge.style.cssText = `
          position: absolute;
          right: 2px;
          bottom: 2px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid #d4d4d4;
          color: #171717;
          font-size: 10px;
          font-weight: 700;
          line-height: 14px;
          text-align: center;
          box-sizing: border-box;
          pointer-events: none;
        `;
        el.appendChild(badge);
      }

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        maxWidth: '200px',
        className: 'river-photo-popup',
      }).setDOMContent(buildPopupContent(group));

      const open = () => presentPopup(map, popup, [lng, lat]);

      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', open);
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
        // Click pins the card; stop propagation so it doesn't fall through to
        // the river line's hit layer beneath.
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          open();
        });
      } else {
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          open();
          map.once('click', () => popup.remove());
        });
      }
      el.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
          map.once('click', () => popup.remove());
        } else if (e.key === 'Escape') {
          popup.remove();
        }
      });

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
      markersRef.current = [];
      popupsRef.current = [];
    };
  }, [map, pins]);

  return null;
}

/**
 * Popup for a pin (or a same-spot stack): main image + reading metadata, plus a
 * thumbnail strip to flip through stacked photos. Built as DOM with textContent
 * (never HTML strings), so no escaping is needed.
 */
function buildPopupContent(group: RiverVisualPin[]): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'width: 180px;';

  const mainImg = document.createElement('img');
  mainImg.alt = '';
  mainImg.decoding = 'async';
  mainImg.style.cssText =
    'width: 100%; height: 110px; object-fit: cover; border-radius: 6px 6px 0 0; display: block; background: #e5e7eb;';
  root.appendChild(mainImg);

  const meta = document.createElement('div');
  meta.style.cssText = 'padding: 8px 10px;';
  root.appendChild(meta);

  let thumbs: HTMLImageElement[] = [];

  const renderPin = (pin: RiverVisualPin) => {
    mainImg.src = pin.imageUrl;
    meta.replaceChildren();

    const ring = CONDITION_COLORS[pin.conditionCode] || '#0d9488';
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 2px;';
    const dot = document.createElement('span');
    dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: ${ring}; display: inline-block;`;
    const label = document.createElement('span');
    label.style.cssText = 'font-weight: 600; font-size: 12px; color: var(--color-text-primary);';
    label.textContent = CONDITION_SHORT_LABELS[pin.conditionCode] || pin.conditionCode;
    header.append(dot, label);
    meta.appendChild(header);

    const line = (text: string, extra = '') => {
      const p = document.createElement('p');
      p.style.cssText = `margin: 2px 0 0 0; font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${extra}`;
      p.textContent = text;
      meta.appendChild(p);
    };

    const stageFlow = [
      pin.gaugeHeightFt != null ? `${pin.gaugeHeightFt} ft` : null,
      pin.dischargeCfs != null ? `${pin.dischargeCfs} cfs` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (stageFlow) line(stageFlow, 'margin-top: 0; color: var(--color-text-secondary);');
    if (stageFlow && pin.gaugeName) line(`at ${shortenGaugeName(pin.gaugeName)} gauge`, 'font-size: 10px;');
    const taken = photoTakenLabel(pin.capturedAt, pin.createdAt);
    if (taken) line(taken, 'font-size: 10px;');
    if (pin.accessPointName) line(pin.accessPointName);
    if (pin.matchesCurrent === false) {
      line('Taken at a different level than today', 'font-size: 10px; font-style: italic;');
    }

    thumbs.forEach((thumb, i) => {
      thumb.style.borderColor = group[i] === pin ? '#0d9488' : 'transparent';
    });
  };

  if (group.length > 1) {
    const strip = document.createElement('div');
    strip.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; padding: 0 10px 8px;';
    thumbs = group.map((pin) => {
      const thumb = document.createElement('img');
      thumb.src = pin.imageUrl;
      thumb.alt = '';
      thumb.decoding = 'async';
      thumb.style.cssText =
        'width: 30px; height: 30px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 2px solid transparent; box-sizing: border-box; background: #e5e7eb;';
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        renderPin(pin);
      });
      strip.appendChild(thumb);
      return thumb;
    });
    root.appendChild(strip);
  }

  renderPin(group[0]);
  return root;
}
