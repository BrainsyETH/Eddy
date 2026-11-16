import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CORRECTED_HOURS, CORRECTED_PRODUCTS, correctedTile, correctedUrl, tileTiff } from './corrected-source';
import { collectCorrected } from './corrected-sync';
import { nativePixels } from './native-grid';
import { hash, type Tile } from './research-contract';
import type { Capture } from './research-store';

const HOUR = 3_600_000;
const evidence = '../docs/validation/rainfall/2026-11-16-corrected/';
const realFile = 'MRMS_MultiSensor_QPE_01H_Pass2_00.00_20261116-060000.grib2.gz';
const realTile = (JSON.parse(readFileSync('../docs/validation/rainfall/2026-11-16-units/capture.json', 'utf8')) as { tile: Tile }).tile;

test('NOAA\'s own file reads the same as an independent decoder at every cell of a wet tile', () => {
  const download = readFileSync(evidence + realFile);
  assert.equal(hash(download), 'fbdfbfba6c2a47c34d84277f167e18dd1b3089856b8465e709ff8968f0f372e3');
  assert.equal(correctedUrl(1, '2026-11-16T06:00:00Z'),
    `https://noaa-mrms-pds.s3.amazonaws.com/CONUS/MultiSensor_QPE_01H_Pass2_00.00/20261116/${realFile}`);
  const result = correctedTile(download, 1, '2026-11-16T06:00:00Z', realTile);
  // pygrib's reading of the same file at the same cell centres (expected-on-tile.py).
  const bytes = gunzipSync(readFileSync(evidence + 'expected-on-tile.f32.gz'));
  const expected = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  assert.equal(expected.length, realTile.width * realTile.height);
  let wet = 0;
  for (let i = 0; i < expected.length; i++) {
    assert.equal(result.values[i], expected[i], `cell ${i}`);
    if (expected[i] > 0) wet++;
  }
  assert.equal(wet, 47416, 'a wet hour, so a shifted or flipped grid could not pass');
  assert.equal(result.missing, 0);
  assert.deepEqual({ ...result.source, sha256: '' }, { sha256: '', bytes: 489535, bits: 16, parameter: 37, referenceTime: '2026-11-16T06:00:00.000Z',
    columns: 7000, rows: 3500, firstLatitude: 54.995, firstLongitude: 230.005, dLatitude: 0.01, dLongitude: 0.01 });
  // Stored as the same native GeoTIFF the hosted captures use, so the publisher reads it unchanged.
  const pixels = nativePixels(tileTiff(result.values, realTile), realTile);
  assert.ok(pixels.every((value, i) => value === result.values[i]));
  assert.throws(() => correctedTile(download, 24, '2026-11-16T06:00:00Z', realTile), /not the requested rainfall product/);
  assert.throws(() => correctedTile(download, 1, '2026-11-16T07:00:00Z', realTile), /not the requested hour/);
  assert.throws(() => correctedTile(gzipSync(gunzipSync(download).subarray(0, 200_000)), 1, '2026-11-16T06:00:00Z', realTile), /whole message/);
  assert.throws(() => correctedTile(download, 1, '2026-11-16T06:00:00Z', { ...realTile, xmin: realTile.xmin - 9e6, xmax: realTile.xmax - 9e6 }), /outside the rainfall grid/);
  assert.throws(() => correctedUrl(1, '2026-11-16T06:30:00Z'), /on the hour/);
});

