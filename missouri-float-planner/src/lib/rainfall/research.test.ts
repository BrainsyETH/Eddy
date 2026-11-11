import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { multiPolygon } from '@turf/turf';
import { exportParameters, exportResult, forecastMetadata, forecastUrl, hash, interval, nativeTile, samplePoints, validateTiff, type Basin, type Tile } from './research-contract';
import { pool, collectResearch } from './research-sync';
import { saveCapture, type Capture } from './research-store';

const basin: Basin = { id: 'basin', gauge_id: 'gauge', usgs_site_id: '07065495',
  geometry: multiPolygon([[[[-92, 37], [-91.9, 37], [-91.9, 37.1], [-92, 37.1], [-92, 37]]]]), provenance: {}, forecast_points: [[-92, 37]] };
const grid = { pixelSize: { x: 1000, y: 1000, spatialReference: { wkid: 3857 } }, origin: { x: -15000000, y: 8000000, spatialReference: { wkid: 3857 } }, extent: { xmin: -15000000, xmax: -5000000, ymin: 0, ymax: 8000000 } };
const tile = nativeTile([basin], grid);

function tiff(t: Tile): Uint8Array {
  const tags: Array<[number, number, number[]]> = [
    [256, 4, [t.width]], [257, 4, [t.height]], [258, 3, [32]], [277, 3, [1]], [339, 3, [3]],
    [33550, 12, [t.dx, t.dy, 0]], [33922, 12, [0, 0, 0, t.xmin, t.ymax, 0]], [34735, 3, [1, 1, 0, 1, 3072, 0, 1, 3857]],
    [273, 4, [500]], [279, 4, [12]],
  ];
  const b = new Uint8Array(512), v = new DataView(b.buffer); b[0] = b[1] = 73; v.setUint16(2, 42, true); v.setUint32(4, 8, true); v.setUint16(8, tags.length, true);
  let next = 144;
  tags.forEach(([tag, type, values], i) => {
    const at = 10 + i * 12, size = type === 3 ? 2 : type === 4 ? 4 : 8;
    v.setUint16(at, tag, true); v.setUint16(at + 2, type, true); v.setUint32(at + 4, values.length, true);
    const pos = values.length * size <= 4 ? at + 8 : next;
    if (pos === next) { v.setUint32(at + 8, next, true); next += values.length * size; }
    values.forEach((n, j) => type === 3 ? v.setUint16(pos + j * size, n, true) : type === 4 ? v.setUint32(pos + j * size, n, true) : v.setFloat64(pos + j * size, n, true));
  });
  return b;
}

