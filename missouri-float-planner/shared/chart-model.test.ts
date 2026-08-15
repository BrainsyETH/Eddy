import assert from 'node:assert/strict';
import test from 'node:test';
import { chartDomain, chartPoints, nearestChartPoint, niceValueTicks, samplePreservingExtrema, splitAtGaps } from './chart-model';

test('sorts time and removes readings missing the selected unit', () => {
  const points = chartPoints([
    { timestamp: '2026-01-02T00:00:00Z', gaugeHeightFt: null, dischargeCfs: 20 },
    { timestamp: '2026-01-01T00:00:00Z', gaugeHeightFt: null, dischargeCfs: null },
    { timestamp: '2026-01-01T12:00:00Z', gaugeHeightFt: null, dischargeCfs: 10 },
  ], 'cfs');
  assert.deepEqual(points.map((point) => point.v), [10, 20]);
});
test('exposes telemetry outages', () => {
  const base = Date.parse('2026-01-01T00:00:00Z');
  const points = [0, 1, 2, 20, 21].map((hour) => ({ t: base + hour * 3_600_000, v: hour, timestamp: '', qualifiers: [] }));
  assert.deepEqual(splitAtGaps(points).map((segment) => segment.length), [3, 2]);
});

test('sampling preserves last reading and extrema', () => {
  const values = [0, 1, 2, 100, 3, -20, 4, 5, 6, 7];
  const sampled = samplePreservingExtrema(values, 6, (value) => value);
  assert.equal(sampled[0], 0);
  assert.equal(sampled.at(-1), 7);
  assert.ok(sampled.includes(100));
  assert.ok(sampled.includes(-20));
});

test('domain includes nearby context without flattening for a distant threshold', () => {
  const points = [100, 120].map((v, index) => ({ t: index, v, timestamp: '', qualifiers: [] }));
  const domain = chartDomain(points, 'cfs', [130, 1000])!;
  assert.ok(domain.max > 130 && domain.max < 200);
});

test('ticks and nearest lookup work on small series', () => {
  assert.ok(niceValueTicks(3.1, 8.9, 4).length >= 2);
  const points = [0, 10, 20].map((t) => ({ t, v: t, timestamp: '', qualifiers: [] }));
  assert.equal(nearestChartPoint(points, 16)?.t, 20);
});
