'use client';

// src/components/map/ConditionRiverLayer.tsx
// The river-guide page's river line, colored by CURRENT CONDITION — the
// interactive-map port of the Observatory's condition-painted reaches
// (src/components/mo-surface-water/MOMap.tsx). Where the planner's
// RouteLayer encodes direction (green = downstream), this layer encodes
// floatability using the canonical condition palette, so a reach's state
// is readable from the map itself, not just the gauge dots.
//
// One hue = one meaning per surface: pages using this layer must NOT also
// draw the green RouteLayer river, and MapContainer's legend should hide
// its route entries (legendRoute={false}).
//
// Three layers over one geojson source, inserted at the curated style's
// line anchor (below every label — see ./layer-anchors.ts):
//   casing — neutral halo that separates the color from terrain
//   line   — condition color from shared/condition-system.ts
//   hit    — invisible wide companion so a 2-8px line is tappable;
//            hover sets the cursor, click opens a condition popup with
//            the latest gauge reading and a link into the planner.
//
// Conditions load via the existing useConditions hook (React Query,
// 5-minute refetch) — the line recolors live as data arrives or changes.
// No data / unknown renders as a deeper slate-teal in the basemap water
// family: visually "a river we feature", without claiming a condition
// (gray reads as broken, not as "no data").

import { useEffect, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from './MapContainer';
import { ANCHORS, addLayerAt } from './layer-anchors';
import { LINE_WIDTH, CASING_WIDTH, CASING_COLOR, HIT_WIDTH, NO_DATA_WATER_COLOR } from './line-style';
import { useConditions } from '@/hooks/useConditions';
import { conditionChip } from '@shared/condition-system';
import { escapeHtml } from '@/lib/escape-html';
import type { RiverCondition } from '@/types/api';
import type { GeoJSON } from 'geojson';

const NO_DATA_COLOR = NO_DATA_WATER_COLOR;

const SOURCE_ID = 'condition-river-source';
const LAYER_ID = 'condition-river-layer';
const CASING_LAYER_ID = 'condition-river-casing-layer';
const HIT_LAYER_ID = 'condition-river-hit-layer';

function popupHtml(
  condition: RiverCondition | null,
  riverName: string,
  planHref: string | null,
): string {
  const chip = conditionChip(condition?.code ?? 'unknown');
  const parts: string[] = [];

  parts.push(
    `<div style="font-weight:600;font-size:13px;color:#1f2937;margin-bottom:6px">${escapeHtml(riverName)}</div>`,
  );
  parts.push(
    `<span style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:9999px;background:${chip.background};color:${chip.color};border:1px solid ${chip.borderColor};font-size:12px;font-weight:600">` +
      `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${chip.solid}"></span>` +
      `${escapeHtml(chip.longLabel)}</span>`,
  );

  if (condition) {
    const reading: string[] = [];
    if (condition.dischargeCfs != null) reading.push(`${Math.round(condition.dischargeCfs).toLocaleString()} cfs`);
    if (condition.gaugeHeightFt != null) reading.push(`${condition.gaugeHeightFt.toFixed(2)} ft`);
    const age =
      condition.readingAgeHours != null
        ? condition.readingAgeHours < 1.5
          ? 'within the hour'
          : `${Math.round(condition.readingAgeHours)}h ago`
        : null;
    if (reading.length) {
      parts.push(
        `<div style="margin-top:7px;font-size:12px;color:#374151">${reading.join(' · ')}${age ? ` <span style="color:#6b7280">(${age})</span>` : ''}</div>`,
      );
    }
    if (condition.gaugeName) {
      parts.push(
        `<div style="margin-top:2px;font-size:11px;color:#6b7280">${escapeHtml(condition.gaugeName)}</div>`,
      );
    }
  }

  if (planHref) {
    parts.push(
      `<a href="${escapeHtml(planHref)}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:600;color:#0e7490;text-decoration:none">Plan this float →</a>`,
    );
  }

  return `<div style="min-width:190px;padding:2px 2px 4px">${parts.join('')}</div>`;
}

interface ConditionRiverLayerProps {
  riverId: string;
  riverName: string;
  /** Enables the "Plan this float" popup link when provided. */
  riverSlug?: string;
  geometry: GeoJSON.LineString;
}

export default function ConditionRiverLayer({
  riverId,
  riverName,
  riverSlug,
  geometry,
}: ConditionRiverLayerProps) {
  const map = useMap();
  const { data: conditions } = useConditions(riverId);

  const condition = conditions?.condition ?? null;
  const color = useMemo(() => {
    const code = condition?.code;
    return code && code !== 'unknown' ? conditionChip(code).solid : NO_DATA_COLOR;
  }, [condition?.code]);
  const planHref = riverSlug ? `/plan?river=${riverSlug}` : null;

  useEffect(() => {
    if (!map) return;

    if (!map.loaded()) {
      const handleLoad = () => {
        // Map loaded, effect will re-run
      };
      map.once('load', handleLoad);
      return () => {
        map.off('load', handleLoad);
      };
    }

    const hasLayer = (id: string): boolean => {
      try {
        return map.getLayer(id) !== undefined;
      } catch {
        return false;
      }
    };

    try {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', geometry, properties: {} },
      });

      // Casing → line → hit, each inserted immediately before the anchor,
      // so they stack in that order and all stay below labels.
      addLayerAt(map, {
        id: CASING_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': CASING_COLOR, 'line-width': CASING_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      addLayerAt(map, {
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': color, 'line-width': LINE_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);

      addLayerAt(map, {
        id: HIT_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': HIT_WIDTH },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      }, ANCHORS.lines);
    } catch (err) {
      console.warn('Error adding condition river layers:', err);
    }

    return () => {
      try {
        for (const id of [HIT_LAYER_ID, LAYER_ID, CASING_LAYER_ID]) {
          if (hasLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [map, geometry, color]);

  // Interaction lives in its own effect keyed on the popup inputs, so a
  // condition refresh updates the popup content without tearing down and
  // re-adding the layers above.
  useEffect(() => {
    if (!map || !map.loaded()) return;

    let popup: maplibregl.Popup | null = null;

    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      popup?.remove();
      popup = new maplibregl.Popup({ offset: 10, maxWidth: '280px' })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(condition, riverName, planHref))
        .addTo(map);
    };

    map.on('mouseenter', HIT_LAYER_ID, onEnter);
    map.on('mouseleave', HIT_LAYER_ID, onLeave);
    map.on('click', HIT_LAYER_ID, onClick);

    return () => {
      map.off('mouseenter', HIT_LAYER_ID, onEnter);
      map.off('mouseleave', HIT_LAYER_ID, onLeave);
      map.off('click', HIT_LAYER_ID, onClick);
      popup?.remove();
      map.getCanvas().style.cursor = '';
    };
  }, [map, condition, riverName, planHref]);

  return null;
}
