import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { multiPolygon, toWgs84 } from '@turf/turf';
import { normalizeRain, rainAmount, rainAt, rainBars, rainReadout, RAIN_HOUR, type RainSummary } from '@shared/rainfall';
import { normalizeRainDetail, rainfallMap } from '@shared/rainfall-map';
import { distinctReadContext, readPreview } from '@shared/read-presentation';
import { basinWeights, nativePixels, weightedRain } from './native-grid';
import { publicRainSite, RAIN_RELEASE } from './public-policy';
import type { Tile } from './research-contract';

const end = Date.parse('2026-11-11T18:00:00Z');
const rows = Array.from({ length: 24 }, (_, i) => ({ start: new Date(end - (24 - i) * RAIN_HOUR).toISOString(),
  end: new Date(end - (23 - i) * RAIN_HOUR).toISOString(), inches: 0.03, coverage: 1 }));
const summary: RainSummary = { version: 1, siteId: '07065495', updatedAt: new Date(end).toISOString(), status: 'ready',
  basin: { name: 'Jacks Fork at Alley Spring', areaSqMi: 298, gauge: [-91.45, 37.15] }, hourly: rows,
  totals: [{ hours: 24, start: rows[0].start, end: rows.at(-1)!.end, inches: 0.72, coverage: 1 }] };

test('hourly rain retains small amounts; six-hour bars sum only complete, nonoverlapping hours', () => {
  assert.equal(rainAmount(0.03), '0.03 in'); assert.equal(rainAmount(0.003), '<0.01 in');
  assert.equal(rainAmount(0), '0.00 in'); assert.equal(rainAmount(null), 'Unavailable');
  const bars = rainBars(rows, end - 24 * RAIN_HOUR, end, 6);
  assert.equal(bars.length, 4); bars.forEach(bar => assert.ok(Math.abs(bar.inches! - 0.18) < 1e-10));
  assert.equal(rainAt(bars, end - 18 * RAIN_HOUR), bars[0]);
  assert.equal(rainAt(bars, end + 1), null, 'observed rain never extends into the future');
  assert.equal(rainReadout(bars[0]), 'Rain upstream: 0.18 in · 6h total');
});
test('missing, duplicate, low-coverage and rolling totals cannot become rain bars', () => {
  const window = [end - 24 * RAIN_HOUR, end] as const;
  assert.equal(rainBars(rows.slice(1), ...window, 6)[0].inches, null);
  assert.equal(rainBars([...rows, rows[0]], ...window, 6)[0].inches, null);
  assert.equal(rainBars([{ ...rows[0], coverage: 0.5 }, ...rows.slice(1)], ...window, 6)[0].inches, null);
  assert.ok(rainBars(summary.totals, ...window, 1).every(row => row.inches === null));
  assert.equal(rainReadout(null), 'Rain data unavailable');
});
test('public responses reject another station and invalid amounts; stale totals stay unknown', () => {
  assert.ok(normalizeRain(summary, summary.siteId, end));
  assert.equal(normalizeRain(summary, '07063000', end), null);
  assert.equal(normalizeRain({ ...summary, hourly: [{ ...rows[0], inches: -3 }] }, summary.siteId, end), null);
  const stale = normalizeRain(summary, summary.siteId, end + 4 * RAIN_HOUR)!;
  assert.equal(stale.status, 'unavailable'); assert.equal(stale.totals[0].inches, null);
  assert.equal(normalizeRain({ ...summary, totals: [{ ...summary.totals[0], coverage: 0.4 }] }, summary.siteId, end)!.totals[0].inches, null);
});
test('weighted rain clips partial boundary pixels and includes missing area in the denominator', () => {
  const tile: Tile = { xmin: 0, ymin: 0, xmax: 2000, ymax: 1000, dx: 1000, dy: 1000, width: 2, height: 1 };
  const basin = toWgs84(multiPolygon([[[[0, 0], [1500, 0], [1500, 1000], [0, 1000], [0, 0]]]]));
  const weights = basinWeights(basin, tile);
  assert.equal(weights.cells.length, 2);
  const full = weightedRain([0, 50.8], weights);
  assert.ok(Math.abs(full.coverage - 1) < 1e-6);
  assert.ok(Math.abs(full.inches! - 2 / 3) < 1e-6, 'half a pixel must not carry the weight of a full one');
  const missing = weightedRain([0, null], weights);
  assert.ok(Math.abs(missing.coverage - 2 / 3) < 1e-6); assert.equal(missing.inches, null);
  assert.equal(weightedRain([0, 0], weights).inches, 0);
});
test('native captured TIFF decodes sparse blocks as missing and retains genuine zero', () => {
  const directory = '../docs/validation/rainfall/2026-11-11-review/';
  const evidence = JSON.parse(readFileSync(`${directory}native-archive-probe.json`, 'utf8'));
  const bytes = gunzipSync(readFileSync(`${directory}native-archive-probe.tiff.gz`));
  const pixels = nativePixels(bytes, evidence.tile);
  assert.equal(pixels.length, evidence.tile.width * evidence.tile.height);
  assert.ok(pixels.some(value => value === null)); assert.ok(pixels.some(value => value === 0));
  assert.ok(pixels.every(value => value === null || Number.isFinite(value) && value >= 0));
  assert.throws(() => nativePixels(bytes, { ...evidence.tile, dx: 573 }));
});
test('the published map uses the same boundary and clips native cells, with bounded inputs', () => {
  const boundary = multiPolygon([[[[-91.6, 37], [-91.3, 37], [-91.3, 37.3], [-91.6, 37.3], [-91.6, 37]]]]);
  const current = { ...summary, updatedAt: new Date().toISOString(), boundary, shading: null };
  const detail = normalizeRainDetail(current, summary.siteId)!;
  assert.ok(detail); const map = rainfallMap(detail);
  assert.ok(map.path.startsWith('M')); assert.ok(map.gauge.x > 0 && map.gauge.x < 320);
  assert.equal(map.shading.length, 6); assert.ok(map.shading.every(path => path === ''));
  assert.equal(normalizeRainDetail({ ...current, boundary: { geometry: { type: 'LineString', coordinates: [] } } }, summary.siteId), null);
  assert.equal(normalizeRainDetail({ ...current, boundary: { geometry: { type: 'MultiPolygon', coordinates: [] } } }, summary.siteId), null);
});
test('an environment flag alone never approves research data for public display', () => {
  const original = process.env.RAINFALL_PUBLIC_ENABLED;
  process.env.RAINFALL_PUBLIC_ENABLED = 'true';
  try { assert.equal(publicRainSite(summary.siteId), null); assert.equal(RAIN_RELEASE.unitsEvidence, null); }
  finally { if (original === undefined) delete process.env.RAINFALL_PUBLIC_ENABLED; else process.env.RAINFALL_PUBLIC_ENABLED = original; }
});
test('a compact Read preserves decimals and leaves longer context reachable', () => {
  const read = 'The gauge is at 3.82 ft. It is easing down. Rain upstream is still worth watching.';
  assert.equal(readPreview(read), 'The gauge is at 3.82 ft. It is easing down.');
  assert.equal(distinctReadContext(read, 'It is easing down.'), null);
  assert.equal(distinctReadContext(read, 'Wind picks up this afternoon.'), 'Wind picks up this afternoon.');
  assert.ok(readPreview('A long report '.repeat(60)).length <= 320);
});
