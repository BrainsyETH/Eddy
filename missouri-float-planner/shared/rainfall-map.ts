import type { RainDetail, RainMapContext } from './rainfall';
import { normalizeRain } from './rainfall';

export const RAIN_MAP_BANDS = ['0', '<0.1', '0.1–0.5', '0.5–1', '1–2', '2+'] as const;
export function rainMapBand(inches: number): number {
  return inches === 0 ? 0 : inches < 0.1 ? 1 : inches < 0.5 ? 2 : inches < 1 ? 3 : inches < 2 ? 4 : 5;
}
export function normalizeRainDetail(value: unknown, siteId: string): RainDetail | null {
  const summary = normalizeRain(value, siteId);
  if (!summary) return null;
  const detail = value as RainDetail;
  const geometry = detail.boundary?.geometry;
  if (geometry?.type !== 'MultiPolygon' || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) return null;
  let count = 0;
  for (const polygon of geometry.coordinates) {
    if (!Array.isArray(polygon) || !polygon.length) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      for (const coordinate of ring) {
        if (++count > 100_000 || !Array.isArray(coordinate) || coordinate.length < 2 || !coordinate.slice(0, 2).every(Number.isFinite)
          || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 85) return null;
      }
    }
  }
  const grid = detail.shading;
  if (grid && (![grid.xmin, grid.ymax, grid.dx, grid.dy].every(Number.isFinite) || grid.dx <= 0 || grid.dy <= 0
    || !Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width < 1 || grid.height < 1
    || grid.width * grid.height > 250_000 || !Array.isArray(grid.inches) || grid.inches.length !== grid.width * grid.height
    || !grid.inches.every(value => value === null || Number.isFinite(value) && value >= 0 && value <= 100)
    || Date.parse(grid.end) - Date.parse(grid.start) !== 24 * 3_600_000)) return null;
  const context = normalizeRainMapContext(detail.context);
  return { ...summary, context: context ?? undefined, boundary: detail.boundary, shading: summary.status === 'unavailable' ? null : grid };
}
export function normalizeRainMapContext(value: unknown): RainMapContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as RainMapContext;
  const coordinate = (p: number[]) => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
  const name = (text: string) => typeof text === 'string' && text.length > 0 && text.length <= 160;
  if (!context.river || !name(context.river.name) || !Array.isArray(context.river.lines) || !context.river.lines.length
    || context.river.lines.length > 100 || context.river.lines.some(line => !Array.isArray(line) || line.length < 2 || line.length > 20_000 || !line.every(coordinate))
    || context.river.lines.reduce((sum, line) => sum + line.length, 0) > 20_000
    || !Array.isArray(context.places) || context.places.length > 100 || context.places.some(place => !place || !name(place.name) || !coordinate(place.coordinates))) return null;
  return context;
}
const project = ([lon, lat]: number[]) => [6378137 * lon * Math.PI / 180,
  6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];

/** Identical north-up geography in native SVG and web SVG. Raster groups are
 * merged into six paths, rather than thousands of interactive map elements. */
export function rainfallMap(detail: RainDetail) {
  const rings = detail.boundary.geometry.coordinates.flat().map(ring => ring.map(project));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [px, py] of ring) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const scale = Math.min(280 / Math.max(1, maxX - minX), 230 / Math.max(1, maxY - minY));
  const x = (v: number) => 160 + (v - (minX + maxX) / 2) * scale;
  const y = (v: number) => 135 - (v - (minY + maxY) / 2) * scale;
  const path = rings.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join('') + 'Z').join('');
  const shading = Array<string>(6).fill('');
  const grid = detail.shading;
  if (grid) for (let i = 0; i < grid.inches.length; i++) {
    const value = grid.inches[i];
    if (value === null) continue;
    const left = x(grid.xmin + i % grid.width * grid.dx), top = y(grid.ymax - Math.floor(i / grid.width) * grid.dy);
    shading[rainMapBand(value)] += `M${left.toFixed(2)},${top.toFixed(2)}h${(grid.dx * scale).toFixed(2)}v${(grid.dy * scale).toFixed(2)}h${(-grid.dx * scale).toFixed(2)}Z`;
  }
  const position = (coordinates: number[]) => { const p = project(coordinates); return { x: x(p[0]), y: y(p[1]) }; };
  const gaugePosition = position(detail.basin.gauge);
  const context = normalizeRainMapContext(detail.context);
  const river = context?.river.lines.map(line => line.map((p, i) => { const at = position(p); return `${i ? 'L' : 'M'}${at.x.toFixed(2)},${at.y.toFixed(2)}`; }).join('')).join('') ?? '';
  const places: { name: string; x: number; y: number }[] = [];
  for (const place of context?.places ?? []) {
    const at = position(place.coordinates);
    if (at.x < 20 || at.x > 300 || at.y < 25 || at.y > 245 || Math.hypot(at.x - gaugePosition.x, at.y - gaugePosition.y) < 45
      || places.some(p => Math.hypot(p.x - at.x, p.y - at.y) < 65)) continue;
    places.push({ name: place.name, ...at });
    if (places.length === 3) break;
  }
  return { path, shading, river, places, riverName: context?.river.name, gauge: gaugePosition };
}
