'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
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
export function PlannerMapFocus({ place, bounds, request, preserveInitialCamera, panelRef, stripRef, sheetRef, mobile = false, sheetReady = false, stripReady = false }: {
  place: PlannerMapPlace | null;
  bounds?: [number, number, number, number];
  request: number;
  preserveInitialCamera: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  stripRef: RefObject<HTMLDivElement | null>;
  sheetRef?: RefObject<HTMLDivElement | null>;
  mobile?: boolean;
  sheetReady?: boolean;
  /** The access strip is mounted. It can appear after the first framing
   *  (it waits for the river's own access data), and the observers above only
   *  watch overlays that existed when this effect ran, so its arrival must
   *  re-run the effect or the route's end can sit behind the strip. */
  stripReady?: boolean;
}) {
  const map = useMap();
  const [west, south, east, north] = bounds ?? [];
  const cameraIntent = useRef({ request, moved: false });
  useEffect(() => {
    if (preserveInitialCamera && request === 0) return;
    if (!place && (west === undefined || south === undefined || east === undefined || north === undefined)) return;
    let frame = 0;
    if (cameraIntent.current.request !== request) cameraIntent.current = { request, moved: false };
    const onMove = (event: { originalEvent?: Event }) => { if (event.originalEvent) cameraIntent.current.moved = true; };
    const takeControl = () => { cameraIntent.current.moved = true; cancelAnimationFrame(frame); };
    const focus = (animate = true) => {
      if (cameraIntent.current.moved) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cameraIntent.current.moved) return;
        const canvas = map.getCanvas().getBoundingClientRect();
        const panel = panelRef.current?.getBoundingClientRect();
        const strip = stripRef.current?.getBoundingClientRect();
        // Frame the usable map area, accounting for the actual panel, report,
        // controls and access strip rather than assuming a sidebar width.
        const sheet = sheetRef?.current?.getBoundingClientRect();
        const bottomOverlays = mobile ? [panel, strip, sheet] : [strip];
        const bottom = Math.max(24, ...bottomOverlays.filter(rect => rect && rect.height > 0)
          .map(rect => canvas.bottom - rect!.top + (mobile ? 32 : 24)));
        const padding = {
          left: !mobile && panel ? Math.min(canvas.width / 2, Math.max(24, panel.right - canvas.left + 24)) : 24,
          right: mobile ? 80 : 64,
          top: mobile ? 120 : 80,
          bottom: Math.min(Math.max(24, canvas.height - (mobile ? 220 : 180)), bottom),
        };
        const duration = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
        if (place) {
          map.flyTo({
            center: [place.coordinates.lng, place.coordinates.lat], zoom: Math.max(12, map.getZoom()),
            offset: [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2], duration,
          });
        } else if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
          // MapLibre's fit padding adjusts the calculated center without
          // retaining asymmetric camera padding for subsequent map gestures.
          map.fitBounds([[west, south], [east, north]], { padding, maxZoom: 12, duration });
        }
      });
    };
    focus();
    const resize = () => focus(false);
    const observer = new ResizeObserver(resize);
    if (panelRef.current) observer.observe(panelRef.current);
    if (stripRef.current) observer.observe(stripRef.current);
    if (sheetRef?.current) observer.observe(sheetRef.current);
    map.on('resize', resize);
    map.on('movestart', onMove);
    map.on('dragstart', takeControl);
    const canvas = map.getCanvas();
    canvas.addEventListener('pointerdown', takeControl);
    canvas.addEventListener('wheel', takeControl, { passive: true });
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      map.off('resize', resize); map.off('movestart', onMove); map.off('dragstart', takeControl);
      canvas.removeEventListener('pointerdown', takeControl); canvas.removeEventListener('wheel', takeControl);
    };
  }, [map, place, west, south, east, north, request, preserveInitialCamera, panelRef, stripRef, sheetRef, mobile, sheetReady, stripReady]);
  return null;
}
