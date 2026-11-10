'use client';

// src/components/map/GuideRoutesLayer.tsx
// A guide's featured floats, pre-drawn on the shared map: every stretch in
// teal, the selected one in the planner's route color. Same casing, widths
// and label-safe layer position as RouteLayer, so it reads as the same family
// of Eddy lines. Clicking a stretch selects it.

import { useEffect, useState } from 'react';
import { useMap } from './MapContainer';
import { ANCHORS, addLayerAt, isStyleReady, whenStyleReady } from './layer-anchors';
import { LINE_WIDTH, CASING_WIDTH, CASING_COLOR, HIT_WIDTH, ROUTE_COLOR } from './line-style';
import { colors } from '@shared/social-brand';
import type * as maplibregl from 'maplibre-gl';

export interface GuideRouteLine { id: number; coordinates: number[][] }

const SOURCE = 'guide-routes-source';
const CASING = 'guide-routes-casing';
const LINES = 'guide-routes-line';
const ACTIVE = 'guide-routes-active';
const HIT = 'guide-routes-hit';
const ENDS = 'guide-routes-ends';

function collection(routes: GuideRouteLine[], selectedId: number | undefined): GeoJSON.FeatureCollection {
  const active = routes.find(route => route.id === selectedId);
  return {
    type: 'FeatureCollection',
    features: [
      ...routes.map(route => ({
        type: 'Feature' as const,
        properties: { id: route.id, selected: route.id === selectedId },
        geometry: { type: 'LineString' as const, coordinates: route.coordinates },
      })),
      ...(active ? [active.coordinates[0], active.coordinates[active.coordinates.length - 1]].map((point, index) => ({
        type: 'Feature' as const,
        properties: { end: index === 0 ? 'put-in' : 'take-out' },
        geometry: { type: 'Point' as const, coordinates: point },
      })) : []),
    ],
  };
}

export default function GuideRoutesLayer({ routes, selectedId, onSelect }: {
  routes: GuideRouteLine[];
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const map = useMap();
  const [styleReadyTick, setStyleReadyTick] = useState(0);

  useEffect(() => {
    if (!map) return;
    if (!isStyleReady(map)) return whenStyleReady(map, () => setStyleReadyTick(tick => tick + 1));
    const has = (kind: 'source' | 'layer', id: string) => {
      try { return (kind === 'source' ? map.getSource(id) : map.getLayer(id)) !== undefined; } catch { return false; }
    };
    const data = collection(routes, selectedId);
    try {
      if (has('source', SOURCE)) {
        (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(data);
      } else {
        map.addSource(SOURCE, { type: 'geojson', data });
        const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
        const isLine: maplibregl.FilterSpecification = ['==', ['geometry-type'], 'LineString'];
        addLayerAt(map, { id: CASING, type: 'line', source: SOURCE, filter: isLine, layout: line,
          paint: { 'line-color': CASING_COLOR, 'line-width': CASING_WIDTH } }, ANCHORS.lines);
        addLayerAt(map, { id: LINES, type: 'line', source: SOURCE, filter: isLine, layout: line,
          paint: { 'line-color': colors.primary[600], 'line-width': LINE_WIDTH } }, ANCHORS.lines);
        // Drawn last so the selected float is never hidden under a neighbour it shares an access with.
        addLayerAt(map, { id: ACTIVE, type: 'line', source: SOURCE, filter: ['all', isLine, ['==', ['get', 'selected'], true]], layout: line,
          paint: { 'line-color': ROUTE_COLOR, 'line-width': LINE_WIDTH } }, ANCHORS.lines);
        addLayerAt(map, { id: HIT, type: 'line', source: SOURCE, filter: isLine, layout: line,
          paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': HIT_WIDTH } }, ANCHORS.lines);
        map.addLayer({ id: ENDS, type: 'circle', source: SOURCE, filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
            'circle-color': ['case', ['==', ['get', 'end'], 'put-in'], colors.primary[700], colors.accent[600]] } });
      }
    } catch (error) {
      console.warn('Error drawing guide routes:', error);
    }
  }, [map, routes, selectedId, styleReadyTick]);

  useEffect(() => {
    if (!map) return;
    const click = (event: maplibregl.MapLayerMouseEvent) => {
      const id = Number(event.features?.[0]?.properties?.id);
      if (Number.isFinite(id)) onSelect(id);
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', HIT, click); map.on('mouseenter', HIT, enter); map.on('mouseleave', HIT, leave);
    return () => { map.off('click', HIT, click); map.off('mouseenter', HIT, enter); map.off('mouseleave', HIT, leave); };
  }, [map, onSelect]);

  useEffect(() => () => {
    if (!map) return;
    try {
      for (const id of [ENDS, HIT, ACTIVE, LINES, CASING]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    } catch { /* the map may already be gone */ }
  }, [map]);

  return null;
}
