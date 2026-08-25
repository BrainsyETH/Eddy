// scripts/lib/nhd.ts
//
// Shared NHD HR flowline handling: download a HUC8 shapefile from USGS TNM,
// keep the flowlines belonging to one named river, and dissolve them into a
// single upstream→downstream LineString.
//
// Extracted verbatim from scripts/import-nhd-rivers-from-tnm.ts when
// scripts/ingestion/build-tailwater-geometry.ts needed the same dissolve. The
// bridging tolerance in particular is a tuned value with a river behind it
// (see CHAIN_BRIDGE_TOLERANCE_DEG) — a second copy of it would drift from
// this one silently, and the failure mode is "the exported river is missing
// its main stem", which looks like a data problem rather than a code one.
//
// shpjs's CJS bundle references browser-only `self`. Any caller that loads
// shpjs must polyfill it before the dynamic import; see loadFlowlines below,
// which does it for them.

import { createWriteStream, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { length as turfLength, lineString as turfLine } from '@turf/turf';

/** Perennial stream, connector, and unspecified stream/river.
 *
 * 46000 is required for rivers like War Eagle Creek whose middle reach is
 * tagged 46000 — excluding it splits the main stem and drops the lower half. */
export const FCODE_PERENNIAL = new Set([46006, 55800, 46000]);

/** Douglas-Peucker tolerance, ~50 m at Missouri latitude. */
export const SIMPLIFY_TOLERANCE_DEG = 0.0005;

// After component-by-component chaining, bridge chains whose endpoints
// are within ~1.2 km of each other. NHD HR has small (~50–500 m)
// digitization gaps that split rivers like Eleven Point into 9
// components at exact-coordinate hashing. Without bridging, the longest
// single component gets exported, which for Eleven Point is the AR
// portion — dropping the entire MO main stem.
export const CHAIN_BRIDGE_TOLERANCE_DEG = 0.012;

export const TNM_BASE =
  'https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/HU8/Shape';

export interface SegFeature {
  geometry: { type: string; coordinates: number[][] };
  properties: { gnis_name?: string; fcode?: number };
}

export function pointKey(c: number[]): string {
  return c[0].toFixed(7) + ',' + c[1].toFixed(7);
}

export function distDeg(a: number[], b: number[]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export async function ensureZip(huc: string, cacheDir: string): Promise<string> {
  const path = join(cacheDir, `${huc}.zip`);
  if (existsSync(path)) return path;
  const url = `${TNM_BASE}/NHD_H_${huc}_HU8_Shape.zip`;
  console.log(`  ↓ Downloading HUC ${huc} from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) throw new Error('No body');
  // @ts-expect-error Node 18+ ReadableStream → web stream interop
  await pipeline(res.body, createWriteStream(path));
  return path;
}

/**
 * Download (or reuse) each HUC8 and return the flowlines whose gnis_name is in
 * `wantedNames` and whose fcode is perennial. An HU8 zip carries ~50k
 * flowlines, so filtering here rather than holding whole HUCs is deliberate.
 */
export async function loadFlowlines(
  hucs: string[],
  wantedNames: Set<string>,
  cacheDir: string,
  log: (msg: string) => void = () => {},
): Promise<Map<string, SegFeature[]>> {
  // shpjs's CJS bundle references browser-only `self`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).self = globalThis;
  const shpModule = (await import('shpjs')) as unknown as {
    default: (b: ArrayBuffer) => Promise<Array<{ fileName: string; features: SegFeature[] }>>;
  };
  const shp = shpModule.default;

  const byHuc = new Map<string, SegFeature[]>();
  for (const huc of new Set(hucs)) {
    const zipPath = await ensureZip(huc, cacheDir);
    const buf = readFileSync(zipPath);
    const layers = await shp(buf.buffer);
    const flow = layers.find((l) => l.fileName === 'Shape/NHDFlowline');
    if (!flow) {
      log(`  HUC ${huc}: no NHDFlowline layer`);
      byHuc.set(huc, []);
      continue;
    }
    const kept = flow.features.filter(
      (f) =>
        f.properties.gnis_name != null &&
        wantedNames.has(f.properties.gnis_name) &&
        f.properties.fcode != null &&
        FCODE_PERENNIAL.has(f.properties.fcode),
    );
    log(`HUC ${huc} · ${flow.features.length} flowlines · ${kept.length} kept`);
    byHuc.set(huc, kept);
  }
  return byHuc;
}

/**
 * Build connected components by endpoint hash, walk each into a chain,
 * then greedily bridge chains whose endpoints are within
 * CHAIN_BRIDGE_TOLERANCE_DEG of each other (so NHD HR digitization gaps
 * don't split a river like Eleven Point into 9 disconnected components).
 *
 * Returns [] if input is empty or all degenerate.
 */
export function dissolveLongest(segs: SegFeature[]): number[][] {
  const segCoords = segs
    .map((f) => f.geometry?.coordinates)
    .filter((c): c is number[][] => Array.isArray(c) && c.length >= 2)
    .map((c) => c.map((p) => [p[0], p[1]] as [number, number]));
  if (!segCoords.length) return [];

  // Union-find by exact-shared endpoints.
  const epIdx = new Map<string, number[]>();
  for (let i = 0; i < segCoords.length; i++) {
    const sk = pointKey(segCoords[i][0]);
    const ek = pointKey(segCoords[i][segCoords[i].length - 1]);
    (epIdx.get(sk) ?? epIdx.set(sk, []).get(sk)!).push(i);
    (epIdx.get(ek) ?? epIdx.set(ek, []).get(ek)!).push(i);
  }
  const parent = Array.from({ length: segCoords.length }, (_, i) => i);
  const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  epIdx.forEach((list) => {
    for (let i = 1; i < list.length; i++) union(list[0], list[i]);
  });
  const comps = new Map<number, number[]>();
  for (let i = 0; i < segCoords.length; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(i);
  }

  // Walk each component into a chain.
  type Chain = { coords: number[][]; lengthKm: number };
  const chains: Chain[] = [];
  comps.forEach((idxs) => {
    const sub = idxs.map((i: number) => segCoords[i]);
    const coords = chainComponent(sub);
    if (coords.length < 2) return;
    const lengthKm = turfLength(turfLine(coords), { units: 'kilometers' });
    chains.push({ coords, lengthKm });
  });
  if (!chains.length) return [];

  // Greedy bridge: starting from the longest chain, repeatedly absorb
  // any other chain whose endpoint is within CHAIN_BRIDGE_TOLERANCE_DEG
  // of one of our endpoints. Concatenate in the appropriate orientation.
  // We stop only when nothing else can be reached.
  chains.sort((a, b) => b.lengthKm - a.lengthKm);
  const main = chains[0];
  const used = new Set<number>([0]);
  let workCoords = main.coords.slice();
  // Repeatedly scan for chains whose start or end is near workCoords' head
  // or tail. tol is in WGS84 degrees, anisotropic at MO latitudes but the
  // tolerance is a generous bound (~1.2 km) so the approximation is fine.
  let progressed = true;
  while (progressed) {
    progressed = false;
    const head = workCoords[0];
    const tail = workCoords[workCoords.length - 1];
    type BridgeMode = 'prepend' | 'prepend-rev' | 'append' | 'append-rev';
    let bestIdx = -1;
    let bestDist = CHAIN_BRIDGE_TOLERANCE_DEG;
    let bestMode: BridgeMode = 'append';
    for (let i = 1; i < chains.length; i++) {
      if (used.has(i)) continue;
      const c = chains[i].coords;
      const cs = c[0], ce = c[c.length - 1];
      const candidates: Array<{ d: number; mode: BridgeMode }> = [
        { d: distDeg(tail, cs), mode: 'append' },
        { d: distDeg(tail, ce), mode: 'append-rev' },
        { d: distDeg(head, ce), mode: 'prepend' },
        { d: distDeg(head, cs), mode: 'prepend-rev' },
      ];
      for (const ca of candidates) {
        if (ca.d < bestDist) { bestDist = ca.d; bestIdx = i; bestMode = ca.mode; }
      }
    }
    if (bestIdx >= 0) {
      const c = chains[bestIdx].coords;
      switch (bestMode) {
        case 'append':      workCoords = workCoords.concat(c); break;
        case 'append-rev':  workCoords = workCoords.concat(c.slice().reverse()); break;
        case 'prepend':     workCoords = c.concat(workCoords); break;
        case 'prepend-rev': workCoords = c.slice().reverse().concat(workCoords); break;
      }
      used.add(bestIdx);
      progressed = true;
    }
  }
  return workCoords;
}

/**
 * Walk a single connected component upstream→downstream into a LineString.
 * Picks an endpoint of degree 1 as the head (the upstream-most leaf),
 * falls back to seg 0 if the component is a closed loop.
 */
export function chainComponent(segs: number[][][]): number[][] {
  const startMap = new Map<string, number[]>();
  const degree = new Map<string, number>();
  for (let i = 0; i < segs.length; i++) {
    const sk = pointKey(segs[i][0]);
    const ek = pointKey(segs[i][segs[i].length - 1]);
    degree.set(sk, (degree.get(sk) ?? 0) + 1);
    degree.set(ek, (degree.get(ek) ?? 0) + 1);
    if (!startMap.has(sk)) startMap.set(sk, []);
    startMap.get(sk)!.push(i);
  }
  let head = -1;
  degree.forEach((deg, pt) => {
    if (head < 0 && deg === 1 && startMap.has(pt)) head = startMap.get(pt)![0];
  });
  if (head < 0) head = 0;

  const merged: number[][] = [];
  const visited = new Set<number>();
  let cur: number = head;
  while (cur >= 0 && !visited.has(cur)) {
    visited.add(cur);
    const seg = segs[cur];
    if (!merged.length) merged.push(...seg);
    else merged.push(...seg.slice(1));
    const ek = pointKey(seg[seg.length - 1]);
    const candidates = (startMap.get(ek) ?? []).filter((n) => !visited.has(n));
    cur = candidates[0] ?? -1;
  }
  // Append leftovers whose start matches our tail.
  for (let i = 0; i < segs.length; i++) {
    if (visited.has(i)) continue;
    const seg = segs[i];
    if (merged.length && pointKey(merged[merged.length - 1]) === pointKey(seg[0])) {
      merged.push(...seg.slice(1));
      visited.add(i);
    }
  }
  return merged;
}
