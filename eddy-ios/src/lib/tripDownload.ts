// eddy-ios/src/lib/tripDownload.ts
// What to download for a trip's offline map, and whether it is complete.
//
// Pure, so the web suite tests it (missouri-float-planner/src/lib/
// trip-download.test.ts). The decisions are in ADR 0011
// (docs/decisions/0011-float-mode-offline-maps-use-tile-regions.md); this
// file is their arithmetic.
//
// A trip is cut into short chunks along the river line, each downloaded as its
// own padded rectangle, because the Mapbox wrapper only accepts rectangles and
// one rectangle around a diagonal river is mostly hills. Tiles shared between
// chunks are stored once.

import { boundsForLine, locateOnRoute, pointAt, type LngLat, type RouteIndex } from '@eddy/geo';

/** Starting values from ADR 0011; measure on devices before changing. */
export const CHUNK_METERS = 3_000;
export const PAD_METERS = 1_500;
export const BEYOND_ENDS_METERS = 1_000;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 15;
/** Points sampled along the line per chunk; enough to follow a bend. */
const SAMPLE_METERS = 150;

/**
 * The prefix every trip download carries. MUST NOT match packSweep's
 * `^river:[^:]+:\d+$`, which deletes the removed feature's packs.
 */
export const TRIP_PACK_PREFIX = 'float:';

export interface TripChunk {
  name: string;
  /** [[neLng, neLat], [swLng, swLat]], the order offlineManager.createPack takes. */
  bounds: [[number, number], [number, number]];
}

export function tripPackName(tripKey: string, chunk: number): string {
  return `${TRIP_PACK_PREFIX}${tripKey}:${chunk}`;
}

/** Does this pack belong to that trip? */
export function isTripPack(name: string, tripKey: string): boolean {
  return name.startsWith(`${TRIP_PACK_PREFIX}${tripKey}:`);
}

/**
 * Chunks covering the stretch between two points on the route, extended a
 * little past both ends, each padded on every side.
 */
export function planTripChunks(index: RouteIndex, tripKey: string, from: LngLat, to: LngLat): TripChunk[] {
  const a = locateOnRoute(index, from);
  const b = locateOnRoute(index, to);
  if (!a || !b) return [];
  const start = Math.max(0, Math.min(a.lineMeters, b.lineMeters) - BEYOND_ENDS_METERS);
  const end = Math.min(index.lengthMeters, Math.max(a.lineMeters, b.lineMeters) + BEYOND_ENDS_METERS);

  const chunks: TripChunk[] = [];
  for (let chunkStart = start, i = 0; chunkStart < end; chunkStart += CHUNK_METERS, i += 1) {
    const chunkEnd = Math.min(end, chunkStart + CHUNK_METERS);
    const points: LngLat[] = [];
    for (let m = chunkStart; m < chunkEnd; m += SAMPLE_METERS) points.push(pointAt(index, m));
    points.push(pointAt(index, chunkEnd));
    const box = boundsForLine(points);
    if (!box) continue;
    const [west, south, east, north] = pad(box, PAD_METERS);
    chunks.push({ name: tripPackName(tripKey, i), bounds: [[east, north], [west, south]] });
  }
  return chunks;
}

function pad([west, south, east, north]: [number, number, number, number], meters: number) {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((((south + north) / 2) * Math.PI) / 180));
  return [west - dLng, south - dLat, east + dLng, north + dLat] as const;
}

/** What offlineManager.getPacks() reports for one pack, as far as readiness needs. */
export interface PackStatus {
  name: string;
  requiredResourceCount: number;
  completedResourceCount: number;
  completedResourceSize: number;
}

export type TripDownloadState =
  | { kind: 'none' }
  | { kind: 'partial'; fraction: number; bytes: number }
  | { kind: 'ready'; bytes: number };

/**
 * Ready only when EVERY expected chunk exists and reports all of its resources
 * complete. A missing chunk, or one still counting, is partial. The ambient
 * cache never counts; only these packs do.
 */
export function tripDownloadState(expected: readonly string[], packs: readonly PackStatus[]): TripDownloadState {
  if (expected.length === 0) return { kind: 'none' };
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const found = expected.map((name) => byName.get(name)).filter((pack): pack is PackStatus => pack != null);
  if (found.length === 0) return { kind: 'none' };
  const bytes = found.reduce((sum, pack) => sum + pack.completedResourceSize, 0);
  const complete = found.filter((pack) => pack.requiredResourceCount > 0 && pack.completedResourceCount >= pack.requiredResourceCount);
  if (found.length === expected.length && complete.length === expected.length) return { kind: 'ready', bytes };
  const required = found.reduce((sum, pack) => sum + pack.requiredResourceCount, 0);
  const done = found.reduce((sum, pack) => sum + Math.min(pack.completedResourceCount, pack.requiredResourceCount), 0);
  // Chunks not started yet count as nothing done.
  const fraction = required > 0 ? (done / required) * (found.length / expected.length) : 0;
  return { kind: 'partial', fraction, bytes };
}