test('regional export snaps all edges to the actual item grid', () => {
  assert.equal((tile.xmin - grid.origin.x) % grid.pixelSize.x, 0);
  assert.equal((tile.ymax - grid.origin.y) % grid.pixelSize.y, -0);
  assert.equal(tile.xmax - tile.xmin, tile.width * tile.dx);
  assert.throws(() => nativeTile([], grid));
  assert.throws(() => nativeTile([basin], { ...grid, pixelSize: { ...grid.pixelSize, x: 0.1 } }));
});
test('exports preserve float measurements, source negatives and native nearest sampling', () => {
  const p = exportParameters(tile, { mosaicRule: { mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [7] } } as Parameters<typeof exportParameters>[1]);
  assert.equal(p.get('pixelType'), 'F32'); assert.equal(p.get('format'), 'tiff');
  assert.equal(p.get('interpolation'), 'RSP_NearestNeighbor');
  assert.equal(p.get('renderingRule'), '{"rasterFunction":"None"}');
});
test('reject shifted exports and foreign download URLs', () => {
  const value = { width: tile.width, height: tile.height, extent: { ...tile, spatialReference: { wkid: 3857 } }, href: 'https://mapservices.weather.noaa.gov/raster/a.tif' };
  assert.equal(exportResult(value, tile), value.href);
  assert.throws(() => exportResult({ ...value, width: tile.width + 1 }, tile));
  assert.throws(() => exportResult({ ...value, extent: { ...value.extent, xmin: tile.xmin + 500 } }, tile));
  assert.throws(() => exportResult({ ...value, href: 'https://attacker.example/a.tif' }, tile));
});
test('actual TIFF must carry float pixels, correct CRS, spacing and origin', () => {
  const bytes = tiff(tile); validateTiff(bytes, tile);
  assert.throws(() => validateTiff(Buffer.from('{"error":"no raster"}'), tile));
  assert.throws(() => validateTiff(bytes, { ...tile, xmin: tile.xmin + 500 }));
  assert.throws(() => validateTiff(bytes, { ...tile, dx: 573 }));
  const integer = bytes.slice(); new DataView(integer.buffer).setUint16(10 + 4 * 12 + 8, 1, true);
  assert.throws(() => validateTiff(integer, tile));
  const sparse = bytes.slice(), view = new DataView(sparse.buffer);
  view.setUint32(10 + 8 * 12 + 8, 0, true); view.setUint32(10 + 9 * 12 + 8, 0, true);
  validateTiff(sparse, tile);
  view.setUint32(10 + 9 * 12 + 8, 12, true);
  assert.throws(() => validateTiff(sparse, tile));
});
test('captured NOAA native export replays, including its sparse pixel blocks', () => {
  const directory = '../docs/validation/rainfall/2026-11-11-review/';
  const evidence = JSON.parse(readFileSync(`${directory}native-archive-probe.json`, 'utf8'));
  const bytes = gunzipSync(readFileSync(`${directory}native-archive-probe.tiff.gz`));
  assert.equal(hash(bytes), evidence.sha256);
  validateTiff(bytes, evidence.tile);
});
test('research samples stay deterministic and bounded without a weighting claim', () => {
  const points = samplePoints(basin.geometry);
  assert.equal(points.length, 9); assert.deepEqual(points, samplePoints(basin.geometry));
});
test('forecast duration is kept as issued, including multi-hour and missing amounts', () => {
  const now = Date.parse('2026-11-11T18:00Z');
  const data = { properties: { updateTime: '2026-11-11T17:00Z', quantitativePrecipitation: { uom: 'wmoUnit:mm', values: [
    { validTime: '2026-11-11T18:00:00+00:00/PT6H', value: 0 }, { validTime: '2026-11-12T00:00:00+00:00/P1D', value: null },
  ] } } };
  const metadata = forecastMetadata(data, now);
  assert.equal(metadata.end, '2026-11-13T00:00:00.000Z'); assert.equal(metadata.missingIntervals, 1);
  assert.equal(data.properties.quantitativePrecipitation.values[1].value, null);
  assert.throws(() => forecastMetadata({ properties: { ...data.properties, quantitativePrecipitation: { ...data.properties.quantitativePrecipitation, uom: 'wmoUnit:percent' } } }, now));
  assert.throws(() => interval('2026-11-11T18:00Z/PT0H'));
  assert.throws(() => interval('2026-11-11T18:00Z/P1M'));
});
test('NWS URLs reject wrong products, extra arguments and foreign origins', () => {
  assert.equal(forecastUrl('https://api.weather.gov/gridpoints/SGF/133,33'), 'https://api.weather.gov/gridpoints/SGF/133,33');
  for (const url of ['https://evil.example/gridpoints/SGF/133,33', 'https://api.weather.gov/gridpoints/SGF/133,33/forecast', 'https://api.weather.gov/gridpoints/SGF/133,33?key=x']) assert.throws(() => forecastUrl(url));
});
test('one failed source does not stop other work, and deadline leaves explicit gaps', async () => {
  const result = await pool([1, 2, 3], new AbortController().signal, async n => { if (n === 2) throw Error('outage'); });
  assert.deepEqual(result, { completed: 2, failed: 1, deferred: 0 });
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await pool([1, 2], controller.signal, async () => {}), { completed: 0, failed: 0, deferred: 2 });
});

function fakeStore() {
  const rows = new Map<string, Record<string, unknown>>(), objects = new Map<string, Uint8Array>();
  let failInsert = false;
  const db = { from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: rows.get(id), error: null }) }) }),
    upsert: async (row: Record<string, unknown>, options: { ignoreDuplicates: boolean }) => {
      assert.equal(options.ignoreDuplicates, true);
      if (failInsert) return { error: Error('database outage') };
      rows.set(String(row.id), row); return { error: null };
    } }), storage: { from: () => ({ upload: async (path: string, bytes: Uint8Array, options: { upsert: boolean }) => {
      assert.equal(options.upsert, false);
      if (objects.has(path)) return { error: { statusCode: '409', message: 'already exists' } };
      objects.set(path, bytes); return { error: null };
    } }) } } as unknown as SupabaseClient;
  return { db, rows, objects, fail: (value: boolean) => { failInsert = value; } };
}
const capture: Capture = { kind: 'nws', sourceKey: 'grid', basinSetHash: hash('basin'), start: '2026-11-11T18:00Z', end: '2026-11-12T18:00Z', issuedAt: '2026-11-11T17:00Z', metadata: {}, bytes: Buffer.from('{"rain":null}') };
test('repeated captures deduplicate while forecast revisions remain separate', async () => {
  const store = fakeStore();
  assert.ok(await saveCapture(store.db, capture)); assert.equal(await saveCapture(store.db, capture), 0);
  await saveCapture(store.db, { ...capture, bytes: Buffer.from('{"rain":4}') });
  assert.equal(store.rows.size, 2); assert.equal(store.objects.size, 2);
  assert.equal(gunzipSync([...store.objects.values()][0]).toString(), '{"rain":null}');
});
test('failed metadata insert can recover its uploaded object without overwriting', async () => {
  const store = fakeStore(); store.fail(true); await assert.rejects(saveCapture(store.db, capture));
  assert.equal(store.objects.size, 1); assert.equal(store.rows.size, 0);
  store.fail(false); await saveCapture(store.db, capture); assert.equal(store.rows.size, 1); assert.equal(store.objects.size, 1);
});
test('a missing study inventory is an error, not a successful empty collection', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) } as unknown as SupabaseClient;
  await assert.rejects(collectResearch(db, 'observations', new AbortController().signal, { json: async () => ({}), bytes: async () => new Uint8Array() }), /inventory/);
});

