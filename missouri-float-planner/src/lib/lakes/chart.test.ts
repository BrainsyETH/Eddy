import assert from 'node:assert/strict';
import test from 'node:test';
import { lakeChartModel, nearestPoint } from './chart';

const NOW = Date.parse('2026-11-09T19:00:00Z');
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

test('the domain is the readings\' range, pulled out to a nearby conservation pool, and ticks sit inside it', () => {
  const history: Array<[string, number]> = [[iso(150), 916.1], [iso(100), 916.4], [iso(50), 916.0], [iso(1), 915.8]];
  const model = lakeChartModel(history, { conservationFt: 915, now: NOW })!;
  assert.ok(model);
  assert.ok(model.minFt <= 915 - 0.25 && model.maxFt >= 916.4 + 0.25);
  assert.ok(model.referencePosition !== null && model.referencePosition > 0 && model.referencePosition < 0.3);
  assert.equal(model.referenceNote, null);
  for (const tick of model.valueTicks) assert.ok(tick.position >= 0 && tick.position <= 1);
  assert.equal(model.timeTicks.length, 4);
  assert.equal(model.t1 - model.t0, 7 * 86_400_000);
});

test('a far reference is not drawn, and is explained instead; fewer than two readings is no chart', () => {
  const flood: Array<[string, number]> = [[iso(100), 928.4], [iso(1), 929.1]];
  const model = lakeChartModel(flood, { conservationFt: 915, now: NOW })!;
  assert.equal(model.referencePosition, null);
  assert.equal(model.referenceNote, "Conservation pool 915 ft is 13 ft below this week's range");
  assert.ok(model.minFt > 920, 'the week is not flattened to show a line it is nowhere near');
  // A quiet week 4.8 ft under the pool (Table Rock, November 2026): the spread is 0.4 ft, so the reach is 1 ft and the line stays off.
  const quiet: Array<[string, number]> = [[iso(160), 910.59], [iso(80), 910.4], [iso(1), 910.21]];
  const q = lakeChartModel(quiet, { conservationFt: 915, now: NOW })!;
  assert.equal(q.referencePosition, null);
  assert.equal(q.referenceNote, "Conservation pool 915 ft is 4.4 ft above this week's range");
  assert.ok(q.maxFt < 912, 'the chart keeps the week\'s own scale');
  // A week that moved 3 ft can afford a reference 5 ft off.
  const busy: Array<[string, number]> = [[iso(160), 918.0], [iso(1), 921.0]];
  assert.notEqual(lakeChartModel(busy, { conservationFt: 915, now: NOW })!.referencePosition, null);
  assert.equal(lakeChartModel([[iso(1), 916]], { now: NOW }), null);
  assert.equal(lakeChartModel([], { now: NOW }), null);
});

test('the hover readout picks the nearest reading', () => {
  const points = [{ t: 0, ft: 1 }, { t: 10, ft: 2 }, { t: 20, ft: 3 }];
  assert.equal(nearestPoint(points, 12)?.ft, 2);
  assert.equal(nearestPoint(points, 16)?.ft, 3);
  assert.equal(nearestPoint([], 5), null);
});
