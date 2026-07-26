// packages/eddy-geo/index.ts
// Web Mercator tile maths for offline map packs.
//
// WHY THIS IS SHARED: the app needs it to tell a user how big a download will be
// before they commit, and the backend may want to expose the same number through
// an API. One implementation, so the estimate a user sees and the estimate we
// plan against can never disagree.
//
// WHY IT MATTERS AT ALL: a river's bounding box is a rectangle, but a river is a
// line. The Current River's bbox spans roughly 1.2° of latitude by 0.9° of
// longitude — mostly land nowhere near the water. Downloading that whole
// rectangle at trail-level zoom is enormous and almost entirely waste. These
// helpers exist to quantify that before we ship a "Download" button that
// silently eats a gigabyte of someone's cellular plan.

/** [minLng, minLat, maxLng, maxLat] — the order /api/rivers/[slug] returns. */
export type Bounds = [number, number, number, number];

const MAX_LAT = 85.0511287798066; // Web Mercator clamp

export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

/** Tiles covering `bounds` at a single zoom level. */
export function tileCountAtZoom(bounds: Bounds, zoom: number): number {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const x0 = lngToTileX(minLng, zoom);
  const x1 = lngToTileX(maxLng, zoom);
  // Tile Y is inverted relative to latitude: the north edge gives the smaller Y.
  const y0 = latToTileY(maxLat, zoom);
  const y1 = latToTileY(minLat, zoom);
  return (Math.abs(x1 - x0) + 1) * (Math.abs(y1 - y0) + 1);
}

/** Tiles across an inclusive zoom range — what an offline pack downloads. */
export function tileCountForRange(bounds: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = Math.min(minZoom, maxZoom); z <= Math.max(minZoom, maxZoom); z++) {
    total += tileCountAtZoom(bounds, z);
  }
  return total;
}

/**
 * Rough download size. Vector tiles vary hugely with feature density — a tile
 * over farmland is a fraction of one over a town — so this is deliberately a
 * coarse average, useful for "about 40 MB", not for a progress bar.
 */
const AVG_VECTOR_TILE_BYTES = 35 * 1024;

export function estimateBytes(tileCount: number, avgTileBytes = AVG_VECTOR_TILE_BYTES): number {
  return tileCount * avgTileBytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/**
 * Expands bounds by a buffer in kilometres.
 *
 * Longitude degrees shrink with latitude, so the lng buffer is divided by
 * cos(lat) — without that, a buffer that looks right in Missouri would be far
 * too narrow further north.
 */
export function bufferBounds(bounds: Bounds, km: number): Bounds {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const latDelta = km / 111.32;
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  const lngDelta = km / (111.32 * cos);
  return [
    minLng - lngDelta,
    Math.max(-MAX_LAT, minLat - latDelta),
    maxLng + lngDelta,
    Math.min(MAX_LAT, maxLat + latDelta),
  ];
}

/** Tight bounds around a set of coordinates. */
export function boundsForLine(coordinates: Array<[number, number]>): Bounds | null {
  if (!coordinates.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coordinates) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Splits a line into per-chunk boxes that follow the river.
 *
 * This is the payload reduction that makes offline viable: several smaller boxes
 * along the corridor cover the water while skipping the empty rectangle corners
 * a single bbox would download. Mapbox can hold multiple regions, so a river
 * becomes a handful of packs rather than one oversized one.
 */
export function corridorBoxes(
  coordinates: Array<[number, number]>,
  chunkSize = 64,
  bufferKm = 2
): Bounds[] {
  if (coordinates.length === 0) return [];
  const boxes: Bounds[] = [];
  for (let i = 0; i < coordinates.length; i += chunkSize) {
    // Overlap by one point so consecutive boxes share an edge and leave no gap
    // mid-river.
    const chunk = coordinates.slice(i, i + chunkSize + 1);
    const box = boundsForLine(chunk);
    if (box) boxes.push(bufferBounds(box, bufferKm));
  }
  return boxes;
}

/** Total tiles for a set of corridor boxes across a zoom range. */
export function tileCountForBoxes(boxes: Bounds[], minZoom: number, maxZoom: number): number {
  return boxes.reduce((sum, box) => sum + tileCountForRange(box, minZoom, maxZoom), 0);
}
