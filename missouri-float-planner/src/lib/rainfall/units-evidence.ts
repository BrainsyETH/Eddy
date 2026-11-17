import { nativePixels } from './native-grid';
import type { Tile } from './research-contract';

/** What one inch is in the unit NOAA documents for this product. */
export const MM_PER_INCH = 25.4;

export interface UnitsSite { site: string; gaugeInches: number; rawValue: number; ratio: number }

/** One reading from the USGS `continuous` collection (parameter 00045, inches). */
interface UsgsReading {
  properties?: { monitoring_location_id?: string; time_series_id?: string; time?: string; value?: string | number | null };
  geometry?: { coordinates?: number[] } | null;
}

const project = (lon: number, lat: number) => [6378137 * lon * Math.PI / 180,
  6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];

/**
 * Compare a captured raw MRMS raster with the USGS rain gauges inside it.
 *
 * This is the replayable form of the question "is a raw cell value millimetres
 * or inches". Each gauge reports inches. If the raster is millimetres, the cell
 * over a gauge divided by that gauge's total is near 25.4; if it were inches it
 * would be near 1. Radar and a single gauge disagree storm to storm, so only
 * the middle of many gauges is used, never one pair.
 *
 * A gauge counts only when its record spans the raster's window and it caught
 * measurable rain. USGS marks bad samples with large negative or absurd values;
 * those drop the gauge rather than a reading, so a broken logger cannot pass as
 * a dry one.
 */
export function compareUnits(tiff: Uint8Array, tile: Tile, usgs: unknown, window: { start: string; end: string }, minimumInches = 0.2) {
  const pixels = nativePixels(tiff, tile);
  const start = Date.parse(window.start), end = Date.parse(window.end);
  // One entry per sensor record, not per site: a replaced sensor keeps its own
  // record, and adding the two together would double the rain.
  const series = new Map<string, { site: string; point: number[]; readings: { at: number; value: number }[] }>();
  for (const feature of ((usgs as { features?: UsgsReading[] }).features ?? [])) {
    const { monitoring_location_id: location, time_series_id: id, time, value } = feature.properties ?? {};
    const point = feature.geometry?.coordinates;
    if (!location || !id || !time || !point || point.length < 2) continue;
    const entry = series.get(id) ?? { site: location.replace(/^USGS-/, ''), point, readings: [] };
    entry.readings.push({ at: Date.parse(time), value: value == null || value === '' ? NaN : Number(value) });
    series.set(id, entry);
  }
  const perSite = new Map<string, number>();
  for (const entry of series.values()) perSite.set(entry.site, (perSite.get(entry.site) ?? 0) + 1);
  const sites: UnitsSite[] = [];
  let considered = 0;
  for (const entry of series.values()) {
    const readings = entry.readings.filter(r => Number.isFinite(r.at) && r.at > start && r.at <= end).sort((x, y) => x.at - y.at);
    if (!readings.length) continue;
    considered++;
    // Whole-window record: starts and ends within an hour of the raster's edges.
    if (readings[0].at - start > 3_600_000 || end - readings.at(-1)!.at > 3_600_000) continue;
    // Two records for one gauge leave no way to say which one is the rain.
    if (perSite.get(entry.site) !== 1) continue;
    if (readings.some(r => !Number.isFinite(r.value) || r.value < 0 || r.value > 3)) continue;
    const gaugeInches = readings.reduce((sum, r) => sum + r.value, 0);
    if (gaugeInches < minimumInches || gaugeInches > 20) continue;
    const [x, y] = project(entry.point[0], entry.point[1]);
    const column = Math.floor((x - tile.xmin) / tile.dx), row = Math.floor((tile.ymax - y) / tile.dy);
    if (column < 0 || row < 0 || column >= tile.width || row >= tile.height) continue;
    const rawValue = pixels[row * tile.width + column];
    if (rawValue == null || rawValue <= 0) continue;
    sites.push({ site: entry.site, gaugeInches, rawValue, ratio: rawValue / gaugeInches });
  }
  sites.sort((a, b) => a.ratio - b.ratio);
  const medianRatio = sites.length ? sites[Math.floor(sites.length / 2)].ratio : null;
  const lower = sites.length ? sites[Math.floor(sites.length / 4)].ratio : null;
  const upper = sites.length ? sites[Math.floor(sites.length * 3 / 4)].ratio : null;
  return { gaugesInWindow: considered, sites, medianRatio, middleHalf: lower == null || upper == null ? null : [lower, upper] as [number, number],
    missingPixels: pixels.filter(value => value == null).length, pixels: pixels.length };
}

/**
 * The unit question, answered without leaning on how accurate radar is.
 *
 * NOAA publishes the same product as a source file whose unit is documented as
 * millimetres. If the hosted raster's raw cell and that file's value agree at
 * every gauge, the hosted raw unit is millimetres, whatever the gauges caught.
 * `sourceValues` are that file read at the same gauges (see the evidence
 * folder's extract-source-values.py).
 */
export function compareSource(comparison: ReturnType<typeof compareUnits>, sourceValues: Record<string, number>) {
  const ratios = comparison.sites.filter(site => sourceValues[site.site] > 0)
    .map(site => site.rawValue / sourceValues[site.site]).sort((a, b) => a - b);
  if (!ratios.length) return { sites: 0, medianRatio: null, middleHalf: null };
  return { sites: ratios.length, medianRatio: ratios[Math.floor(ratios.length / 2)],
    middleHalf: [ratios[Math.floor(ratios.length / 4)], ratios[Math.floor(ratios.length * 3 / 4)]] as [number, number] };
}

/** Middle of (product value / gauge inches). 25.4 means millimetres and unbiased. */
export function gaugeRatio(comparison: ReturnType<typeof compareUnits>, productValues: Record<string, number>) {
  const ratios = comparison.sites.filter(site => productValues[site.site] > 0)
    .map(site => productValues[site.site] / site.gaugeInches).sort((a, b) => a - b);
  return ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
}
