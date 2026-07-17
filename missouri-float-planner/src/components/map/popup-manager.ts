// src/components/map/popup-manager.ts
// One popup at a time, across every marker/layer component.
//
// Each component manages its own maplibregl.Popup, and marker tap handlers
// stopPropagation() so a tap on marker B never fires the map click that
// would have closed popup A — which is how a gauge card and a river
// condition card ended up stacked on top of each other. Routing every
// popup open through this presenter closes whatever else is showing first.

import type maplibregl from 'maplibre-gl';

let current: maplibregl.Popup | null = null;

// Escape dismisses whatever card is showing — same key that closes the
// Filters panel. Registered once, on the first present (client-only by
// construction: presentPopup runs from map event handlers).
let escBound = false;
function ensureEscapeHandler(): void {
  if (escBound || typeof document === 'undefined') return;
  escBound = true;
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !current) return;
    try {
      current.remove();
    } catch {
      // A popup whose map is gone throws harmlessly.
    }
    current = null;
  });
}

/** Show `popup` at `lngLat`, closing any other managed popup first. */
export function presentPopup(
  map: maplibregl.Map,
  popup: maplibregl.Popup,
  lngLat: [number, number] | maplibregl.LngLat,
): void {
  ensureEscapeHandler();
  if (current && current !== popup) {
    try {
      current.remove();
    } catch {
      // A popup whose map is gone throws harmlessly.
    }
  }
  current = popup;
  popup.setLngLat(lngLat).addTo(map);
}

/** Close a managed popup (no-op if it isn't the one showing). */
export function dismissPopup(popup: maplibregl.Popup): void {
  try {
    popup.remove();
  } catch {
    // ignore
  }
  if (current === popup) current = null;
}
