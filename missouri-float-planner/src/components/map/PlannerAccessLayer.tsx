'use client';

import { useEffect, useMemo, type RefObject } from 'react';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import { useMap } from './map-context';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';

const SOURCE = 'planner-access-catalog';
const DOTS = 'planner-access-dots';
const LABELS = 'planner-access-labels';

/** A single GPU layer keeps every access visible without hundreds of DOM pins. */
export default function PlannerAccessLayer({ places, excludeRiverSlug, onSelect }: {
  places: PlannerMapPlace[];
  excludeRiverSlug?: string;
  onSelect: (place: PlannerMapPlace) => void;
}) {
  const map = useMap();
  const visible = useMemo(() => places.filter(place => place.riverSlug !== excludeRiverSlug), [places, excludeRiverSlug]);
  useEffect(() => {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: visible.map((place, index) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [place.coordinates.lng, place.coordinates.lat] },
      properties: { index, name: place.name },
    })) } });
    map.addLayer({ id: DOTS, type: 'circle', source: SOURCE, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.8, 10, 5, 14, 7],
      'circle-color': '#c7b8a6', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.5,
    } });
    // Satellite has no glyphs; the dots remain fully usable there.
    if (map.getStyle().glyphs) map.addLayer({ id: LABELS, type: 'symbol', source: SOURCE, minzoom: 10,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-anchor': 'top', 'text-offset': [0, 1], 'text-max-width': 12 },
      paint: { 'text-color': '#FFFFFF', 'text-halo-color': '#0F2D35', 'text-halo-width': 1.5 },
    });
    const click = (event: MapLayerMouseEvent) => {
      const index = event.features?.[0]?.properties?.index;
      if (typeof index === 'number' && visible[index]) onSelect(visible[index]);
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', DOTS, click); map.on('mouseenter', DOTS, enter); map.on('mouseleave', DOTS, leave);
    return () => {
      map.off('click', DOTS, click); map.off('mouseenter', DOTS, enter); map.off('mouseleave', DOTS, leave);
      for (const layer of [LABELS, DOTS]) if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      map.getCanvas().style.cursor = '';
    };
  }, [map, visible, onSelect]);
  return null;
}

/** Search and map taps use the same selection and camera treatment. */
export function PlannerPlaceFocus({ place, panelRef }: {
  place: PlannerMapPlace | null;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!place) return;
    let frame = 0;
    const focus = () => {
      cancelAnimationFrame(frame);
      // Run after river bounds fitting. Center in the map area to the right
      // of the actual panel, including its inset; no assumed panel width.
      frame = requestAnimationFrame(() => {
        const canvas = map.getCanvas().getBoundingClientRect();
        const panel = panelRef.current?.getBoundingClientRect();
        const coveredWidth = panel ? Math.max(0, Math.min(canvas.width, panel.right - canvas.left)) : 0;
        map.flyTo({
          center: [place.coordinates.lng, place.coordinates.lat], zoom: Math.max(12, map.getZoom()),
          offset: [coveredWidth / 2, 0],
          duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,
        });
      });
    };
    focus();
    const observer = new ResizeObserver(focus);
    if (panelRef.current) observer.observe(panelRef.current);
    map.on('resize', focus);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); map.off('resize', focus); };
  }, [map, place, panelRef]);
  return null;
}
