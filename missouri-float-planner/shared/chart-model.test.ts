// shared/chart-model.test.ts
//
// The load-bearing assertions here are the ones that pin behaviours a chart
// cannot show you is wrong: that a stage below datum is not clamped away, that
// a downsample keeps the crest, and that an outage stays an outage after the
// downsample has made the spacing deliberately uneven. Each of those rendered
// as a smooth, plausible line before this file existed.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chartDomain,
  chartPoints,
  chartSegments,
  nearestChartPoint,
  niceValueTicks,
  qualifierText,
  samplePreservingExtrema,
  splitAtGaps,
  stepScrubTime,
  timeTicks,
  valueForUnit,
  type ChartPoint,
} from './chart-model';

const HOUR = 3_600_000;
const BASE = Date.parse('2026-01-01T00:00:00Z');

function pointsAt(hours: number[], values: number[] = hours): ChartPoint[] {
  return hours.map((hour, index) => ({
    t: BASE + hour * HOUR,
    v: values[index],
    timestamp: new Date(BASE + hour * HOUR).toISOString(),
    qualifiers: [],
  }));
}

test('reads the selected unit and treats the other one as absent', () => {
  const reading = { timestamp: '', gaugeHeightFt: 3.2, dischargeCfs: null };
  assert.equal(valueForUnit(reading, 'ft'), 3.2);
  assert.equal(valueForUnit(reading, 'cfs'), null);
});

test('sorts by time and drops readings missing the selected unit', () => {
  const points = chartPoints(
    [
      { timestamp: '2026-01-02T00:00:00Z', gaugeHeightFt: null, dischargeCfs: 20 },
      { timestamp: '2026-01-01T00:00:00Z', gaugeHeightFt: null, dischargeCfs: null },
      { timestamp: '2026-01-01T12:00:00Z', gaugeHeightFt: null, dischargeCfs: 10 },
    ],
    'cfs',
  );
  // Three readings in, two points out — the gap is a gap, not a mid-frame dot.
  assert.deepEqual(points.map((point) => point.v), [10, 20]);
});

test('an unparseable timestamp is dropped rather than plotted at the epoch', () => {
  const points = chartPoints([{ timestamp: 'not a date', gaugeHeightFt: 1, dischargeCfs: null }], 'ft');
  assert.equal(points.length, 0);
});

test('carries qualifiers through, defaulting to none', () => {
  const [withCodes, without] = chartPoints(
    [
      { timestamp: '2026-01-01T00:00:00Z', gaugeHeightFt: 1, dischargeCfs: null, qualifiers: ['P', 'e'] },
      { timestamp: '2026-01-01T01:00:00Z', gaugeHeightFt: 2, dischargeCfs: null },
    ],
    'ft',
  );
  assert.deepEqual(withCodes.qualifiers, ['P', 'e']);
  assert.deepEqual(without.qualifiers, []);
});

test('exposes telemetry outages', () => {
  assert.deepEqual(splitAtGaps(pointsAt([0, 1, 2, 20, 21])).map((segment) => segment.length), [3, 2]);
});

test('median cadence finds the outage that a mean-based threshold would miss', () => {
  // Hourly for a day, then a 30-hour hole, then hourly again. The MEAN spacing
  // across this series is ~2.4h, so a mean × 4 threshold (9.6h) still catches
  // it — but add a second hole and the mean runs away from the data while the
  // median stays at 1h. This is the case the app's old mean-based rule missed.
  const hours = [...Array.from({ length: 12 }, (_, i) => i), 42, 43, 44, 90, 91, 92];
  const segments = splitAtGaps(pointsAt(hours));
  assert.deepEqual(segments.map((segment) => segment.length), [12, 3, 3]);
});

test('coincident timestamps stay one segment instead of shattering', () => {
  // Every interval is zero, so there is no cadence. Inventing one (the old
  // `?? 1` fallback was 1ms) broke every point into its own segment, and a
  // renderer that drops single-point segments then drew nothing at all.
  const points = pointsAt([0, 0, 0]);
  assert.equal(splitAtGaps(points).length, 1);
});

test('a single point is one segment, and an empty series is no segments', () => {
  assert.equal(splitAtGaps(pointsAt([0])).length, 1);
  assert.equal(splitAtGaps([]).length, 0);
});

test('an isolated reading is returned to be drawn, not dropped', () => {
  // The reading at hour 40 has no neighbour inside the cadence. Both renderers
  // used to filter it out with the segment it sits in, so a station that
  // reported once between two outages showed empty space where a number was.
  const { lines, isolated } = chartSegments(pointsAt([0, 1, 2, 40, 80, 81]));
  assert.deepEqual(lines.map((segment) => segment.length), [3, 2]);
  assert.deepEqual(isolated.map((point) => point.v), [40]);
});

