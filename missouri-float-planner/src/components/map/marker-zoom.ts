// src/components/map/marker-zoom.ts
// Zoom-aware treatment for DOM markers: at state-level framing markers
// shrink and dim slightly so the map reads as a map, not a pin cloud; by
// reach-level framing they're back to full size. Continuous in zoom (no
// popping), cheap (style writes on tens of elements per zoom frame).
//
// Split responsibilities to dodge conflicts:
//   scale   → the INNER visible circle (MapLibre owns the outer element's
//             transform for positioning; hover handlers never set
//             transform, so nothing fights it)
//   opacity → the OUTER marker element (hover handlers set the circle's
//             opacity, so the outer element keeps the zoom dim intact)
//
// `pinned` entries (selected put-in/take-out, highlighted gauges) always
// render at full prominence — they're the user's anchors.

import type maplibregl from 'maplibre-gl';

export interface ZoomFadeEntry {
  /** Outer marker element (owned by maplibregl.Marker). */
  el: HTMLElement;
  /** Inner visible circle. */
  circle: HTMLElement;
  /** Keep at full size/opacity regardless of zoom. */
  pinned?: boolean;
}

const ZOOM_LO = 8.75; // fully compact at/below (state framing)
const ZOOM_HI = 10.5; // fully expanded at/above (reach framing)
const MIN_SCALE = 0.72;
const MIN_OPACITY = 0.85;

/** Attach the zoom listener and apply once. Returns a detach fn. */
export function attachMarkerZoomFade(
  map: maplibregl.Map,
  entries: ZoomFadeEntry[],
): () => void {
  const apply = () => {
    const z = map.getZoom();
    const t = Math.max(0, Math.min(1, (z - ZOOM_LO) / (ZOOM_HI - ZOOM_LO)));
    const scale = MIN_SCALE + (1 - MIN_SCALE) * t;
    const opacity = MIN_OPACITY + (1 - MIN_OPACITY) * t;
    for (const { el, circle, pinned } of entries) {
      if (pinned) continue;
      circle.style.transform = t >= 1 ? '' : `scale(${scale})`;
      el.style.opacity = t >= 1 ? '' : String(opacity);
    }
  };
  map.on('zoom', apply);
  apply();
  return () => {
    map.off('zoom', apply);
  };
}