// A small file in NOAA's layout: 40 x 30 cells of 0.01 degrees from 37.005 N, 91.995 W.
const columns = 40, rows = 30;
// NOAA packs an hour at 8 bits when no cell needs more, so both depths are built here.
const stored = (row: number, column: number, bits = 16) => row === 3 && column === 6 ? 0 : 30 + (bits === 8 ? (row * 7 + column) % 200 : row * 40 + column);
function grib(end: string, parameter: number, options: { bits?: number; pngBits?: number } = {}): Uint8Array {
  const bits = options.bits ?? 16, size = bits === 8 ? 1 : 2, raw = new Uint8Array(rows * columns * size);
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    if (size === 1) raw[r * columns + c] = stored(r, c, 8);
    else { raw[(r * columns + c) * 2] = stored(r, c) >> 8; raw[(r * columns + c) * 2 + 1] = stored(r, c) & 255; }
  }
  // Every PNG row filter in turn, as NOAA's files use all of them.
  const filtered = new Uint8Array(rows * (columns * size + 1)), stride = columns * size;
  for (let r = 0; r < rows; r++) {
    const filter = r % 5; filtered[r * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const left = i >= size ? raw[r * stride + i - size] : 0, up = r ? raw[(r - 1) * stride + i] : 0, corner = r && i >= size ? raw[(r - 1) * stride + i - size] : 0;
      const estimate = left + up - corner, a = Math.abs(estimate - left), b = Math.abs(estimate - up), c = Math.abs(estimate - corner);
      const predicted = [0, left, up, (left + up) >> 1, a <= b && a <= c ? left : b <= c ? up : corner][filter];
      filtered[r * (stride + 1) + 1 + i] = raw[r * stride + i] - predicted;
    }
  }
  const chunk = (type: string, data: Uint8Array) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); out.write(type, 4, 'latin1'); out.set(data, 8); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(columns); header.writeUInt32BE(rows, 4); header[8] = options.pngBits ?? (bits === 8 ? 8 : 16);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(filtered)), chunk('IEND', new Uint8Array())]);
  const section = (number: number, length: number, fill: (body: Buffer) => void) => { const body = Buffer.alloc(length); body.writeUInt32BE(length); body[4] = number; fill(body); return body; };
  const at = new Date(end);
  const sections = [
    section(1, 21, b => { b[11] = 3; b.writeUInt16BE(at.getUTCFullYear(), 12); b[14] = at.getUTCMonth() + 1; b[15] = at.getUTCDate(); b[16] = at.getUTCHours(); }),
    section(3, 72, b => { b.writeUInt32BE(columns, 30); b.writeUInt32BE(rows, 34); b.writeUInt32BE(1, 38); b.writeUInt32BE(1e6, 42);
      b.writeUInt32BE(37_005_000, 46); b.writeUInt32BE(268_005_000, 50); b.writeUInt32BE(10_000, 63); b.writeUInt32BE(10_000, 67); }),
    section(4, 34, b => { b[9] = 6; b[10] = parameter; }),
    section(5, 21, b => { b.writeUInt32BE(columns * rows, 5); b.writeUInt16BE(41, 9); b.writeFloatBE(-30, 11); b.writeUInt16BE(1, 17); b[19] = bits; }),
    section(6, 6, b => { b[5] = 255; }),
    Buffer.concat([section(7, 5, () => {}), png]),
  ];
  sections[5].writeUInt32BE(sections[5].length);
  const head = Buffer.alloc(16); head.write('GRIB', 0, 'latin1'); head[6] = 209; head[7] = 2;
  const message = Buffer.concat([head, ...sections, Buffer.from('7777', 'latin1')]);
  message.writeUInt32BE(message.length, 12);
  return gzipSync(message);
}
const radius = 6378137, mercator = (longitude: number, latitude: number) => [radius * longitude * Math.PI / 180, radius * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
const [xmin, ymax] = mercator(-91.95, 36.99), tile: Tile = { xmin, ymax, dx: 1189.1837785492494, dy: 1189.1837785492494, width: 5, height: 4, xmax: xmin + 5 * 1189.1837785492494, ymin: ymax - 4 * 1189.1837785492494 };

test('each tile cell takes the source cell under its centre, north up, and missing stays missing', () => {
  const end = '2026-11-16T06:00:00.000Z';
  for (const bits of [16, 8]) {
  const result = correctedTile(grib(end, 37, { bits }), 1, end, tile);
  let nan = 0;
  for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
    const latitude = (2 * Math.atan(Math.exp((tile.ymax - (y + 0.5) * tile.dy) / radius)) - Math.PI / 2) * 180 / Math.PI;
    const longitude = (tile.xmin + (x + 0.5) * tile.dx) / radius * 180 / Math.PI;
    const row = Math.round((37.005 - latitude) / 0.01), column = Math.round((longitude + 91.995) / 0.01), value = result.values[y * tile.width + x];
    if (stored(row, column, bits) === 0) { assert.ok(Number.isNaN(value), 'NOAA\'s no-coverage value is never zero rain'); nan++; }
    else assert.ok(Math.abs(value - (stored(row, column, bits) - 30) / 10) < 1e-5, `${bits}-bit cell ${x},${y}`);
  }
  assert.equal(nan, 1); assert.equal(result.missing, 1); assert.equal(result.source.bits, bits);
  assert.equal(nativePixels(tileTiff(result.values, tile), tile).filter(value => value === null).length, 1);
  }
  assert.throws(() => correctedTile(grib(end, 37, { bits: 24 }), 1, end, tile), /packing/);
  assert.throws(() => correctedTile(grib(end, 37, { bits: 8, pngBits: 16 }), 1, end, tile), /rain field image/, 'the image must be the depth the header states');
  assert.throws(() => tileTiff(new Float32Array(3), tile), /size mismatch/);
  assert.deepEqual(CORRECTED_HOURS, { MultiSensor_QPE_01H_Pass2: 1, MultiSensor_QPE_24H_Pass2: 24, MultiSensor_QPE_72H_Pass2: 72 });
});

