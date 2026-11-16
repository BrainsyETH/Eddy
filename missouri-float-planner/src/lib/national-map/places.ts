// src/lib/national-map/places.ts
// A PLACE the map can be scoped to: a state, or a USGS water-resources region
// (the 2-digit hydrologic unit — Ohio, Missouri, Arkansas-White-Red…), which
// follows rivers rather than state lines.
//
// Membership is the same rule everywhere — the map, the stories, the counts
// and the recorder's per-region flood counts (frame.ts `fcr`):
//   * a USGS gauge belongs to its own state and its HUC's region;
//   * an NWS point no gauge claims belongs to NOAA's state for it, and to no
//     water-resources region (NOAA reports none).
//
// Pure, no DOM.

import type { DecodedGeometry, DecodedLine, DecodedPolygon } from './geometry';
import type { Site } from './marks';
import type { Bounds, MapComponent } from './projection';
import { regionCountKey } from './trend';

export type PlaceKind = 'state' | 'basin';

export interface Place {
  kind: PlaceKind;
  /** Postal code ('MO') or 2-digit region ('05'). */
  id: string;
  name: string;
  /** URL and count key: 'MO' or 'huc05'. */
  key: string;
}

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** USGS water-resources regions (HUC2) in the map's scope; 21 (Caribbean) is outside it. */
export const BASIN_NAMES: Record<string, string> = {
  '01': 'New England',
  '02': 'Mid-Atlantic',
  '03': 'South Atlantic-Gulf',
  '04': 'Great Lakes',
  '05': 'Ohio',
  '06': 'Tennessee',
  '07': 'Upper Mississippi',
  '08': 'Lower Mississippi',
  '09': 'Souris-Red-Rainy',
  '10': 'Missouri',
  '11': 'Arkansas-White-Red',
  '12': 'Texas-Gulf',
  '13': 'Rio Grande',
  '14': 'Upper Colorado',
  '15': 'Lower Colorado',
  '16': 'Great Basin',
  '17': 'Pacific Northwest',
  '18': 'California',
  '19': 'Alaska',
  '20': 'Hawaii',
};

export function statePlace(code: string): Place | null {
  const name = STATE_NAMES[code];
  return name ? { kind: 'state', id: code, name, key: regionCountKey('state', code) } : null;
}

export function basinPlace(id: string): Place | null {
  const name = BASIN_NAMES[id];
  return name ? { kind: 'basin', id, name: `${name} region`, key: regionCountKey('basin', id) } : null;
}

/** 'MO' → Missouri; 'huc05' → the Ohio region; anything else → null. */
export function parsePlace(v: string | null | undefined): Place | null {
  if (!v) return null;
  const m = /^huc(\d{2})$/i.exec(v.trim());
  if (m) return basinPlace(m[1]);
  return statePlace(v.trim().toUpperCase());
}

export function placeOptions(): { states: Place[]; basins: Place[] } {
  return {
    states: Object.keys(STATE_NAMES)
      .map((c) => statePlace(c)!)
      .sort((a, b) => a.name.localeCompare(b.name)),
    basins: Object.keys(BASIN_NAMES).map((id) => basinPlace(id)!),
  };
}

export function inPlace(site: Pick<Site, 'stateCode' | 'huc2'>, place: Place): boolean {
  return place.kind === 'state' ? site.stateCode === place.id : (site.huc2 ?? null) === place.id;
}

/** 1 for each site in the place, 0 otherwise. */
export function placeMembers(sites: Site[], place: Place): Uint8Array {
  const out = new Uint8Array(sites.length);
  sites.forEach((s, i) => (out[i] = inPlace(s, place) ? 1 : 0));
  return out;
}

