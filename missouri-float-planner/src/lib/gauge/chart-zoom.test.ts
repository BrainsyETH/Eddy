import assert from 'node:assert/strict';
import test from 'node:test';
import { pinchChartWindow, chartZoomKey, visibleChartTimes, visibleChartGeometry } from '../../../../eddy-ios/src/lib/gaugeChartZoom';

import { chartDomain, splitAtGaps, stepScrubTime } from '../../../shared/chart-model';

const full = { start: 0, end: 1000 };
test('pinch preserves the time beneath the focal point', () => {
  assert.deepEqual(pinchChartWindow(full, full, 250, 2, 0.25), { start: 125, end: 625 });
});
test('moving the pinch pans the window without changing its span', () => {
  assert.deepEqual(pinchChartWindow(full, { start: 250, end: 750 }, 500, 1, 0.75), { start: 125, end: 625 });
});
test('panning cannot leave loaded history at either edge', () => {
  assert.deepEqual(pinchChartWindow(full, full, 0, 2, 1), { start: 0, end: 500 });
  assert.deepEqual(pinchChartWindow(full, full, 1000, 2, 0), { start: 500, end: 1000 });
});
test('zooming out restores full history and magnification is capped', () => {
  assert.deepEqual(pinchChartWindow(full, { start: 250, end: 750 }, 500, 0.1, 0.5), full);
  assert.deepEqual(pinchChartWindow(full, full, 500, 1000, 0.5), { start: 475, end: 525 });
});
test('invalid gestures and empty domains do not produce broken scales', () => {
  for (const scale of [0, -1, NaN, Infinity]) assert.equal(pinchChartWindow(full, full, 500, scale, 0.5), null);
  assert.equal(pinchChartWindow({ start: 1, end: 1 }, full, 1, 2, 0.5), null);
});

test('zoom identity follows the selected and loaded request, not Compare extents', () => {
  const selected = { from: '2026-09-01', to: '2026-09-30' };
  const loaded = { from: '2026-09-01T00:00:00Z', to: '2026-09-30T23:59:59Z' };
  const key = chartZoomKey('123', 'cfs', 30, selected, loaded, 30);
  assert.equal(chartZoomKey('123', 'cfs', 30, { ...selected }, { ...loaded }, 30), key);
  assert.notEqual(chartZoomKey('456', 'cfs', 30, selected, loaded, 30), key);
  assert.notEqual(chartZoomKey('123', 'ft', 30, selected, loaded, 30), key);
  assert.notEqual(chartZoomKey('123', 'cfs', 7, undefined, loaded, 30), key);
  assert.notEqual(chartZoomKey('123', 'cfs', 30, selected, { ...loaded, to: '2026-10-01T23:59:59Z' }, 30), key);
});

test('VoiceOver stepping stays within zoom, including both endpoints and forecast overlap', () => {
  const times = visibleChartTimes([100, 200, 300, 300, 400, 500, NaN], { start: 200, end: 400 });
  assert.deepEqual(times, [200, 300, 400]);
  assert.equal(stepScrubTime(times, 400, 1), 400);
  assert.equal(stepScrubTime(times, 200, -1), 200);
  assert.equal(stepScrubTime(times, 300, 1), 400);
  assert.equal(stepScrubTime(times, 300, -1), 200);
  assert.deepEqual(visibleChartTimes([100, 500], { start: 200, end: 400 }), []);
});

test('fitting a quiet week excludes an offscreen flood while retaining nearby thresholds', () => {
  const points = [{ t: 0, v: 20000 }, { t: 100, v: 310 }, { t: 200, v: 330 }, { t: 300, v: 320 }];
  const options = { minimumSpan: 80, minimumSpanFraction: 0.18 };
  const original = chartDomain(points, 'cfs', [350, 2000], 0.28, options)!;
  const geometry = visibleChartGeometry([points], { start: 100, end: 300 });
  const fitted = chartDomain(geometry, 'cfs', [350, 2000], 0.28, options)!;
  assert.ok(original.max > 20000);
  assert.ok(fitted.min < 310 && fitted.max > 350);
  assert.ok(fitted.max < 500);
  assert.ok(fitted.max - fitted.min >= 80);
  assert.deepEqual([fitted.t0, fitted.t1], [100, 300]);
});