function archiveOf(rows: { source_key: string; valid_end: string; metadata?: unknown }[]) {
  const query = { select: () => query, eq: () => query, in: () => query, gte: () => query, order: () => query, limit: () => query,
    range: async () => ({ data: rows, error: null }), maybeSingle: async () => ({ data: rows.find(row => row.metadata) ?? null, error: null }) };
  return { from: () => query } as unknown as SupabaseClient;
}
const published = (available: (hours: number, end: number) => boolean, requests: string[] = []) => async (url: string) => {
  requests.push(url);
  const match = /MultiSensor_QPE_(\d\d)H_Pass2_00\.00_(\d{4})(\d\d)(\d\d)-(\d\d)0000/.exec(url)!, hours = Number(match[1]) as 1 | 24 | 72;
  const end = Date.UTC(Number(match[2]), Number(match[3]) - 1, Number(match[4]), Number(match[5]));
  if (!available(hours, end)) throw new Error('Research source HTTP 404');
  return grib(new Date(end).toISOString(), CORRECTED_PRODUCTS[hours].parameter);
};

test('a run archives every recent hour it is missing, newest first, and waits for unpublished ones', async () => {
  const now = Date.parse('2026-11-16T20:18:00Z'), top = Date.parse('2026-11-16T20:00:00Z'), saved: Omit<Capture, 'basinSetHash'>[] = [], requests: string[] = [];
  const input = { basinIds: ['basin'], basinSetHash: 'set', now, tile };
  // 19:00 is the newest NOAA has published; 18:00 is already archived; 15:00 never arrived.
  const db = archiveOf([{ source_key: 'MultiSensor_QPE_01H_Pass2', valid_end: new Date(top - 2 * HOUR).toISOString() }]);
  const available = (hours: number, end: number) => end <= top - HOUR && !(hours === 1 && end === top - 5 * HOUR);
  const result = await collectCorrected(db, input, new AbortController().signal, published(available, requests), async capture => { saved.push(capture); });
  const hourly = saved.filter(capture => capture.sourceKey === 'MultiSensor_QPE_01H_Pass2').map(capture => capture.end);
  assert.deepEqual(hourly.slice(0, 3), ['2026-11-16T19:00:00.000Z', '2026-11-16T17:00:00.000Z', '2026-11-16T16:00:00.000Z'], 'newest first; the archived hour is not fetched again');
  assert.equal(hourly.length, 6, 'bounded catch-up per run');
  assert.ok(!requests.some(url => url.includes('20261116-180000') && url.includes('_01H_')));
  assert.deepEqual(saved.filter(capture => capture.sourceKey !== 'MultiSensor_QPE_01H_Pass2').map(capture => [capture.sourceKey, capture.start, capture.end]), [
    ['MultiSensor_QPE_24H_Pass2', '2026-11-15T19:00:00.000Z', '2026-11-16T19:00:00.000Z'],
    ['MultiSensor_QPE_72H_Pass2', '2026-11-13T19:00:00.000Z', '2026-11-16T19:00:00.000Z']]);
  assert.deepEqual(result, { completed: 8, failed: 0, pending: 1, stale: 0 });
  const first = saved[0];
  assert.equal(first.kind, 'mrms'); assert.equal(first.start, '2026-11-16T18:00:00.000Z');
  assert.equal(first.metadata.unit, 'mm'); assert.equal(first.metadata.format, 'GeoTIFF'); assert.deepEqual(first.metadata.tile, tile);
  assert.equal(first.metadata.sourceUrl, requests.find(url => url.includes('20261116-190000') && url.includes('_01H_')));
  assert.equal(nativePixels(first.bytes, tile).length, 20);
  // The same run again finds nothing to do except the hour NOAA has not published.
  const again: string[] = [];
  const full = archiveOf(saved.map(capture => ({ source_key: capture.sourceKey, valid_end: capture.end! })).concat([{ source_key: 'MultiSensor_QPE_01H_Pass2', valid_end: new Date(top - 2 * HOUR).toISOString() }]));
  assert.deepEqual(await collectCorrected(full, { ...input, lookbackHours: 8 }, new AbortController().signal, published(available, again), async () => { assert.fail('nothing new'); }),
    { completed: 0, failed: 0, pending: 1, stale: 0 });
  assert.equal(again.length, 4, 'the current hour, the gap, and the current hour of each total');
});