test('observation collection paginates gauge history and survives one missing rain window', async () => {
  const saved: Capture[] = [], offsets: number[] = [];
  const gaugeQuery = {
    select: () => gaugeQuery, in: () => gaugeQuery, gte: () => gaugeQuery, lte: () => gaugeQuery, order: () => gaugeQuery,
    range: async (offset: number) => {
      offsets.push(offset);
      return { data: Array.from({ length: offset === 0 ? 1000 : 2 }, (_, n) => ({ id: offset + n, gauge_station_id: 'gauge' })), error: null };
    },
  };
  const db = { from: (table: string) => table === 'gauge_readings' ? gaugeQuery : ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [basin], error: null }) }) }) }) }),
    storage: { getBucket: async () => ({ data: { public: false }, error: null }) } } as unknown as SupabaseClient;
  const end = Math.floor(Date.now() / 3600_000) * 3600_000;
  const catalog = { features: [1, 6, 24, 72].map(hours => ({ attributes: { idp_subset: `conus_QPE_${String(hours).padStart(2, '0')}H`, category: 1, objectid: hours, idp_validendtime: end } })) };
  const result = await collectResearch(db, 'observations', new AbortController().signal, {
    save: async (_db, c) => { saved.push(c); return c.bytes.length; },
    json: async url => {
      if (url.includes('/query?')) return catalog;
      if (url.includes('/info?')) return { pixelType: 'F32', bandCount: 1, pixelSizeX: 1000, pixelSizeY: 1000, origin: grid.origin, extent: { ...grid.extent, spatialReference: { wkid: 3857 } } };
      if (url.includes('/exportImage?')) {
        const params = new URL(url).searchParams, id = JSON.parse(params.get('mosaicRule')!).lockRasterIds[0];
        if (id === 6) throw Error('6h source unavailable');
        return { width: tile.width, height: tile.height, extent: { ...tile, spatialReference: { wkid: 3857 } }, href: `https://mapservices.weather.noaa.gov/raster/${id}.tif` };
      }
      return { pixelType: 'F32', bandCount: 1, rasterFunctionInfos: [{ name: 'None' }] };
    }, bytes: async () => tiff(tile),
  });
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(result.monitoring_status, 'partial'); assert.equal(result.failed, 1);
  assert.equal(saved.filter(c => c.kind === 'mrms').length, 3);
  assert.equal(saved.find(c => c.kind === 'gauges')?.metadata.rowCount, 1002);
  assert.ok(saved.filter(c => c.kind === 'mrms').every(c => c.metadata.quality === 'research_unverified'));
});

test('forecasts shared by two basins are fetched once and keep nulls plus both bindings', async () => {
  const saved: Capture[] = [], url = 'https://api.weather.gov/gridpoints/SGF/133,33';
  let fetches = 0;
  const db = { from: (table: string) => table === 'rainfall_research_basins'
    ? ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [basin, { ...basin, id: 'second', gauge_id: 'gauge2' }], error: null }) }) }) }) })
    : ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { grid_url: url, resolved_at: new Date().toISOString() }, error: null }) }) }) }),
    storage: { getBucket: async () => ({ data: { public: false }, error: null }) } } as unknown as SupabaseClient;
  const response = { properties: { gridId: 'SGF', gridX: 133, gridY: 33, updateTime: new Date().toISOString(), quantitativePrecipitation: { uom: 'wmoUnit:mm', values: [{ validTime: '2026-11-12T00:00:00Z/PT6H', value: null }] } } };
  const result = await collectResearch(db, 'forecasts', new AbortController().signal, {
    save: async (_db, c) => { saved.push(c); return c.bytes.length; }, json: async u => { assert.equal(u, url); fetches++; return response; }, bytes: async () => new Uint8Array(),
  });
  assert.equal(fetches, 1); assert.equal(result.completed, 1);
  const forecast = saved.find(c => c.kind === 'nws')!;
  assert.deepEqual(forecast.metadata.bindings, [{ point: [-92, 37], basinIds: ['basin', 'second'] }]);
  assert.equal(JSON.parse(Buffer.from(forecast.bytes).toString()).properties.quantitativePrecipitation.values[0].value, null);
});