test('a lone reading is isolated rather than a line of one', () => {
  const { lines, isolated } = chartSegments(pointsAt([5]));
  assert.deepEqual(lines, []);
  assert.deepEqual(isolated.map((point) => point.v), [5]);
  assert.deepEqual(chartSegments([]), { lines: [], isolated: [] });
});

test('qualifier copy is plain English, deduped, and silent on codes it cannot read', () => {
  assert.equal(qualifierText(['P']), 'provisional');
  // 'e' and 'E' are both estimated; saying it twice reads as two problems.
  assert.equal(qualifierText(['e', 'E']), 'estimated');
  assert.equal(qualifierText(['P', 'Ice']), 'provisional, ice affected');
  // An unknown code is not narrated. USGS adds codes without asking us, and
  // "qualifier: Xyz" tells a reader nothing they can act on.
  assert.equal(qualifierText(['Xyz']), null);
  assert.equal(qualifierText([]), null);
});

test('sampling preserves both endpoints and the extrema between them', () => {
  const values = [0, 1, 2, 100, 3, -20, 4, 5, 6, 7];
  const sampled = samplePreservingExtrema(values, 6, (value) => value);
  assert.equal(sampled[0], 0, 'first reading kept');
  assert.equal(sampled.at(-1), 7, 'newest reading kept');
  assert.ok(sampled.includes(100), 'crest kept');
  assert.ok(sampled.includes(-20), 'trough kept');
  assert.ok(sampled.length <= 6);
});

test('sampling keeps the crest that a fixed stride deletes', () => {
  // 240 flat readings with a one-reading flood peak at an odd index. The old
  // `index % step === 0` filter drops it outright; this must not.
  const values = Array.from({ length: 240 }, () => 100);
  values[97] = 9_000;
  const strided = values.filter((_, index) => index % Math.ceil(240 / 60) === 0);
  assert.ok(!strided.includes(9_000), 'stride really does lose the peak');
  assert.ok(samplePreservingExtrema(values, 60, (value) => value).includes(9_000));
});

test('sampling never exceeds its budget and never needs to truncate', () => {
  const values = Array.from({ length: 5_000 }, (_, index) => Math.sin(index) * 100);
  for (const budget of [4, 5, 17, 60, 361]) {
    const sampled = samplePreservingExtrema(values, budget, (value) => value);
    assert.ok(sampled.length <= budget, `budget ${budget}`);
    assert.equal(sampled.at(-1), values.at(-1), `budget ${budget} keeps the newest reading`);
  }
});

test('a series already under the budget is returned untouched', () => {
  const values = [1, 2, 3];
  assert.deepEqual(samplePreservingExtrema(values, 10, (value) => value), values);
});

test('sampling ignores nulls without letting them win a bucket', () => {
  const values: (number | null)[] = [5, null, 900, null, 5, null, 5, 5];
  const sampled = samplePreservingExtrema(values, 6, (value) => value);
  assert.ok(sampled.includes(900));
});

test('domain includes a nearby threshold but not a distant one', () => {
  const domain = chartDomain(pointsAt([0, 1], [100, 120]), 'cfs', [130, 1000])!;
  assert.ok(domain.max > 130, 'the near line is on screen');
  assert.ok(domain.max < 200, 'the distant line has not flattened the series');
});

test('stage below datum is NOT clamped to zero', () => {
  // validHeight() accepts down to -100 ft, and several gauges sit below datum
  // at low water. Clamping here drew the line beneath an axis labelled 0.00.
  const domain = chartDomain(pointsAt([0, 1], [-1.5, -0.4]), 'ft')!;
  assert.ok(domain.min < -1.5, `expected headroom below -1.5, got ${domain.min}`);
});

test('discharge still floors at zero, because negative flow is not a thing', () => {
  const domain = chartDomain(pointsAt([0, 1], [2, 40]), 'cfs')!;
  assert.equal(domain.min, 0);
});

test('a flat series still gets a domain with height', () => {
  const domain = chartDomain(pointsAt([0, 1], [7, 7]), 'ft')!;
  assert.ok(domain.max > domain.min);
});

test('domain carries the window and an empty series has none', () => {
  const domain = chartDomain(pointsAt([0, 5]), 'cfs')!;
  assert.equal(domain.t0, BASE);
  assert.equal(domain.t1, BASE + 5 * HOUR);
  assert.equal(chartDomain([], 'cfs'), null);
});

test('ticks are round numbers, in range, and free of float drift', () => {
  const ticks = niceValueTicks(3.1, 8.9, 4);
  assert.ok(ticks.length >= 2);
  for (const tick of ticks) {
    assert.ok(tick.value >= 3.1 && tick.value <= 8.9 + 1e-9);
    assert.ok(tick.position >= 0 && tick.position <= 1);
    // 0.30000000000000004 and friends never reach a label.
    assert.equal(Number(tick.value.toFixed(6)), tick.value);
  }
});

test('ticks degrade to the endpoints rather than hanging on a degenerate span', () => {
  assert.equal(niceValueTicks(5, 5, 4).length, 2);
  assert.equal(niceValueTicks(Number.NaN, 10, 4).length, 2);
});

