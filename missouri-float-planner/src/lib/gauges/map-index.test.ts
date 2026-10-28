import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeGaugePoints } from '../../../../packages/eddy-types';
import { gaugeNameRequests, mergeGaugeNames, enrichGaugeNames, nextFreshnessChange, clusterGaugePoints, decodeMapIndex, filterMapGauges, referenceBand, restoreGaugeLayers } from './map-index';

const now = Date.parse('2026-10-28T12:00:00Z');
const row = (id: string, hours = 0, flow: number | null = 50, stage: number | null = 2, p: number | null = 95) =>
  [id, -91, 37, flow, stage, (now - hours * 3600_000) / 1000, 0, p];

test('web decodes the existing iOS index without a station cap', () => {
  const body = { v: 1, rows: Array.from({ length: 14259 }, (_, i) => row(String(10000000 + i))) };
  const web = decodeMapIndex(body, now), ios = decodeGaugePoints(body, now);
  assert.equal(web.length, 14259);
  for (let i = 0; i < web.length; i++) {
    const { id: _id, freshness: _freshness, ...actual } = web[i];
    const { id: _iosId, ...expected } = ios[i];
    assert.deepEqual(actual, expected);
  }
});

test('malformed envelopes fail visibly; duplicate and unlocated rows cannot make pins', () => {
  assert.throws(() => decodeMapIndex({ v: 2, rows: [] }));
  assert.throws(() => decodeMapIndex({ error: 'Unavailable' }));
  const good = row('07067000');
  const invalidLocation = [...good]; invalidLocation[1] = 900;
  assert.equal(decodeMapIndex({ v: 1, rows: [good, good, invalidLocation, null, ['invalid']] }, now).length, 1);
});

test('defaults include stage-only, delayed and unknown-comparison stations; historical is opt-in', () => {
  const gauges = decodeMapIndex({ v: 1, rows: [row('10000001'), row('10000002', 0, null, 2, null), row('10000003', 8), row('10000004', 48)] }, now);
  assert.equal(filterMapGauges(gauges, new Set(), now).length, 3);
  assert.equal(filterMapGauges(gauges, new Set(['historical']), now).length, 4);
  assert.equal(referenceBand(gauges[2], now), null);
  assert.equal(referenceBand({ ...gauges[0], readingSuspect: true }, now), null);
  assert.equal(referenceBand(gauges[1], now), null);
});

test('bands combine as OR, traits as AND; curated stations never enter this layer', () => {
  const gauges = decodeMapIndex({ v: 1, rows: [row('10000001', 0, 20, 2, 5), row('10000002', 0, 80, null, 95), row('10000003', 0, 40, 1, 50)] }, now);
  assert.equal(filterMapGauges(gauges, new Set(['much_lower', 'much_higher']), now).length, 2);
  assert.deepEqual(filterMapGauges(gauges, new Set(['much_lower', 'much_higher', 'flow', 'stage']), now).map(g => g.siteId), ['10000001']);
  assert.equal(filterMapGauges([{ ...gauges[0], curated: true }], new Set(), now).length, 0);
});

test('both layers default on and an explicit saved choice survives', () => {
  for (const raw of [null, '{}', 'invalid', 'null', '{"rated":"false"}']) assert.deepEqual(restoreGaugeLayers(raw), { rated: true, other: true });
  assert.deepEqual(restoreGaugeLayers('{"rated":false,"other":true}'), { rated: false, other: true });
});

test('SVG clusters account for every visible station, including co-located gauges', () => {
  const points = Array.from({ length: 14259 }, (_, i) => ({ id: i, x: i % 1000, y: i % 500 }));
  const groups = clusterGaugePoints(points, { x: 0, y: 0, w: 1000, h: 500 }, 1000);
  assert.equal(groups.reduce((n, group) => n + group.members.length, 0), points.length);
  assert.equal(new Set(groups.flatMap(g => g.members.map(p => p.id))).size, points.length);
  assert.ok(groups.length < 1000);
  const narrowed = clusterGaugePoints(points, { x: 250, y: 100, w: 100, h: 100 }, 1000);
  const covered = new Set(narrowed.flatMap(group => group.members.map(point => point.id)));
  for (const point of points.filter(p => p.x >= 250 && p.x <= 350 && p.y >= 100 && p.y <= 200)) assert.ok(covered.has(point.id));
});

