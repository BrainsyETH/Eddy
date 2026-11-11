import { area, bbox, bboxPolygon, featureCollection, intersect, toMercator, toWgs84 } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { validateTiff, type Tile } from './research-contract';
import { RAIN_MIN_COVERAGE } from '@shared/rainfall';

/** Our captured contract is uncompressed, single-band F32. Refuse other TIFF
 * encodings; never interpret a rendered image or an implicit sparse block as 0. */
export function nativePixels(bytes: Uint8Array, tile: Tile): (number | null)[] {
  validateTiff(bytes, tile);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint16(0) === 0x4949;
  const ifd = view.getUint32(4, little), entries = view.getUint16(ifd, little);
  const tags = new Map<number, number[]>();
  for (let i = 0; i < entries; i++) {
    const at = ifd + 2 + 12 * i, tag = view.getUint16(at, little), type = view.getUint16(at + 2, little), count = view.getUint32(at + 4, little);
    if (![259, 273, 278, 279, 317, 322, 323, 324, 325].includes(tag)) continue;
    if (![3, 4].includes(type) || count > 8192) throw new Error('Unsupported TIFF layout');
    const size = type === 3 ? 2 : 4, offset = count * size <= 4 ? at + 8 : view.getUint32(at + 8, little);
    tags.set(tag, Array.from({ length: count }, (_, j) => size === 2 ? view.getUint16(offset + j * size, little) : view.getUint32(offset + j * size, little)));
  }
  if ((tags.get(259)?.[0] ?? 1) !== 1 || (tags.get(317)?.[0] ?? 1) !== 1) throw new Error('Unsupported compressed TIFF');
  const tiled = tags.has(324);
  const offsets = tags.get(tiled ? 324 : 273)!, counts = tags.get(tiled ? 325 : 279)!;
  const width = tiled ? tags.get(322)?.[0] : tile.width;
  const height = tags.get(tiled ? 323 : 278)?.[0] ?? tile.height;
  if (!width || !height || width > 2048 || height > 2048) throw new Error('Invalid TIFF blocks');
  const across = Math.ceil(tile.width / width);
  if (offsets.length !== across * Math.ceil(tile.height / height)) throw new Error('Missing TIFF blocks');
  const pixels = Array<number | null>(tile.width * tile.height).fill(null);
  for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
    const block = Math.floor(y / height) * across + Math.floor(x / width);
    if (offsets[block] === 0 && counts[block] === 0) continue;
    const at = ((y % height) * width + x % width) * 4;
    if (at + 4 > counts[block]) throw new Error('Truncated TIFF block');
    const value = view.getFloat32(offsets[block] + at, little);
    pixels[y * tile.width + x] = Number.isFinite(value) && value >= 0 ? value : null;
  }
  return pixels;
}

/** Clip boundary cells in their native grid, then measure geodesic area.
 * Denominator includes the entire basin, including cells outside this tile. */
export function basinWeights(boundary: Feature<MultiPolygon>, tile: Tile, deadline = Date.now() + 15_000) {
  const projected = toMercator(boundary), box = bbox(projected), totalArea = area(boundary);
  const left = Math.max(0, Math.floor((box[0] - tile.xmin) / tile.dx));
  const right = Math.min(tile.width, Math.ceil((box[2] - tile.xmin) / tile.dx));
  const top = Math.max(0, Math.floor((tile.ymax - box[3]) / tile.dy));
  const bottom = Math.min(tile.height, Math.ceil((tile.ymax - box[1]) / tile.dy));
  if (!(totalArea > 0)) throw new Error('Invalid basin area');
  const cells: { index: number; area: number }[] = [];
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (Date.now() > deadline) throw new Error('Basin weighting exceeded its time budget');
    const xmin = tile.xmin + x * tile.dx, ymax = tile.ymax - y * tile.dy;
    const clipped = intersect(featureCollection<Polygon | MultiPolygon>([projected, bboxPolygon([xmin, ymax - tile.dy, xmin + tile.dx, ymax])]));
    if (clipped) {
      const squareMeters = area(toWgs84(clipped));
      if (squareMeters > 0) cells.push({ index: y * tile.width + x, area: squareMeters });
    }
  }
  return { totalArea, cells, left, top, width: right - left, height: bottom - top };
}
export function weightedRain(pixels: readonly (number | null)[], weights: ReturnType<typeof basinWeights>) {
  let validArea = 0, weightedMm = 0;
  for (const cell of weights.cells) {
    const value = pixels[cell.index];
    if (value == null || !Number.isFinite(value) || value < 0) continue;
    validArea += cell.area; weightedMm += value * cell.area;
  }
  const coverage = Math.min(1, validArea / weights.totalArea);
  return { coverage, inches: coverage >= RAIN_MIN_COVERAGE && validArea > 0 ? weightedMm / validArea / 25.4 : null };
}
