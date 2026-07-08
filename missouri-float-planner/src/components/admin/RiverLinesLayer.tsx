'use client';

// src/components/admin/RiverLinesLayer.tsx
// Draws every river's geometry as a line on the geography-editor map.
//
// The editor historically rendered rivers only as their access-point marker
// trails — a freshly onboarded river (zero markers) was invisible on the map
// even though /api/admin/rivers already ships its full geometry. This layer
// makes the geometry itself visible: active rivers solid, inactive dashed,
// the selected river highlighted. Selecting a river also fits the viewport
// to it, so out-of-frame rivers (e.g. the Buffalo, south of the default
// Missouri view) are discoverable.

import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/map/MapContainer';

interface RiverLine {
  id: string;
  name: string;
  slug: string;
  geometry: GeoJSON.LineString | null;
  active: boolean;
}

interface RiverLinesLayerProps {
  rivers: RiverLine[];
  selectedRiverId: string | null;
  /** Click a river line to select it in the editor. Ignored while adding points. */
  onSelectRiver?: (riverId: string) => void;
  interactive?: boolean;
}

const SOURCE_ID = 'admin-river-lines';
const LAYER_CASING = 'admin-river-lines-casing';
const LAYER_ACTIVE = 'admin-river-lines-active';
const LAYER_INACTIVE = 'admin-river-lines-inactive';

const COLOR_SELECTED = '#a855f7'; // purple — matches selected-marker styling
const COLOR_ACTIVE = '#39a0ca';   // editor blue
const COLOR_INACTIVE = '#9ca3af'; // gray

function toFeatureCollection(rivers: RiverLine[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rivers
      .filter((r): r is RiverLine & { geometry: GeoJSON.LineString } => !!r.geometry)
      .map((r) => ({
        type: 'Feature' as const,
        geometry: r.geometry,
        properties: { id: r.id, name: r.name, slug: r.slug, active: r.active },
      })),
  };
}

export default function RiverLinesLayer({
  rivers,
  selectedRiverId,
  onSelectRiver,
  interactive = true,
}: RiverLinesLayerProps) {
  const map = useMap();
  // Refs so the stable click/hover handlers see current values.
  const onSelectRef = useRef(onSelectRiver);
  const interactiveRef = useRef(interactive);
  onSelectRef.current = onSelectRiver;
  interactiveRef.current = interactive;

  // Mount: source + layers + interaction handlers.
  useEffect(() => {
    if (map.getSource(SOURCE_ID)) return; // StrictMode remount guard

    map.addSource(SOURCE_ID, { type: 'geojson', data: toFeatureCollection([]) });

    map.addLayer({
      id: LAYER_CASING,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-width': 5 },
    });
    map.addLayer({
      id: LAYER_ACTIVE,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'active'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOR_ACTIVE, 'line-width': 2.5 },
    });
    map.addLayer({
      id: LAYER_INACTIVE,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'active'], false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOR_INACTIVE, 'line-width': 2, 'line-dasharray': [2, 2] },
    });

    const onClick = (e: MapLayerMouseEvent) => {
      if (!interactiveRef.current) return;
      const id = e.features?.[0]?.properties?.id;
      if (id && onSelectRef.current) onSelectRef.current(String(id));
    };
    const onEnter = () => {
      if (interactiveRef.current) map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    for (const layer of [LAYER_ACTIVE, LAYER_INACTIVE]) {
      map.on('click', layer, onClick);
      map.on('mouseenter', layer, onEnter);
      map.on('mouseleave', layer, onLeave);
    }

    return () => {
      for (const layer of [LAYER_ACTIVE, LAYER_INACTIVE]) {
        map.off('click', layer, onClick);
        map.off('mouseenter', layer, onEnter);
        map.off('mouseleave', layer, onLeave);
      }
      for (const layer of [LAYER_CASING, LAYER_ACTIVE, LAYER_INACTIVE]) {
        if (map.getLayer(layer)) map.removeLayer(layer);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Data updates.
  useEffect(() => {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(toFeatureCollection(rivers));
  }, [map, rivers]);

  // Selection highlight.
  useEffect(() => {
    if (!map.getLayer(LAYER_ACTIVE)) return;
    const selected = selectedRiverId ?? '';
    const color = (base: string) =>
      ['case', ['==', ['get', 'id'], selected], COLOR_SELECTED, base] as unknown as string;
    const width = (base: number) =>
      ['case', ['==', ['get', 'id'], selected], 4.5, base] as unknown as number;
    map.setPaintProperty(LAYER_ACTIVE, 'line-color', color(COLOR_ACTIVE));
    map.setPaintProperty(LAYER_ACTIVE, 'line-width', width(2.5));
    map.setPaintProperty(LAYER_INACTIVE, 'line-color', color(COLOR_INACTIVE));
    map.setPaintProperty(LAYER_INACTIVE, 'line-width', width(2));
  }, [map, selectedRiverId]);

  // Fly to the selected river so off-screen rivers (Buffalo!) are findable.
  useEffect(() => {
    if (!selectedRiverId) return;
    const river = rivers.find((r) => r.id === selectedRiverId);
    if (!river?.geometry) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of river.geometry.coordinates as Array<[number, number]>) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    if (minLng === Infinity) return;
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 800 });
  }, [map, rivers, selectedRiverId]);

  return null;
}
