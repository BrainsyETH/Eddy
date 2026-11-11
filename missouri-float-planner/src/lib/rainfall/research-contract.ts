import { createHash } from 'node:crypto';
import { bbox, booleanPointInPolygon, point, pointOnFeature, toMercator } from '@turf/turf';
import type { Feature, MultiPolygon } from 'geojson';
import { rasterGrid, selectMrmsRaster } from './source-contract';

export const RESEARCH_BUCKET = 'rainfall-research';
export const MAX_BYTES = 16 * 1024 * 1024;
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export type Basin = {
  id: string; gauge_id: string; usgs_site_id: string;
  geometry: Feature<MultiPolygon>; provenance: Record<string, unknown>;
  forecast_points: number[][];
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected source object');
  return value as Record<string, unknown>;
}

/** Exploratory points, NOT an area-weighted forecast or a coverage claim. */
export function samplePoints(basin: Feature<MultiPolygon>): number[][] {
  const [west, south, east, north] = bbox(basin);
  const candidates: number[][] = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    const p = [west + (x + 0.5) * (east - west) / 15, south + (y + 0.5) * (north - south) / 15];
    if (booleanPointInPolygon(point(p), basin)) candidates.push(p);
  }
  const chosen = [pointOnFeature(basin).geometry.coordinates.slice(0, 2)];
  while (chosen.length < 9 && candidates.length) {
    // Spread samples over the basin; preserve exact coordinates for replay.
    const score = (p: number[]) => Math.min(...chosen.map(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2));
    candidates.sort((a, b) => score(b) - score(a));
    if (score(candidates[0]) === 0) break;
    chosen.push(candidates.shift()!);
  }
  return chosen;
}

/** One regional tile preserves every basin's pixels without duplicate downloads. */
export function nativeTile(basins: Basin[], grid: ReturnType<typeof rasterGrid>) {
  if (!basins.length) throw new Error('No research basins');
  const boxes = basins.map(b => bbox(toMercator(b.geometry)));
  const dx = grid.pixelSize.x, dy = grid.pixelSize.y, ox = grid.origin.x, oy = grid.origin.y;
  const xmin = ox + Math.floor((Math.min(...boxes.map(b => b[0])) - ox) / dx) * dx;
  const xmax = ox + Math.ceil((Math.max(...boxes.map(b => b[2])) - ox) / dx) * dx;
  const ymin = oy + Math.floor((Math.min(...boxes.map(b => b[1])) - oy) / dy) * dy;
  const ymax = oy + Math.ceil((Math.max(...boxes.map(b => b[3])) - oy) / dy) * dy;
  const width = Math.round((xmax - xmin) / dx), height = Math.round((ymax - ymin) / dy);
  if (width < 1 || height < 1 || width > 2048 || height > 2048
    || xmin < grid.extent.xmin || xmax > grid.extent.xmax || ymin < grid.extent.ymin || ymax > grid.extent.ymax) {
    throw new Error('Research region exceeds native tile limits');
  }
  return { xmin, ymin, xmax, ymax, width, height, dx, dy };
}
export type Tile = ReturnType<typeof nativeTile>;
export function exportParameters(tile: Tile, raster: ReturnType<typeof selectMrmsRaster>) {
  return new URLSearchParams({
    f: 'image', bbox: [tile.xmin, tile.ymin, tile.xmax, tile.ymax].join(','), bboxSR: '3857', imageSR: '3857',
    size: `${tile.width},${tile.height}`, format: 'tiff', compression: 'None', pixelType: 'F32',
    interpolation: 'RSP_NearestNeighbor', adjustAspectRatio: 'false',
    renderingRule: JSON.stringify({ rasterFunction: 'None' }), mosaicRule: JSON.stringify(raster.mosaicRule),
  });
}
export function exportResult(value: unknown, tile: Tile): string {
  const data = object(value), extent = object(data.extent), sr = object(extent.spatialReference);
  if (data.width !== tile.width || data.height !== tile.height || ![3857, 102100].includes(Number(sr.latestWkid ?? sr.wkid))
    || (['xmin', 'ymin', 'xmax', 'ymax'] as const).some(k => typeof extent[k] !== 'number' || Math.abs(Number(extent[k]) - tile[k]) > 0.01)) {
    throw new Error('NOAA changed the requested grid');
  }
  const url = new URL(String(data.href));
  if (url.origin !== 'https://mapservices.weather.noaa.gov' || !url.pathname.startsWith('/raster/')) throw new Error('Unexpected NOAA download URL');
  return url.href;
}