test('a source outage is stale, a corrupt file is a failure, and the last archived tile stands in for a hosted outage', async () => {
  const now = Date.parse('2026-11-16T20:18:00Z'), saved: Omit<Capture, 'basinSetHash'>[] = [];
  const silent = console.warn; console.warn = () => {};
  try {
    const nothing = await collectCorrected(archiveOf([]), { basinIds: ['basin'], basinSetHash: 'set', now, tile }, new AbortController().signal, published(() => false), async () => {});
    assert.deepEqual(nothing, { completed: 0, failed: 0, pending: 10, stale: 1 });
    const corrupt = await collectCorrected(archiveOf([]), { basinIds: ['basin'], basinSetHash: 'set', now, tile, maxHourly: 2 }, new AbortController().signal, async () => new Uint8Array([1, 2, 3]), async () => {});
    assert.deepEqual(corrupt, { completed: 0, failed: 4, pending: 0, stale: 1 });
    await assert.rejects(collectCorrected(archiveOf([]), { basinIds: ['basin'], basinSetHash: 'set', now, tile: null }, new AbortController().signal, published(() => true), async () => {}), /No archived tile/);
    const fallback = archiveOf([{ source_key: 'conus_QPE_01H', valid_end: '2026-11-16T10:00:00Z', metadata: { tile } }]);
    const result = await collectCorrected(fallback, { basinIds: ['basin'], basinSetHash: 'set', now, tile: null, maxHourly: 1 }, new AbortController().signal, published(() => true), async capture => { saved.push(capture); });
    assert.equal(result.completed, 3); assert.deepEqual(saved[0].metadata.tile, tile);
    const stopped = new AbortController(); stopped.abort();
    await assert.rejects(collectCorrected(archiveOf([]), { basinIds: ['basin'], basinSetHash: 'set', now, tile }, stopped.signal, published(() => true), async () => {}), /abort/i);
  } finally { console.warn = silent; }
});
