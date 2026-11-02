// src/lib/national-map/geometry.ts
// The national map's static geometry asset (public/river-map/geometry/*.json),
// written by scripts/build-national-map-geometry.ts and decoded in the browser.
//
// Everything is already projected into the landscape composite frame
// (projection.ts), so the browser never projects a river vertex — it applies
// a per-component layout affine and the camera. Coordinates are integers in
// 1/quant frame pixels, delta-encoded along each line or ring.
//
// Geometry is CONTEXT, never measurement: a river line here says where water
// runs, not how much or how fast. Measured status belongs to gauges.

import type { Bounds, MapComponent } from './projection';

export const GEOMETRY_VERSION = 1;

export interface GeoPolygon {
  /** State code, for states. */
  c?: string;
  k: MapComponent;
  /** Rings, each delta-encoded [x0, y0, dx1, dy1, …]. */
  r: number[][];
}

export interface GeoLine {
  k: MapComponent;
  /** Strahler order (1–7). */
  o: number;
  /** Index into `names`, or -1. */
  n: number;
  /** Delta-encoded vertices, digitized downstream. */
  p: number[];
}

export interface GeometryFile {
  v: typeof GEOMETRY_VERSION;
  quant: number;
  source: Record<string, string>;
  components: Record<MapComponent, Bounds>;
  states: GeoPolygon[];
  lakes: GeoPolygon[];
  rivers: GeoLine[];
  names: string[];
}

export interface DecodedLine {
  component: MapComponent;
  order: number;
  name: string | null;
  /** Interleaved x,y in landscape-frame pixels. */
  xy: Float32Array;
  /** Cumulative length at the last vertex, frame px (for downstream traces). */
  length: number;
}

export interface DecodedPolygon {
  code: string | null;
  component: MapComponent;
  rings: Float32Array[];
}

export interface DecodedGeometry {
  components: Record<MapComponent, Bounds>;
  states: DecodedPolygon[];
  lakes: DecodedPolygon[];
  rivers: DecodedLine[];
  source: Record<string, string>;
}

export function decodeDelta(encoded: number[], quant: number): Float32Array {
  const out = new Float32Array(encoded.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    x += encoded[i];
    y += encoded[i + 1];
    out[i] = x / quant;
    out[i + 1] = y / quant;
  }
  return out;
}

function lineLength(xy: Float32Array): number {
  let len = 0;
  for (let i = 2; i + 1 < xy.length; i += 2) len += Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]);
  return len;
}

const COMPONENTS = new Set<MapComponent>(['l48', 'ak', 'hi']);

export function decodeGeometry(body: unknown): DecodedGeometry {
  if (!body || typeof body !== 'object') throw new Error('Geometry is not an object');
  const g = body as Partial<GeometryFile>;
  if (g.v !== GEOMETRY_VERSION || typeof g.quant !== 'number' || !g.components) {
    throw new Error('Unsupported geometry');
  }
  const quant = g.quant;
  const names = Array.isArray(g.names) ? g.names : [];
  const poly = (p: GeoPolygon): DecodedPolygon | null =>
    COMPONENTS.has(p.k) && Array.isArray(p.r)
      ? { code: p.c ?? null, component: p.k, rings: p.r.map((r) => decodeDelta(r, quant)) }
      : null;
  return {
    components: g.components,
    source: g.source ?? {},
    states: (g.states ?? []).map(poly).filter((p): p is DecodedPolygon => p !== null),
    lakes: (g.lakes ?? []).map(poly).filter((p): p is DecodedPolygon => p !== null),
    rivers: (g.rivers ?? [])
      .filter((l) => COMPONENTS.has(l.k) && Array.isArray(l.p) && l.p.length >= 4)
      .map((l) => {
        const xy = decodeDelta(l.p, quant);
        return {
          component: l.k,
          order: l.o,
          name: l.n >= 0 ? names[l.n] ?? null : null,
          xy,
          length: lineLength(xy),
        };
      }),
  };
}
