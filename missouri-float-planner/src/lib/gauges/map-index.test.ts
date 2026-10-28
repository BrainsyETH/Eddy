import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeGaugePoints } from '../../../../packages/eddy-types';
import { clusterGaugePoints, decodeMapIndex, filterMapGauges, referenceBand, restoreGaugeLayers } from './map-index';

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
  assert.equal(narrowed.reduce((n, group) => n + group.members.length, 0), points.filter(p => p.x >= 250 && p.x <= 350 && p.y >= 100 && p.y <= 200).length);
});