test('legacy gauge visibility seeds both layers once, without overriding the new key', () => {
  assert.deepEqual(restoreGaugeLayers(null, '{"showGauges":false}'), { rated: false, other: false });
  assert.deepEqual(restoreGaugeLayers(null, '{"showGauges":true}'), { rated: true, other: true });
  assert.deepEqual(restoreGaugeLayers('{"rated":true,"other":false}', '{"showGauges":false}'), { rated: true, other: false });
});

test('capped name enrichment preserves all 14,259 index stations and newer measurements', () => {
  const index = decodeMapIndex({ v: 1, rows: Array.from({ length: 14259 }, (_, i) => row(String(10000000 + i))) }, now);
  const payload = index.slice(0, 1000).map(g => ({ ...g, name: `Creek at ${g.siteId}`, dischargeCfs: -999, coordinates: { lng: 0, lat: 0 } }));
  const names = mergeGaugeNames(new Map(), payload);
  const enriched = enrichGaugeNames(index, names);
  assert.equal(enriched.length, index.length);
  assert.equal(enriched[0].name, 'Creek at 10000000');
  assert.equal(enriched[0].dischargeCfs, index[0].dischargeCfs);
  assert.deepEqual(enriched[0].coordinates, index[0].coordinates);
  assert.equal(enriched[1000], index[1000]);
  assert.equal(mergeGaugeNames(names, payload), names, 'identical replies preserve name-map identity');
  assert.equal(enrichGaugeNames(index, new Map()), index, 'no enrichment preserves index identity');
  assert.equal(mergeGaugeNames(names, []), names, 'empty/failed requests cannot erase learned names');
});

test('name requests wait for neighborhood zoom and split the date line', () => {
  assert.deepEqual(gaugeNameRequests({ zoom: 7, bounds: [-95, 35, -90, 40] }), []);
  assert.ok(gaugeNameRequests({ zoom: 9, bounds: [-91.21, 37.01, -91.11, 37.11] })[0].startsWith('-91.25,'));
  const boxes = gaugeNameRequests({ zoom: 9, bounds: [179.5, 50, 180.5, 51] }).map(box => box.split(',').map(Number));
  assert.equal(boxes.length, 2);
  for (const [w, s, e, n] of boxes) assert.ok(w >= -180 && e <= 180 && w < e && s < n);
});

test('freshness scheduling does not invalidate the index every minute', () => {
  const gauges = decodeMapIndex({ v: 1, rows: [row('10000001', 1), row('10000002', 8), row('10000003', 48)] }, now);
  assert.equal(nextFreshnessChange(gauges, now), now + 5 * 3600_000 + 1);
  assert.equal(nextFreshnessChange(gauges, now + 60_000), nextFreshnessChange(gauges, now));
  assert.equal(nextFreshnessChange([gauges[2]], now), null);
  assert.equal(nextFreshnessChange(gauges, now + 5 * 3600_000 + 1), now + 16 * 3600_000 + 1);
});

test('SVG grid centers stay fixed across pans and already cover the next screen', () => {
  const points = Array.from({ length: 1000 }, (_, id) => ({ id, x: id * 10, y: 50 }));
  const initial = clusterGaugePoints(points, { x: 0, y: 0, w: 1000, h: 500 }, 1000);
  const pan = clusterGaugePoints(points, { x: 300, y: 0, w: 1000, h: 500 }, 1000);
  const previous = new Map(initial.map(group => [group.key, group]));
  for (const group of pan) if (previous.has(group.key)) assert.deepEqual(group, previous.get(group.key));
  const loaded = new Set(initial.flatMap(group => group.members.map(point => point.id)));
  for (const point of points.filter(point => point.x >= 1000 && point.x <= 2000)) assert.ok(loaded.has(point.id));
});
