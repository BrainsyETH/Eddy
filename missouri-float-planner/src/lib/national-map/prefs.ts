// src/lib/national-map/prefs.ts
// The River Map's own preferences and share links.
//
// SCOPED TO THIS EXPERIENCE. The planner's gauge layers live under
// eddy-web-gauge-layers-v1 / eddy-plan-map-filters-v1 (useNationalGauges); a
// wall display switching views or hiding details here must never change what
// /plan or the iOS app shows. Nothing here reads or writes those keys.
//
// Stored: view, appearance, motion, whether fullscreen shows details, and
// the Flow colour set (the vivid prototype is opt-in; see theme.ts).
// Never stored or restored: fullscreen itself, a tour, location, replay — the
// first-run experience is always the live national view.

import type { MapView } from './marks';

export const PREFS_KEY = 'eddy-river-map-prefs-v1';

export type Appearance = 'system' | 'light' | 'dark';
export type FlowColors = 'eddy' | 'vivid';

export interface MapPrefs {
  view: MapView;
  appearance: Appearance;
  motion: boolean;
  displayDetails: boolean;
  flowColors: FlowColors;
}

export const DEFAULT_PREFS: MapPrefs = {
  view: 'flow',
  appearance: 'system',
  motion: true,
  displayDetails: false,
  flowColors: 'eddy',
};

const VIEWS = new Set<MapView>(['flow', 'flooding']);
const APPEARANCES = new Set<Appearance>(['system', 'light', 'dark']);

export function parsePrefs(raw: string | null): MapPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<MapPrefs>;
    return {
      view: VIEWS.has(v.view as MapView) ? (v.view as MapView) : DEFAULT_PREFS.view,
      appearance: APPEARANCES.has(v.appearance as Appearance) ? (v.appearance as Appearance) : DEFAULT_PREFS.appearance,
      motion: typeof v.motion === 'boolean' ? v.motion : DEFAULT_PREFS.motion,
      displayDetails: typeof v.displayDetails === 'boolean' ? v.displayDetails : DEFAULT_PREFS.displayDetails,
      flowColors: v.flowColors === 'vivid' ? 'vivid' : 'eddy',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

// ── Share links ─────────────────────────────────────────────────────────────
// ?view=flooding&at=-92.10,38.20,4.5   (center lng, lat, zoom × national fit)
// Geography and view settings only — never favorites or anything personal.

export interface SharedView {
  view: MapView | null;
  center: { lng: number; lat: number; zoom: number } | null;
}

export function parseSharedView(search: string): SharedView {
  const params = new URLSearchParams(search);
  const v = params.get('view');
  const view = v && VIEWS.has(v as MapView) ? (v as MapView) : null;
  let center: SharedView['center'] = null;
  const at = params.get('at');
  if (at) {
    const [lng, lat, zoom] = at.split(',').map(Number);
    if (
      Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(zoom) &&
      Math.abs(lng) <= 180 && Math.abs(lat) <= 90 && zoom >= 1 && zoom <= 60
    ) {
      center = { lng, lat, zoom };
    }
  }
  return { view, center };
}

export function sharedViewQuery(view: MapView, center: SharedView['center']): string {
  const params = new URLSearchParams();
  if (view !== DEFAULT_PREFS.view) params.set('view', view);
  // The national overview is the default; only a zoomed view earns a location.
  if (center && center.zoom > 1.15) {
    params.set('at', `${center.lng.toFixed(3)},${center.lat.toFixed(3)},${center.zoom.toFixed(1)}`);
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}
