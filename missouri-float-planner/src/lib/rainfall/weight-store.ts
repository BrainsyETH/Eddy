import { gunzipSync, gzipSync } from 'node:zlib';
import { area } from '@turf/turf';
import type { Feature, MultiPolygon } from 'geojson';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { basinWeights } from './native-grid';
import { hash, MAX_BYTES, RESEARCH_BUCKET, type Tile } from './research-contract';

// Bump when the geometry/area algorithm changes. No timestamp or rain product
// belongs in this identity: weights depend only on shape and native grid.
export const WEIGHT_VERSION = 2;
export type BasinWeights = ReturnType<typeof basinWeights>;
export function weightKey(boundary: Feature<MultiPolygon>, tile: Tile): string {
  const grid = [tile.xmin, tile.ymin, tile.xmax, tile.ymax, tile.dx, tile.dy, tile.width, tile.height];
  if (!grid.every(Number.isFinite) || !Number.isInteger(tile.width) || !Number.isInteger(tile.height)
    || tile.width <= 0 || tile.height <= 0 || tile.width * tile.height > 400_000 || tile.dx <= 0 || tile.dy <= 0
    || Math.abs(tile.xmax - tile.xmin - tile.width * tile.dx) > 0.01
    || Math.abs(tile.ymax - tile.ymin - tile.height * tile.dy) > 0.01) throw new Error('Invalid weight grid');
  return `weights/v${WEIGHT_VERSION}/${hash(JSON.stringify([WEIGHT_VERSION, 3857, boundary.geometry, grid]))}.json.gz`;
}

function decode(bytes: Uint8Array, key: string, boundary: Feature<MultiPolygon>, tile: Tile): BasinWeights {
  if (bytes.length > MAX_BYTES) throw new Error('Rain weights exceed size limit');
  const payload = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_BYTES }).toString());
  const w = payload.weights as BasinWeights;
  if (payload.version !== WEIGHT_VERSION || payload.key !== key || !w || payload.sha256 !== hash(JSON.stringify(w))
    || !Number.isFinite(w.totalArea) || w.totalArea <= 0 || Math.abs(w.totalArea / area(boundary) - 1) > 1e-10
    || ![w.left, w.top, w.width, w.height].every(v => Number.isInteger(v) && v >= 0)
    || w.left + w.width > tile.width || w.top + w.height > tile.height
    || !Array.isArray(w.cells) || w.cells.length > tile.width * tile.height) throw new Error('Invalid prepared rain weights');
  let previous = -1;
  for (const cell of w.cells) {
    const x = cell.index % tile.width, y = Math.floor(cell.index / tile.width);
    if (!Number.isInteger(cell.index) || cell.index <= previous || x < w.left || x >= w.left + w.width
      || y < w.top || y >= w.top + w.height || !Number.isFinite(cell.area) || cell.area <= 0) throw new Error('Invalid prepared rain cell');
    previous = cell.index;
  }
  return w;
}

/** Read-only hourly path. A cache miss never falls back to expensive clipping. */
export async function loadPreparedWeights(db: SupabaseClient, boundary: Feature<MultiPolygon>, tile: Tile): Promise<BasinWeights> {
  const key = weightKey(boundary, tile);
  const { data, error } = await db.storage.from(RESEARCH_BUCKET).download(key);
  if (error) throw new Error(`Prepared rain weights unavailable: ${error.message}`);
  if (!data || data.size > MAX_BYTES) throw new Error('Prepared rain weights unavailable or oversized');
  return decode(new Uint8Array(await data.arrayBuffer()), key, boundary, tile);
}

/** Explicit preparation step; immutable, private, and verified by readback. */
export async function savePreparedWeights(db: SupabaseClient, boundary: Feature<MultiPolygon>, tile: Tile, weights: BasinWeights): Promise<string> {
  const key = weightKey(boundary, tile), sha256 = hash(JSON.stringify(weights));
  const bytes = gzipSync(JSON.stringify({ version: WEIGHT_VERSION, key, sha256, weights }));
  decode(bytes, key, boundary, tile);
  const { error } = await db.storage.from(RESEARCH_BUCKET).upload(key, bytes, { contentType: 'application/gzip', upsert: false });
  if (error && !['409', 'Duplicate', 'ResourceAlreadyExists'].includes(String('statusCode' in error ? error.statusCode : ''))
    && !/already exists/i.test(error.message)) throw error;
  const saved = await loadPreparedWeights(db, boundary, tile);
  if (hash(JSON.stringify(saved)) !== sha256) throw new Error('Prepared rain weights readback mismatch');
  return key;
}
