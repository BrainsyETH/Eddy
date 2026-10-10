import assert from 'node:assert/strict';
import test from 'node:test';
import { pinchChartWindow } from '../../../../eddy-ios/src/lib/gaugeChartZoom';

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
