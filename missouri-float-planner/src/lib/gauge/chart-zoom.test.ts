import assert from 'node:assert/strict';
import test from 'node:test';
import { pinchChartWindow, chartZoomKey, visibleChartTimes } from '../../../../eddy-ios/src/lib/gaugeChartZoom';

import { stepScrubTime } from '../../../shared/chart-model';

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