/**
 * The axis must never fall back to the PADDED DOMAIN's own edges.
 *
 * chartDomain() pads by 8%, so those edges are arithmetic rather than readings:
 * a Van Buren stage week rendered as "2.43" and "3.47", which is not a scale
 * anybody can measure a line against. The step was rounded up past every value
 * that would have fitted, and the fallback caught what was left.
 */
test('a narrow stage window is labelled in round steps, not padded endpoints', () => {
  const ticks = niceValueTicks(2.43, 3.47, 3);
  assert.ok(ticks.length >= 3, 'a stage window this wide has room for three labels');
  assert.ok(!ticks.some((tick) => tick.value === 2.43 || tick.value === 3.47));
  // Every label is a true multiple of one step — the 2.5 rung is why 2.75 is
  // available here at all, and rounding it to 2.8 would put a label off its grid.
  const step = ticks[1].value - ticks[0].value;
  for (const tick of ticks) {
    assert.equal(Number((tick.value / step).toFixed(6)) % 1, 0);
  }
});

test('a discharge window is labelled across the frame, not just the bottom', () => {
  const ticks = niceValueTicks(0, 940, 3);
  assert.ok(ticks.length >= 3);
  // The complaint this encodes: "0, 500" left the top half of a 0–940 plot with
  // nothing to measure a spike against.
  assert.ok(ticks.at(-1)!.value > 500);
});

test('stage below its datum keeps a labelled axis', () => {
  // validHeight() accepts down to -100 ft and several Ozark gauges sit below
  // their datum at low water; the axis has to survive a negative domain.
  const ticks = niceValueTicks(-2.5, 1.5, 3);
  assert.ok(ticks.length >= 3);
  assert.ok(ticks.some((tick) => tick.value < 0));
  for (const tick of ticks) {
    assert.ok(tick.value >= -2.5 && tick.value <= 1.5 + 1e-9);
    assert.ok(tick.position >= 0 && tick.position <= 1);
  }
});

test('time ticks span the window inclusively', () => {
  const ticks = timeTicks(BASE, BASE + 24 * HOUR, 5);
  assert.equal(ticks.length, 5);
  assert.equal(ticks[0].value, BASE);
  assert.equal(ticks.at(-1)!.value, BASE + 24 * HOUR);
});

test('a keyed scrub steps one reading at a time and clamps at both ends', () => {
  const times = [10, 20, 30, 40];
  assert.equal(stepScrubTime(times, 30, -1), 20);
  assert.equal(stepScrubTime(times, 30, 1), 40);
  // Off the end in either direction is the end, never a wrap: arriving back at
  // last week from the right-hand edge would be a claim about time.
  assert.equal(stepScrubTime(times, 40, 1), 40);
  assert.equal(stepScrubTime(times, 10, -1), 10);
  assert.equal(stepScrubTime([], 10, 1), null);
});

test('the first keypress steps AWAY from where the readout already sits', () => {
  // A keyboard arriving with nothing selected starts from the newest OBSERVED
  // reading, because that is what aria-valuenow has been reporting all along.
  // Anchoring on the end of the window instead made the first left press select
  // the point the reader was already on — a keypress that appeared to do nothing
  // when the station had no forecast to extend the window past it.
  const observed = [10, 20, 30];
  const forecast = [40, 50];
  const times = [...observed, ...forecast];
  const newestObserved = 30;
  assert.equal(stepScrubTime(times, newestObserved, -1), 20);
  // Forward from the same anchor is the first forecast point where there is one,
  // and the newest reading itself where there is not.
  assert.equal(stepScrubTime(times, newestObserved, 1), 40);
  assert.equal(stepScrubTime(observed, newestObserved, 1), 30);
});

test('an instant between two readings resolves to the nearer of them', () => {
  // The pointer leaves a fraction anywhere; the keyboard has to start from
  // somewhere real. A tie goes to the earlier reading, matching nearestChartPoint.
  assert.equal(stepScrubTime([0, 100], 49, 0), 0);
  assert.equal(stepScrubTime([0, 100], 51, 0), 100);
  assert.equal(stepScrubTime([0, 100], 50, 0), 0);
});

test('nearest lookup picks the closer neighbour and clamps at both ends', () => {
  const points = pointsAt([0, 1, 2]);
  assert.equal(nearestChartPoint(points, BASE + 1.6 * HOUR)?.t, BASE + 2 * HOUR);
  assert.equal(nearestChartPoint(points, BASE + 1.4 * HOUR)?.t, BASE + 1 * HOUR);
  assert.equal(nearestChartPoint(points, BASE - 99 * HOUR)?.t, BASE);
  assert.equal(nearestChartPoint(points, BASE + 99 * HOUR)?.t, BASE + 2 * HOUR);
  assert.equal(nearestChartPoint([], 0), null);
});