test('fitting includes visible forecast and comparison layers without joining different series', () => {
  const observed = [{ t: 100, v: 300 }, { t: 200, v: 310 }];
  const forecast = [{ t: 250, v: 450 }, { t: 300, v: 500 }];
  const priorYear = [{ t: 100, v: 650 }, { t: 300, v: 700 }];
  const low = [{ t: 100, v: 200 }, { t: 300, v: 220 }];
  const high = [{ t: 100, v: 800 }, { t: 300, v: 850 }];
  const median = [{ t: 100, v: 400 }, { t: 300, v: 425 }];
  const window = { start: 100, end: 300 };
  const fitted = chartDomain(visibleChartGeometry([observed, forecast, priorYear, low, high, median], window), 'cfs')!;
  assert.ok(fitted.min < 200 && fitted.max > 850);
  const withoutComparisons = chartDomain(visibleChartGeometry([observed, forecast], window), 'cfs')!;
  assert.ok(withoutComparisons.max < 650);
  assert.deepEqual(visibleChartGeometry([observed, forecast], { start: 210, end: 240 }), []);
});

test('fitting uses the visible line at both edges even when no sample falls inside the window', () => {
  const points = [{ t: 0, v: 100 }, { t: 100, v: 1100 }];
  assert.deepEqual(visibleChartGeometry([points], { start: 40, end: 60 }), [
    { t: 40, v: 500 }, { t: 60, v: 700 },
  ]);
  assert.deepEqual(points, [{ t: 0, v: 100 }, { t: 100, v: 1100 }], 'fitting never mutates readings');
});

test('fitting respects telemetry gaps and preserves isolated readings', () => {
  const points = [
    { t: 0, v: 100 }, { t: 10, v: 110 }, { t: 20, v: 120 },
    { t: 200, v: 400, breakBefore: true },
  ];
  const segments = splitAtGaps(points);
  assert.deepEqual(visibleChartGeometry(segments, { start: 30, end: 180 }), []);
  assert.deepEqual(visibleChartGeometry(segments, { start: 190, end: 210 }), [{ t: 200, v: 400 }]);
});

test('fitted scales retain headroom for flat values, the cfs floor, and negative stage readings', () => {
  const window = { start: 0, end: 100 };
  const lowFlow = visibleChartGeometry([[{ t: 0, v: 1 }, { t: 100, v: 1 }]], window);
  const flowDomain = chartDomain(lowFlow, 'cfs', [], 0.28, { minimumSpan: 80, minimumSpanFraction: 0.18 })!;
  assert.equal(flowDomain.min, 0);
  assert.ok(flowDomain.max >= 80);
  const negativeStage = visibleChartGeometry([[{ t: 0, v: -0.5 }, { t: 100, v: -0.5 }]], window);
  const stageDomain = chartDomain(negativeStage, 'ft', [], 0.28, { minimumSpan: 0.3, minimumSpanFraction: 0.08 })!;
  assert.ok(stageDomain.min < -0.5 && stageDomain.max > -0.5);
  assert.ok(stageDomain.max - stageDomain.min >= 0.3);
});

test('empty or invalid fitting geometry returns no domain so the renderer can retain its original scale', () => {
  const points = [{ t: 10, v: 100 }, { t: 20, v: 200 }];
  for (const window of [{ start: 30, end: 40 }, { start: 10, end: 10 }, { start: NaN, end: 20 }]) {
    assert.equal(chartDomain(visibleChartGeometry([points], window), 'cfs'), null);
  }
  assert.deepEqual(visibleChartGeometry([[{ t: 0, v: NaN }, { t: Infinity, v: 100 }]], full), []);
});
