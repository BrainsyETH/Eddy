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

/** Only explicit navigation fits bounds. Inspection only reveals a covered pin. */
export function PlannerMapFocus({ place, bounds, request, mode, callout = false, preserveInitialCamera, panelRef, stripRef, sheetRef, mobile = false, sheetReady = false, stripReady = false }: {
  place: PlannerMapPlace | null;
  bounds?: [number, number, number, number];
  request: number;
  mode: 'bounds' | 'locate' | 'reveal' | 'none';
  callout?: boolean;
  preserveInitialCamera: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  stripRef: RefObject<HTMLDivElement | null>;
  sheetRef?: RefObject<HTMLDivElement | null>;
  mobile?: boolean;
  sheetReady?: boolean;
  stripReady?: boolean;
}) {
  const map = useMap();
  const [west, south, east, north] = bounds ?? [];
  const intent = useRef({ request, moved: false, framed: false });
  useEffect(() => {
    if (mode === 'none' || (preserveInitialCamera && request === 0)) return;
    if (intent.current.request !== request) intent.current = { request, moved: false, framed: false };
    let frame = 0;
    let pendingResize = false;
    const takeControl = () => { intent.current.moved = true; cancelAnimationFrame(frame); };
    // Under cooperative gestures a plain wheel scrolls the page, not the map;
    // only a modified wheel (MapLibre's bypass key) is the user taking over.
    const takeControlOnWheel = (event: WheelEvent) => {
      if (map.cooperativeGestures.isEnabled() && !event.ctrlKey && !event.metaKey) return;
      takeControl();
    };
    const focus = (animate = true) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (intent.current.moved || (mode === 'bounds' && intent.current.framed)) return;
        if (intent.current.framed && map.isMoving()) { pendingResize = true; return; }
        // The mobile sheet animates to its measured detent after mounting.
        // Fit once with its final height, rather than framing behind it and
        // then moving the camera again when the animation finishes.
        if (mobile && sheetReady && sheetRef?.current?.getAnimations().some(animation => animation.playState === 'running')) return;
        const canvas = map.getCanvas().getBoundingClientRect();
        const panel = panelRef.current?.getBoundingClientRect();
        const strip = stripRef.current?.getBoundingClientRect();
        const sheet = sheetRef?.current?.getBoundingClientRect();
        const overlays = (mobile ? [panel, strip, sheet] : [strip]).filter(rect => rect && rect.height > 0);
        const bottom = Math.max(32, ...overlays.map(rect => canvas.bottom - rect!.top + 32));
        const left = !mobile && panel ? Math.max(24, panel.right - canvas.left + 24) : 24;
        const padding = { left, right: mobile ? 64 : 64, top: mobile ? 150 : 100,
          bottom: Math.min(Math.max(32, canvas.height - 220), bottom) };
        const duration = (!animate && intent.current.framed) || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
        if (mode === 'locate' && place && !intent.current.framed) {
          intent.current.framed = true;
          const centerY = (canvas.height + padding.top - padding.bottom) / 2;
          const popupHeight = map.getContainer().querySelector('.planner-place-popup')?.getBoundingClientRect().height ?? 320;
          const targetY = callout ? Math.min(canvas.height - padding.bottom - 24, Math.max(centerY, popupHeight + 28 + 120)) : centerY;
          map.easeTo({ center: [place.coordinates.lng, place.coordinates.lat], zoom: Math.max(12, map.getZoom()),
            offset: [(padding.left - padding.right) / 2, targetY - canvas.height / 2], duration });
        } else if ((mode === 'reveal' || mode === 'locate') && place) {
          const point = map.project([place.coordinates.lng, place.coordinates.lat]);
          // Keep the callout above its pin and clear of the sidebar. For a
          // plain selection reserve only its marker and label; never zoom in.
          const minX = Math.min(canvas.width / 2 + 80, padding.left + (callout ? 150 : 96));
          const maxX = Math.max(minX, canvas.width - padding.right - (callout ? 150 : 96));
          // 28px matches the popup's anchor offset; 120px clears the report
          // and route chips at the top of the map.
          // The selected marker's combined name/role label can wrap to two
          // lines. Keep that label above the sheet as well as the icon itself.
          const minY = Math.min(canvas.height - padding.bottom - 56, callout ? (map.getContainer().querySelector('.planner-place-popup')?.getBoundingClientRect().height ?? 320) + 28 + 120 : padding.top);
          const maxY = Math.max(minY, canvas.height - padding.bottom - 56);
          const x = Math.min(maxX, Math.max(minX, point.x));
          const y = Math.min(maxY, Math.max(minY, point.y));
          if (Math.abs(point.x - x) > 1 || Math.abs(point.y - y) > 1) {
            intent.current.framed = true;
            map.panBy([point.x - x, point.y - y], { duration });
          }
        } else if (mode === 'bounds' && west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
          intent.current.framed = true;
          // A short linear ease keeps orientation; no zoom-out/zoom-in flight.
          map.fitBounds([[west, south], [east, north]], { padding, maxZoom: 12, duration, linear: true });
        }
      });
    };
    focus();
    const resize = () => {
      // A card may expand while an intentional search ease is in progress.
      // Check its final size once that move finishes instead of losing the
      // notification or interrupting the navigation animation.
      if (map.isMoving()) { pendingResize = true; return; }
      pendingResize = false;
      focus(false);
    };
    const finishMove = () => { if (pendingResize) resize(); };
    // Ignore the observer's initial notification: it must not cancel the
    // deliberate navigation animation scheduled above.
    let observed = false;
    const observer = new ResizeObserver(() => {
      if (!observed) { observed = true; return; }
      resize();
    });
    for (const ref of [panelRef, stripRef, sheetRef]) if (ref?.current) observer.observe(ref.current);
    const sheetElement = sheetRef?.current;
    sheetElement?.addEventListener('transitionend', resize);
    map.getContainer().addEventListener('planner-selection-resize', resize);
    map.on('resize', resize);
    map.on('moveend', finishMove);
    map.on('dragstart', takeControl);
    const canvas = map.getCanvas();
    canvas.addEventListener('pointerdown', takeControl);
    canvas.addEventListener('wheel', takeControlOnWheel, { passive: true });
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      sheetElement?.removeEventListener('transitionend', resize);
      map.getContainer().removeEventListener('planner-selection-resize', resize);
      map.off('resize', resize); map.off('moveend', finishMove); map.off('dragstart', takeControl);
      canvas.removeEventListener('pointerdown', takeControl); canvas.removeEventListener('wheel', takeControlOnWheel);
    };
  }, [map, place, west, south, east, north, request, mode, callout, preserveInitialCamera, panelRef, stripRef, sheetRef, mobile, sheetReady, stripReady]);
  return null;
}
