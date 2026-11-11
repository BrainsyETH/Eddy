import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { multiPolygon, toWgs84 } from '@turf/turf';
import { normalizeRain, rainAmount, rainAt, rainBars, rainReadout, rainMaximum, RAIN_HOUR, type RainSummary } from '@shared/rainfall';
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
  assert.equal(rainReadout(bars[0]), 'Rain upstream: 0.18 in · 6 hours total');
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
test('native captured TIFF decodes sparse blocks as zero when no nodata tag is present', () => {
  const directory = '../docs/validation/rainfall/2026-11-11-review/';
  const evidence = JSON.parse(readFileSync(`${directory}native-archive-probe.json`, 'utf8'));
  const bytes = gunzipSync(readFileSync(`${directory}native-archive-probe.tiff.gz`));
  const pixels = nativePixels(bytes, evidence.tile);
  assert.equal(pixels.length, evidence.tile.width * evidence.tile.height);
  assert.equal(pixels.filter(value => value === null).length, 0);
  assert.equal(pixels.filter(value => value === 0).length, 194312);
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

test('current six-hour bar includes complete hours so far without hiding rain or filling a gap', () => {
  const from = end - 6 * RAIN_HOUR, to = end - RAIN_HOUR;
  const bar = rainBars(rows, from, to, 6)[0];
  assert.equal(bar.end, new Date(to).toISOString()); assert.equal(bar.partial, true);
  assert.ok(Math.abs(bar.inches! - 0.15) < 1e-10);
  assert.match(rainReadout(bar), /5 hours so far/);
  assert.equal(rainBars(rows.filter(row => Date.parse(row.start) !== from + RAIN_HOUR), from, to, 6)[0].inches, null);
  assert.equal(rainAt([bar], to + 1), null);
  assert.equal(rainMaximum([{ ...bar, inches: 0.13 }], 6), 1);
  assert.equal(rainMaximum([{ ...bar, inches: 0.13 }], 1), 0.25);
  assert.equal(rainMaximum([{ ...bar, inches: 2.1 }], 6), 3);
});

function withNodata(bytes: Uint8Array, raw: string) {
  // Add a real GDAL_NODATA ASCII entry while retaining the NOAA block layout.
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const old = input.getUint32(4, true), count = input.getUint16(old, true);
  const value = new TextEncoder().encode(raw + '\0'), next = bytes.length;
  const offset = next + 2 + (count + 1) * 12 + 4;
  const result = new Uint8Array(offset + value.length); result.set(bytes);
  const view = new DataView(result.buffer); view.setUint32(4, next, true); view.setUint16(next, count + 1, true);
  result.set(bytes.subarray(old + 2, old + 2 + count * 12), next + 2);
  const entry = next + 2 + count * 12;
  view.setUint16(entry, 42113, true); view.setUint16(entry + 2, 2, true); view.setUint32(entry + 4, value.length, true);
  if (value.length <= 4) result.set(value, entry + 8);
  else { view.setUint32(entry + 8, offset, true); result.set(value, offset); }
  return result;
}
test('nodata tags mask sparse blocks and explicit sentinel values, never erase genuine dry pixels', () => {
  const directory = '../docs/validation/rainfall/2026-11-11-review/';
  const evidence = JSON.parse(readFileSync(`${directory}native-archive-probe.json`, 'utf8'));
  const bytes = gunzipSync(readFileSync(`${directory}native-archive-probe.tiff.gz`));
  for (const nodata of ['-9999', 'nan', '9999']) {
    const pixels = nativePixels(withNodata(bytes, nodata), evidence.tile);
    assert.equal(pixels.filter(value => value === null).length, 139008);
    assert.equal(pixels.filter(value => value === 0).length, 55304);
  }
  const zeroNodata = nativePixels(withNodata(bytes, '0'), evidence.tile);
  assert.equal(zeroNodata.filter(value => value === null).length, 194312);
  assert.equal(zeroNodata.includes(0), false);
  assert.throws(() => nativePixels(withNodata(bytes, 'invalid'), evidence.tile), /nodata/);
});

test('all four direct NOAA exports decode; the dry hour has full valid coverage', () => {
  const directory = '../docs/validation/rainfall/2026-11-11-stream/';
  const evidence = JSON.parse(readFileSync(`${directory}direct-export.json`, 'utf8'));
  for (const result of evidence.results) {
    const bytes = gunzipSync(readFileSync(`${directory}${result.hours}h.tiff.gz`));
    const pixels = nativePixels(bytes, evidence.tile);
    assert.equal(pixels.length, 202935);
    assert.equal(pixels.filter(v => v === null).length, 0);
    assert.equal(pixels.filter(v => v === 0).length, result.decoded.zero);
    const stats = JSON.parse(readFileSync(`${directory}${result.hours}h-statistics.json`, 'utf8')).response.statistics[0];
    assert.equal(pixels.length, stats.count);
    assert.ok(Math.abs(pixels.reduce<number>((sum, value) => sum + (value ?? 0), 0) - stats.sum) < 1e-6, 'matches NOAA statistics, including implicit zero blocks');
    if (result.hours === 1) assert.equal(pixels.every(v => v === 0), true);
  }
});

test('publisher replays missed hours and chooses the latest revision without losing the older history', async () => {
  const { publishRain, rainArchive } = await import('./public-store');
  const { gzipSync } = await import('node:zlib');
  const { hash } = await import('./research-contract');
  const directory = '../docs/validation/rainfall/2026-11-11-stream/';
  const evidence = JSON.parse(readFileSync(`${directory}direct-export.json`, 'utf8'));
  const tile: Tile = evidence.tile;
  const compressed = gzipSync(gunzipSync(readFileSync(`${directory}1h.tiff.gz`)));
  const boundary = toWgs84(multiPolygon([[[[tile.xmin, tile.ymax], [tile.xmin + tile.dx, tile.ymax], [tile.xmin + tile.dx, tile.ymax - tile.dy], [tile.xmin, tile.ymax - tile.dy], [tile.xmin, tile.ymax]]]]));
  const now = Math.floor(Date.now() / RAIN_HOUR) * RAIN_HOUR;
  const capture = (hours: number, age: number, id: string) => ({ id, source_key: `conus_QPE_${String(hours).padStart(2, '0')}H`,
    valid_start: new Date(now - (age + hours) * RAIN_HOUR).toISOString(), valid_end: new Date(now - age * RAIN_HOUR).toISOString(),
    metadata: { tile, basinIds: ['test-basin'] }, object_path: 'test', sha256: hash(compressed) });
  const captures = [capture(1, 0, 'new'), { ...capture(1, 0, 'old'), sha256: 'obsolete' }, capture(24, 0, '24'), capture(72, 0, '72'), capture(1, 1, 'missed'), capture(1, 6, 'outage')];
  const uploads: Uint8Array[] = [], downloads: string[] = [], pages: number[] = [];
  const query = { select: () => query, eq: () => query, in: () => query, gte: () => query, lte: () => query, order: () => query,
    range: async (offset: number, last: number) => { pages.push(offset); return { data: captures.slice(offset, last + 1), error: null }; } };
  const river = { select: () => river, eq: () => river, single: async () => ({ data: { id: 'river', name: 'Test river' }, error: null }) };
  const places = { select: () => places, eq: () => places, order: () => places, limit: async () => ({ data: [], error: null }) };
  const db = { from: (table: string) => table === 'rivers' ? river : table === 'access_points' ? places : query,
    rpc: async () => ({ data: { type: 'LineString', coordinates: boundary.geometry.coordinates[0][0].slice(0, 2) }, error: null }),
    storage: { from: () => ({ download: async (path: string) => { downloads.push(path); return { data: new Blob([compressed]), error: null }; },
      upload: async (_path: string, bytes: Uint8Array) => { uploads.push(bytes); return { error: null }; } }) } } as unknown as import('@supabase/supabase-js').SupabaseClient;
  const oldPolicy = { ...RAIN_RELEASE }, oldFlag = process.env.RAINFALL_PUBLIC_ENABLED;
  Object.assign(RAIN_RELEASE, { unitsEvidence: 'test', coverageEvidence: 'test', sites: { test: { basinId: 'test-basin', riverSlug: 'test', name: 'Test', gauge: [-94, 36] } } });
  process.env.RAINFALL_PUBLIC_ENABLED = 'true';
  try {
    const basins = [{ id: 'test-basin', gauge_id: 'gauge', usgs_site_id: 'test', geometry: boundary, provenance: {}, forecast_points: [], review_status: 'reviewed' }];
    assert.equal(await publishRain(db, basins, new AbortController().signal), 1);
    const data = JSON.parse(gunzipSync(uploads[0]).toString()).data;
    assert.equal(data.hourly.length, 3, 'recovers a six-hour-old capture missed by the former three-hour query');
    assert.ok(data.hourly.every((row: { inches: number }) => row.inches === 0));
    assert.equal(data.totals.length, 2); assert.equal(downloads.length, 5, 'skips obsolete revision');
    assert.equal(await publishRain(db, basins, new AbortController().signal), 1);
    assert.deepEqual(uploads[0], uploads[1], 'replaying the same archive is idempotent');
    captures.length = 0;
    for (let i = 0; i < 251; i++) captures.push(capture(1, 0, String(i)));
    pages.length = 0;
    const replay = [];
    for await (const row of rainArchive(db, Date.now(), new AbortController().signal)) replay.push(row);
    assert.equal(replay.length, 251); assert.deepEqual(pages, [0, 250]);
  } finally {
    Object.assign(RAIN_RELEASE, oldPolicy);
    if (oldFlag === undefined) delete process.env.RAINFALL_PUBLIC_ENABLED; else process.env.RAINFALL_PUBLIC_ENABLED = oldFlag;
  }
});
