// src/lib/national-map/locator.ts
// The story card's locator: a small map of the country (or of the region on
// show) with the featured gauge marked, so a viewer across the room can tie
// the card to a place without hunting for the spotlight ring.
//
// Built once per geometry load from the state outlines already in the base
// geometry, through the standard landscape layout (Alaska and Hawaii in their
// usual corner). Vertices closer than `minStep` px are dropped — at card size
// the full outline would only cost DOM.
//
// Pure, no DOM.

import type { DecodedGeometry } from './geometry';
import { applyAffine, buildLayout, type Bounds, type Layout, type MapComponent } from './projection';

export interface Locator {
  /** SVG viewBox of the whole composition. */
  viewBox: Bounds;
  states: Array<{ code: string | null; d: string; box: Bounds }>;
  layout: Layout;
}

export function buildLocator(geometry: DecodedGeometry, minStep = 1.4): Locator {
  const layout = buildLayout('landscape', geometry.components);
  const states = geometry.states.map((st) => {
    const a = layout.affine[st.component];
    const box: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    let d = '';
    for (const ring of st.rings) {
      let lx = NaN;
      let ly = NaN;
      let n = 0;
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const [x, y] = applyAffine(a, ring[i], ring[i + 1]);
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y);
        box.maxY = Math.max(box.maxY, y);
        if (n > 0 && Math.hypot(x - lx, y - ly) < minStep && i + 2 < ring.length) continue;
        d += `${n === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        lx = x;
        ly = y;
        n++;
      }
      if (n >= 3) d += 'Z';
    }
    return { code: st.code, d, box };
  });
  return { viewBox: layout.bounds, states, layout };
}

/** Where a site (component-projected coordinates) sits on the locator. */
export function locatorPoint(loc: Locator, component: MapComponent, x: number, y: number): [number, number] {
  return applyAffine(loc.layout.affine[component], x, y);
}

/** The viewBox for a set of states (a region), padded; the whole composition when none match. */
export function locatorBox(loc: Locator, codes: string[] | null, pad = 0.12): Bounds {
  if (!codes?.length) return loc.viewBox;
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of loc.states) {
    if (!s.code || !codes.includes(s.code)) continue;
    b.minX = Math.min(b.minX, s.box.minX);
    b.minY = Math.min(b.minY, s.box.minY);
    b.maxX = Math.max(b.maxX, s.box.maxX);
    b.maxY = Math.max(b.maxY, s.box.maxY);
  }
  if (!Number.isFinite(b.minX)) return loc.viewBox;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const p = Math.max(w, h) * pad;
  return { minX: b.minX - p, minY: b.minY - p, maxX: b.maxX + p, maxY: b.maxY + p };
}