export interface PlaceExtent {
  component: MapComponent;
  /** Projected (landscape-frame) bounds. */
  bounds: Bounds;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

/**
 * Where the place is, per component, in projected coordinates: a state's
 * outline; a water-resources region's member gauges (1st–99th percentile, so
 * one mis-coded gauge cannot stretch the frame across the country).
 */
export function placeExtent(geometry: DecodedGeometry, sites: Site[], members: Uint8Array, place: Place): PlaceExtent[] {
  if (place.kind === 'state') {
    const by = new Map<MapComponent, Bounds>();
    for (const st of geometry.states) {
      if (st.code !== place.id) continue;
      const b = by.get(st.component) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const ring of st.rings) {
        for (let i = 0; i + 1 < ring.length; i += 2) {
          b.minX = Math.min(b.minX, ring[i]);
          b.maxX = Math.max(b.maxX, ring[i]);
          b.minY = Math.min(b.minY, ring[i + 1]);
          b.maxY = Math.max(b.maxY, ring[i + 1]);
        }
      }
      by.set(st.component, b);
    }
    return [...by].map(([component, bounds]) => ({ component, bounds }));
  }
  const pts = new Map<MapComponent, { xs: number[]; ys: number[] }>();
  sites.forEach((s, i) => {
    if (!members[i]) return;
    const p = pts.get(s.component) ?? pts.set(s.component, { xs: [], ys: [] }).get(s.component)!;
    p.xs.push(s.x);
    p.ys.push(s.y);
  });
  const out: PlaceExtent[] = [];
  for (const [component, { xs, ys }] of pts) {
    if (xs.length < 3) continue;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    out.push({ component, bounds: { minX: quantile(xs, 0.01), maxX: quantile(xs, 0.99), minY: quantile(ys, 0.01), maxY: quantile(ys, 0.99) } });
  }
  return out;
}

/** The place's largest span in frame px (spacing rules scale with it). */
export function extentSpan(extent: PlaceExtent[]): number {
  let span = 0;
  for (const e of extent) span = Math.max(span, e.bounds.maxX - e.bounds.minX, e.bounds.maxY - e.bounds.minY);
  return span;
}

/** The state outlines for a place (the map's mask), or [] for a water-resources region. */
export function placePolygons(geometry: DecodedGeometry, place: Place): DecodedPolygon[] {
  return place.kind === 'state' ? geometry.states.filter((s) => s.code === place.id) : [];
}

/** Even-odd point-in-polygon over a state's rings (projected coordinates). */
export function inPolygons(polys: DecodedPolygon[], component: MapComponent, x: number, y: number): boolean {
  let inside = false;
  for (const p of polys) {
    if (p.component !== component) continue;
    for (const ring of p.rings) {
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i * 2];
        const yi = ring[i * 2 + 1];
        const xj = ring[j * 2];
        const yj = ring[j * 2 + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Which water-resources region each river line drains, by its nearest gauges:
 * a few points along the line vote with the HUC of the closest gauge on the
 * same component. Gauges sit on rivers, so the nearest one is almost always
 * on the same river; a line far from any gauge (> `maxDist` frame px) gets
 * null. Used to keep a region's trails and journeys on its own rivers.
 */
export function lineRegions(lines: DecodedLine[], sites: Site[], maxDist = 6, cell = 6): Array<string | null> {
  const grid = new Map<string, number[]>();
  const key = (c: MapComponent, gx: number, gy: number) => `${c}:${gx}:${gy}`;
  sites.forEach((s, i) => {
    if (!s.huc2) return;
    const k = key(s.component, Math.floor(s.x / cell), Math.floor(s.y / cell));
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  const nearest = (c: MapComponent, x: number, y: number): string | null => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let best: string | null = null;
    let bestD = maxDist;
    const reach = Math.ceil(maxDist / cell);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (const i of grid.get(key(c, gx + dx, gy + dy)) ?? []) {
          const d = Math.hypot(sites[i].x - x, sites[i].y - y);
          if (d < bestD) {
            bestD = d;
            best = sites[i].huc2 ?? null;
          }
        }
      }
    }
    return best;
  };
  return lines.map((l) => {
    const n = l.xy.length / 2;
    if (!n) return null;
    const votes = new Map<string, number>();
    const samples = Math.min(7, n);
    for (let k = 0; k < samples; k++) {
      const v = Math.round((k / Math.max(1, samples - 1)) * (n - 1));
      const h = nearest(l.component, l.xy[v * 2], l.xy[v * 2 + 1]);
      if (h) votes.set(h, (votes.get(h) ?? 0) + 1);
    }
    let best: string | null = null;
    let most = 0;
    for (const [h, c] of votes) {
      if (c > most) {
        most = c;
        best = h;
      }
    }
    return best;
  });
}
