'use client';

// src/components/map/GaugeStationMarkers.tsx
// Gauge station markers on the map with popup showing readings and thresholds

import { useEffect, useRef } from 'react';
import React from 'react';
import maplibregl from 'maplibre-gl';
import { Droplets } from 'lucide-react';
import { createRoot, Root } from 'react-dom/client';
import { useMap } from './MapContainer';
import type { GaugeStation } from '@/hooks/useGaugeStations';

interface GaugeStationMarkersProps {
  gauges: GaugeStation[];
  selectedRiverId?: string | null;
  nearestGaugeId?: string | null;
}

// Determine condition from gauge height and thresholds
function getConditionFromReading(
  gaugeHeight: number | null,
  thresholds: GaugeStation['thresholds']
): { code: string; label: string; color: string } {
  if (gaugeHeight === null || !thresholds || thresholds.length === 0) {
    return { code: 'unknown', label: 'Unknown', color: '#9ca3af' };
  }

  // Use the first threshold set (primary river if available)
  const t = thresholds.find(th => th.isPrimary) || thresholds[0];

  if (t.levelDangerous !== null && gaugeHeight >= t.levelDangerous) {
    return { code: 'dangerous', label: 'Flood', color: '#ef4444' };
  }
  if (t.levelHigh !== null && gaugeHeight >= t.levelHigh) {
    return { code: 'high', label: 'High', color: '#f97316' };
  }
  if (t.levelOptimalMin !== null && t.levelOptimalMax !== null &&
      gaugeHeight >= t.levelOptimalMin && gaugeHeight <= t.levelOptimalMax) {
    return { code: 'optimal', label: 'Optimal', color: '#059669' };
  }
  if (t.levelLow !== null && gaugeHeight >= t.levelLow) {
    return { code: 'low', label: 'Okay', color: '#84cc16' };
  }
  if (t.levelTooLow !== null && gaugeHeight >= t.levelTooLow) {
    return { code: 'very_low', label: 'Low', color: '#eab308' };
  }
  if (t.levelTooLow !== null && gaugeHeight < t.levelTooLow) {
    return { code: 'too_low', label: 'Too Low', color: '#9ca3af' };
  }

  return { code: 'unknown', label: 'Unknown', color: '#9ca3af' };
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

    // Create markers for each gauge
    gauges.forEach((gauge) => {
      // Check if this gauge is associated with the selected river
      const isForSelectedRiver = selectedRiverId && gauge.thresholds?.some(
        t => t.riverId === selectedRiverId
      );
      const isNearest = gauge.id === nearestGaugeId;

      // Determine color based on condition
      const condition = getConditionFromReading(gauge.gaugeHeightFt, gauge.thresholds);

      // Highlight if it's for the selected river or is the nearest gauge
      const isHighlighted = isForSelectedRiver || isNearest;
      const bgColor = isHighlighted ? '#3b82f6' : '#1e40af'; // Brighter blue if highlighted
      const scale = isHighlighted ? 1.2 : 1;
      const zIndex = isHighlighted ? 10 : 1;

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'gauge-station-marker';
      el.style.cssText = `
        background: linear-gradient(135deg, ${bgColor} 0%, ${adjustColor(bgColor, -30)} 100%);
        width: ${28 * scale}px;
        height: ${28 * scale}px;
        border-radius: 50%;
        border: 2px solid ${isHighlighted ? '#60a5fa' : '#3b82f6'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 ${isHighlighted ? '12px' : '0'} rgba(59, 130, 246, ${isHighlighted ? '0.5' : '0'});
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: box-shadow 0.2s ease, border-width 0.2s ease;
        z-index: ${zIndex};
        pointer-events: auto;
        box-sizing: border-box;
      `;

      // Render water droplet icon
      const iconSize = 14 * scale;
      const root = createRoot(el);
      root.render(
        React.createElement(Droplets, { size: iconSize, color: 'white', strokeWidth: 2.5 })
      );
      rootsRef.current.push(root);

      // Hover effect
      el.addEventListener('mouseenter', () => {
        el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4), 0 0 20px rgba(59, 130, 246, 0.5)';
        el.style.borderWidth = '3px';
      });
      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = `0 4px 12px rgba(0,0,0,0.3), 0 0 ${isHighlighted ? '12px' : '0'} rgba(59, 130, 246, ${isHighlighted ? '0.5' : '0'})`;
        el.style.borderWidth = '2px';
      });

      // Build threshold ranges HTML
      let thresholdHtml = '';
      if (gauge.thresholds && gauge.thresholds.length > 0) {
        const t = gauge.thresholds.find(th => th.isPrimary) || gauge.thresholds[0];
        thresholdHtml = `
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
            <p style="font-size: 11px; font-weight: 600; color: #c7b8a6; margin-bottom: 6px;">
              Thresholds (${t.riverName})
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
              ${t.levelOptimalMin !== null && t.levelOptimalMax !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #059669;"></span>
                  <span style="color: #a3a3a3;">Optimal:</span>
                </div>
                <span style="color: #ffffff; text-align: right;">${t.levelOptimalMin}-${t.levelOptimalMax} ft</span>
              ` : ''}
              ${t.levelLow !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #84cc16;"></span>
                  <span style="color: #a3a3a3;">Okay:</span>
                </div>
                <span style="color: #ffffff; text-align: right;">${t.levelLow} ft</span>
              ` : ''}
              ${t.levelHigh !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #f97316;"></span>
                  <span style="color: #a3a3a3;">High:</span>
                </div>
                <span style="color: #ffffff; text-align: right;">${t.levelHigh} ft</span>
              ` : ''}
              ${t.levelDangerous !== null ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
                  <span style="color: #a3a3a3;">Dangerous:</span>
                </div>
                <span style="color: #ffffff; text-align: right;">${t.levelDangerous}+ ft</span>
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
          <p style="margin-top: 8px; font-size: 10px; color: #a3a3a3;">
            Rivers: ${riverNames}
          </p>
        `;
      }

      const popupContent = `
        <div style="padding: 12px; min-width: 200px; max-width: 280px; background: #161748; border: 2px solid rgba(255, 255, 255, 0.15); border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${condition.color};"></span>
            <span style="font-size: 11px; font-weight: 600; color: ${condition.color};">${condition.label}</span>
            ${ageText ? `<span style="margin-left: auto; font-size: 10px; color: #6b7280;">${ageText}</span>` : ''}
          </div>
          <h3 style="margin: 0 0 4px 0; font-weight: 600; font-size: 13px; color: #ffffff; line-height: 1.3;">
            ${gauge.name}
          </h3>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: #6b7280;">
            USGS ${gauge.usgsSiteId}
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
            <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 8px;">
              <p style="font-size: 10px; color: #a3a3a3; margin: 0 0 2px 0;">Gauge Height</p>
              <p style="font-size: 16px; font-weight: 700; color: #ffffff; margin: 0;">
                ${gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A'}
              </p>
            </div>
            <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 8px;">
              <p style="font-size: 10px; color: #a3a3a3; margin: 0 0 2px 0;">Discharge</p>
              <p style="font-size: 16px; font-weight: 700; color: #ffffff; margin: 0;">
                ${gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A'}
              </p>
            </div>
          </div>

          ${thresholdHtml}
          ${riversHtml}

          ${isNearest ? `
            <div style="margin-top: 8px; padding: 6px 8px; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px;">
              <p style="font-size: 10px; color: #60a5fa; margin: 0; font-weight: 600;">
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

      // Show popup on hover for hover-capable devices
      if (supportsHoverRef.current) {
        el.addEventListener('mouseenter', () => {
          popup.setLngLat([gauge.coordinates.lng, gauge.coordinates.lat]).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
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
          popup.setLngLat([gauge.coordinates.lng, gauge.coordinates.lat]).addTo(map);
          map.once('click', () => popup.remove());
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
  }, [map, gauges, selectedRiverId, nearestGaugeId]);

  return null;
}

// Helper to darken/lighten colors
function adjustColor(color: string, amount: number): string {
  const clamp = (val: number) => Math.min(255, Math.max(0, val));
  color = color.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const newR = clamp(r + amount);
  const newG = clamp(g + amount);
  const newB = clamp(b + amount);
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