/** Verify actual TIFF tags too: a JSON envelope alone cannot prove native F32. */
export function validateTiff(bytes: Uint8Array, tile: Tile): void {
  if (bytes.byteLength < 8 || bytes.byteLength > MAX_BYTES) throw new Error('Invalid TIFF size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint16(0) === 0x4949;
  if ((!little && view.getUint16(0) !== 0x4d4d) || view.getUint16(2, little) !== 42) throw new Error('Expected classic TIFF');
  const ifd = view.getUint32(4, little), entries = view.getUint16(ifd, little);
  const tags = new Map<number, number[]>();
  for (let i = 0; i < entries; i++) {
    const at = ifd + 2 + i * 12, tag = view.getUint16(at, little), type = view.getUint16(at + 2, little), n = view.getUint32(at + 4, little);
    if (![256, 257, 258, 273, 277, 279, 324, 325, 339, 33550, 33922, 34735].includes(tag)) continue;
    const size = ({ 3: 2, 4: 4, 12: 8 } as Record<number, number>)[type];
    if (!size || n > 8192) throw new Error('Unexpected TIFF tag');
    const offset = n * size <= 4 ? at + 8 : view.getUint32(at + 8, little);
    tags.set(tag, Array.from({ length: n }, (_, j) => type === 12 ? view.getFloat64(offset + j * size, little)
      : type === 3 ? view.getUint16(offset + j * size, little) : view.getUint32(offset + j * size, little)));
  }
  const scale = tags.get(33550) ?? [], tie = tags.get(33922) ?? [], keys = tags.get(34735) ?? [];
  const offsets = tags.get(273) ?? tags.get(324) ?? [], counts = tags.get(279) ?? tags.get(325) ?? [];
  if (!offsets.length || offsets.length !== counts.length
    // ArcGIS emits sparse TIFFs: paired zero offset/count is an implicit block,
    // not a truncated download. Preserve the file's own nodata metadata.
    || offsets.some((offset, i) => !(offset === 0 && counts[i] === 0)
      && (offset < 8 || counts[i] < 1 || offset + counts[i] > bytes.length))) throw new Error('Incomplete TIFF pixel blocks');
  const projected = Array.from({ length: Math.floor((keys.length - 4) / 4) }, (_, i) => keys.slice(4 + i * 4, 8 + i * 4))
    .some(k => k[0] === 3072 && k[1] === 0 && k[2] === 1 && k[3] === 3857);
  if (tags.get(256)?.[0] !== tile.width || tags.get(257)?.[0] !== tile.height || tags.get(258)?.[0] !== 32
    || (tags.get(277)?.[0] ?? 1) !== 1 || tags.get(339)?.[0] !== 3 || !projected
    || scale.length < 2 || tie.length < 6 || tie[0] !== 0 || tie[1] !== 0
    || Math.abs(scale[0] - tile.dx) > 0.00001 || Math.abs(scale[1] - tile.dy) > 0.00001
    || Math.abs(tie[3] - tile.xmin) > 0.01 || Math.abs(tie[4] - tile.ymax) > 0.01) throw new Error('TIFF is not the requested native F32 grid');
}

export function forecastUrl(value: unknown): string {
  const url = new URL(String(value));
  if (url.origin !== 'https://api.weather.gov' || !/^\/gridpoints\/[A-Z]{3}\/\d+,\d+$/.test(url.pathname) || url.search || url.hash) throw new Error('Unexpected NWS grid URL');
  return url.href;
}
export function interval(value: unknown): { start: string; end: string } {
  if (typeof value !== 'string') throw new Error('Invalid forecast interval');
  const [start, duration, extra] = value.split('/');
  const match = duration?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  const ms = match ? ((Number(match[1] ?? 0) * 24 + Number(match[2] ?? 0)) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0)) * 1000 : 0;
  const begin = Date.parse(start);
  if (extra || !Number.isFinite(begin) || ms <= 0 || ms > 14 * 86400_000) throw new Error('Invalid forecast interval');
  return { start: new Date(begin).toISOString(), end: new Date(begin + ms).toISOString() };
}
export function forecastMetadata(value: unknown, now: number) {
  const p = object(object(value).properties), qpf = object(p.quantitativePrecipitation);
  const issued = Date.parse(String(p.updateTime));
  if (!Number.isFinite(issued) || issued > now + 600_000 || qpf.uom !== 'wmoUnit:mm' || !Array.isArray(qpf.values) || !qpf.values.length) throw new Error('Invalid NWS precipitation contract');
  const spans = qpf.values.map(v => {
    const row = object(v);
    if (row.value !== null && (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0)) throw new Error('Invalid forecast amount');
    return interval(row.validTime);
  });
  return { issuedAt: new Date(issued).toISOString(), start: spans.map(s => s.start).sort()[0], end: spans.map(s => s.end).sort().at(-1)!,
    stale: now - issued > 12 * 3600_000, units: 'mm', intervalCount: spans.length,
    missingIntervals: qpf.values.filter(v => object(v).value === null).length };
}
