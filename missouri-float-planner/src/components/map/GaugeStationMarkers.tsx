'use client';

// src/components/map/GaugeStationMarkers.tsx
// Gauge station markers on the map with popup showing readings and thresholds

import { useEffect, useRef } from 'react';
import React from 'react';
import maplibregl from 'maplibre-gl';
import { AlertTriangle } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { useMap } from './MapContainer';
import { attachMarkerZoomFade, type ZoomFadeEntry } from './marker-zoom';
import { presentPopup } from './popup-manager';
import type { GaugeStation } from '@/hooks/useGaugeStations';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS, getEddyImageForCondition } from '@/constants';
import { computeCondition } from '@/lib/conditions';
import { escapeHtml } from '@/lib/escape-html';

interface GaugeStationMarkersProps {
  gauges: GaugeStation[];
  selectedRiverId?: string | null;
  nearestGaugeId?: string | null;
}

// Determine condition from a reading + thresholds using the SHARED, unit-aware
// engine (src/lib/conditions.ts computeCondition). It must receive BOTH the gauge
// height AND the discharge plus the threshold unit — otherwise cfs-rated gauges
// (e.g. Current @ Doniphan, whose stage datum reads negative) get compared against
// the wrong metric and mis-colored on the map. This also keeps the "high starts at
// optimal_max" / "good floor" band logic identical to every other surface.
function getConditionFromReading(
  gaugeHeightFt: number | null,
  dischargeCfs: number | null,
  thresholds: GaugeStation['thresholds']
): { code: string; label: string; color: string } {
  const resolve = (code: string) => ({
    code,
    label: CONDITION_SHORT_LABELS[code] || 'Unknown',
    color: CONDITION_COLORS[code as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown,
  });

  if (!thresholds || thresholds.length === 0) {
    return resolve('unknown');
  }

  // Use the primary river's threshold set if available
  const t = thresholds.find(th => th.isPrimary) || thresholds[0];

  const { code } = computeCondition(
    gaugeHeightFt,
    {
      levelTooLow: t.levelTooLow,
      levelLow: t.levelLow,
      levelOptimalMin: t.levelOptimalMin,
      levelOptimalMax: t.levelOptimalMax,
      levelHigh: t.levelHigh,
      levelDangerous: t.levelDangerous,
      thresholdUnit: t.thresholdUnit,
    },
    dischargeCfs,
  );
  return resolve(code);
}

export default function GaugeStationMarkers({
  gauges,
  selectedRiverId,
  nearestGaugeId,
}: GaugeStationMarkersProps) {
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

    if (!map || !gauges || gauges.length === 0) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    popupsRef.current.forEach((popup) => popup.remove());
    rootsRef.current.forEach((root) => root.unmount());
    markersRef.current = [];
    popupsRef.current = [];
    rootsRef.current = [];

    // Zoom-aware sizing (see ./marker-zoom.ts): gauges for other rivers
    // compact at state framing; highlighted ones (selected river, nearest
    // to put-in) stay pinned at full prominence.
    const zoomFadeEntries: ZoomFadeEntry[] = [];

    // Create markers for each gauge
    gauges.forEach((gauge) => {
      // Check if this gauge is associated with the selected river
      const isForSelectedRiver = selectedRiverId && gauge.thresholds?.some(
        t => t.riverId === selectedRiverId
      );
      const isNearest = gauge.id === nearestGaugeId;

      // Determine color based on condition
      const condition = getConditionFromReading(gauge.gaugeHeightFt, gauge.dischargeCfs, gauge.thresholds);

      // Highlight if it's for the selected river or is the nearest gauge
      const isHighlighted = isForSelectedRiver || isNearest;
      // Marker fill encodes the condition (never hardcode condition hex).
      const bgColor = condition.color;
      const scale = isHighlighted ? 1.2 : 1;
      const zIndex = isHighlighted ? 10 : 1;
      // Highlighted markers keep a brighter/white ring; others get a white ring
      // for contrast against the map. Glow uses the condition color.
      const ringColor = isHighlighted ? '#ffffff' : 'rgba(255,255,255,0.9)';
      const glowRgba = hexToRgba(condition.color, isHighlighted ? 0.55 : 0);
      const baseShadow = `0 4px 12px rgba(0,0,0,0.3), 0 0 ${isHighlighted ? '12px' : '0'} ${glowRgba}`;
      // Shape redundancy at the dangerous end: color must not be the only signal.
      const isSevere = condition.code === 'dangerous' || condition.code === 'high';

      // Outer element is a ≥44px transparent hit area (touch target). The visible
      // circle lives in an inner child so the visible size is unchanged.
      // NEVER set an inline position here: MapLibre positions the marker via
      // the .maplibregl-marker class (position:absolute) + an inline
      // translate, and an inline "position: relative" overrides the class —
      // every marker then translates from its DOM-flow spot instead of the
      // map origin, scattering gauges off their rivers. (The severe badge
      // anchors to this element fine: absolute-in-absolute.)
      const el = document.createElement('div');
      el.className = 'gauge-station-marker';
      el.style.cssText = `
        width: 44px;
        height: 44px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        z-index: ${zIndex};
        box-sizing: border-box;
      `;

      // The visible marker: Eddy's condition face in a surface-colored
      // circle with a slim ring in the condition color — the same
      // condition→otter mapping the river condition page uses, so gauges
      // read as "Eddy's verdict here", not an abstract dot.
      const circle = document.createElement('div');
      circle.className = 'gauge-station-marker-circle';
      circle.style.cssText = `
        background: var(--color-surface, #ffffff);
        width: ${30 * scale}px;
        height: ${30 * scale}px;
        border-radius: 50%;
        border: 2px solid ${bgColor};
        outline: 1.5px solid ${ringColor};
        box-shadow: ${baseShadow};
        overflow: hidden;
        transition: box-shadow 0.2s ease, border-width 0.2s ease;
        box-sizing: border-box;
      `;
      el.appendChild(circle);

      const eddyImg = document.createElement('img');
      eddyImg.src = getEddyImageForCondition(condition.code);
      eddyImg.alt = '';
      eddyImg.draggable = false;
      eddyImg.loading = 'lazy';
      // contain + inset, not cover: the otter is a full-body illustration,
      // and cover crops the head/flag against the circle's edge.
      eddyImg.style.cssText =
        'width:100%;height:100%;object-fit:contain;padding:2px;box-sizing:border-box;display:block;pointer-events:none;';
      circle.appendChild(eddyImg);

      // Shape redundancy at the dangerous end (color must never be the
      // only signal): a small alert badge rides the marker's corner.
      if (isSevere) {
        const badge = document.createElement('div');
        badge.style.cssText = `
          position: absolute;
          right: 3px;
          bottom: 3px;
          width: ${14 * scale}px;
          height: ${14 * scale}px;
          border-radius: 9999px;
          background: ${bgColor};
          border: 1.5px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          pointer-events: none;
        `;
        const badgeRoot = createRoot(badge);
        badgeRoot.render(
          React.createElement(AlertTriangle, { size: 9 * scale, color: '#1A1814', strokeWidth: 3 })
        );
        rootsRef.current.push(badgeRoot);
        el.appendChild(badge);
      }

      // Hover effect
      el.addEventListener('mouseenter', () => {
        circle.style.boxShadow = `0 6px 20px rgba(0,0,0,0.4), 0 0 20px ${hexToRgba(condition.color, 0.55)}`;
        circle.style.borderWidth = '3px';
      });
      el.addEventListener('mouseleave', () => {
        circle.style.boxShadow = baseShadow;
        circle.style.borderWidth = '2px';
      });

      // Build threshold ranges HTML
      let thresholdHtml = '';
      if (gauge.thresholds && gauge.thresholds.length > 0) {
        const t = gauge.thresholds.find(th => th.isPrimary) || gauge.thresholds[0];
        const tUnit = t.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
        thresholdHtml = `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--color-border);">
            <p style="font-size: 11px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 6px;">
              Thresholds (${t.riverName})
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
              ${t.levelOptimalMin !== null && t.levelOptimalMax !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CONDITION_COLORS.flowing};"></span>
                  <span style="color: var(--color-text-muted);">Flowing:</span>
                </div>
                <span style="color: var(--color-text-primary); text-align: right;">${t.levelOptimalMin}-${t.levelOptimalMax} ${tUnit}</span>
              ` : ''}
              ${t.levelLow !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CONDITION_COLORS.good};"></span>
                  <span style="color: var(--color-text-muted);">Good:</span>
                </div>
                <span style="color: var(--color-text-primary); text-align: right;">${t.levelLow} ${tUnit}</span>
              ` : ''}
              ${t.levelHigh !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CONDITION_COLORS.high};"></span>
                  <span style="color: var(--color-text-muted);">High:</span>
                </div>
                <span style="color: var(--color-text-primary); text-align: right;">${t.levelHigh} ${tUnit}</span>
              ` : ''}
              ${t.levelDangerous !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${CONDITION_COLORS.dangerous};"></span>
                  <span style="color: var(--color-text-muted);">Dangerous:</span>
                </div>
                <span style="color: var(--color-text-primary); text-align: right;">${t.levelDangerous}+ ${tUnit}</span>
              ` : ''}
            </div>
          </div>
        `;
      }

      // Reading age text
      let ageText = '';
      if (gauge.readingAgeHours !== null) {
        if (gauge.readingAgeHours < 1) {
          ageText = 'Just now';
        } else if (gauge.readingAgeHours < 24) {
          ageText = `${Math.round(gauge.readingAgeHours)}h ago`;
        } else {
          ageText = `${Math.round(gauge.readingAgeHours / 24)}d ago`;
        }
      }

      // Rivers using this gauge
      let riversHtml = '';
      if (gauge.thresholds && gauge.thresholds.length > 0) {
        const riverNames = gauge.thresholds.map(t => t.riverName).join(', ');
        riversHtml = `
          <p style="margin-top: 8px; font-size: 10px; color: var(--color-text-muted);">
            Rivers: ${escapeHtml(riverNames)}
          </p>
        `;
      }

      const popupContent = `
        <div style="padding: 12px; min-width: 200px; max-width: 280px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${condition.color};"></span>
            <span style="font-size: 11px; font-weight: 600; color: ${condition.color};">${condition.label}</span>
            ${ageText ? `<span style="margin-left: auto; font-size: 10px; color: var(--color-text-muted);">${ageText}</span>` : ''}
          </div>
          <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 13px; color: var(--color-text-primary); line-height: 1.3;">
            ${escapeHtml(gauge.name)}
          </h3>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: var(--color-text-muted);">
            USGS ${gauge.usgsSiteId}
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
            <div style="background: var(--color-background); border: 1px solid var(--color-border); border-radius: 8px; padding: 8px;">
              <p style="font-size: 10px; color: var(--color-text-muted); margin: 0 0 2px 0;">Gauge Height</p>
              <p style="font-size: 16px; font-weight: 700; color: var(--color-text-primary); margin: 0;">
                ${gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A'}
              </p>
            </div>
            <div style="background: var(--color-background); border: 1px solid var(--color-border); border-radius: 8px; padding: 8px;">
              <p style="font-size: 10px; color: var(--color-text-muted); margin: 0 0 2px 0;">Discharge</p>
              <p style="font-size: 16px; font-weight: 700; color: var(--color-text-primary); margin: 0;">
                ${gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A'}
              </p>
            </div>
          </div>

          ${thresholdHtml}
          ${riversHtml}

          ${isNearest ? `
            <div style="margin-top: 8px; padding: 6px 8px; background: var(--color-primary-50); border: 1px solid var(--color-primary-200); border-radius: 6px;">
              <p style="font-size: 10px; color: var(--color-primary-700); margin: 0; font-weight: 600;">
                Nearest gauge to your put-in
              </p>
            </div>
          ` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        maxWidth: '300px',
        className: 'gauge-station-popup',
      }).setHTML(popupContent);

      // Show popup on hover for hover-capable devices. Click PINS it and
      // must stopPropagation: the gauge sits on the river line, so an
      // unswallowed click reaches the condition layer's hit layer and its
      // river popup replaces this gauge card.
      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', () => {
          presentPopup(map, popup, [gauge.coordinates.lng, gauge.coordinates.lat]);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          presentPopup(map, popup, [gauge.coordinates.lng, gauge.coordinates.lat]);
        });
      }

      // Create marker
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([gauge.coordinates.lng, gauge.coordinates.lat])
        .addTo(map);

      // Touch devices: show popup on click
      if (!supportsHoverRef.current) {
        el.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          presentPopup(map, popup, [gauge.coordinates.lng, gauge.coordinates.lat]);
          map.once('click', () => popup.remove());
        });
      }

      markersRef.current.push(marker);
      popupsRef.current.push(popup);
      zoomFadeEntries.push({ el, circle, pinned: isHighlighted });
    });

    const detachZoomFade = attachMarkerZoomFade(map, zoomFadeEntries);

    // Cleanup
    return () => {
      detachZoomFade();
      markersRef.current.forEach((marker) => marker.remove());
      popupsRef.current.forEach((popup) => popup.remove());
      rootsRef.current.forEach((root) => root.unmount());
      markersRef.current = [];
      popupsRef.current = [];
      rootsRef.current = [];
    };
  }, [map, gauges, selectedRiverId, nearestGaugeId]);

  return null;
}

// Helper to convert a hex color to an rgba() string with the given alpha.
function hexToRgba(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

