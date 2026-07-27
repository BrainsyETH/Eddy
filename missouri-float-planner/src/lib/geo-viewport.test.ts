// src/lib/geo-viewport.test.ts
// Covers the viewport helpers in @eddy/geo that drive the national gauge layer.
//
// They live in packages/eddy-geo and are exercised from here because eddy-ios
// has no test runner — the same arrangement geo-tiles.test.ts already uses.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bboxContains,
  bboxGridSize,
  padBbox,
  quantizeBbox,
  type Bounds,
} from '../../../packages/eddy-geo/index';

test('grid coarsens as the camera pulls back', () => {
  assert.equal(bboxGridSize(5), 0.5);
  assert.equal(bboxGridSize(9), 0.1);
  assert.equal(bboxGridSize(14), 0.02);
});

test('quantized box always contains the viewport it came from', () => {
  // The property that matters: snapping must never shrink the request, or the
  // missing strip shows up as gauges that appear only after you pan past them.
  const cases: Array<[Bounds, number]> = [
    [[-105.37, 39.53, -104.61, 40.02], 9],
    [[-91.512, 37.014, -91.008, 37.502], 12],
    [[-123.9, 45.1, -122.2, 46.7], 6],
    [[12.3456789, -33.987654, 12.4, -33.9], 14],
  ];
  for (const [bounds, zoom] of cases) {
    const q = quantizeBbox(bounds, zoom);
    assert.ok(bboxContains(q, bounds), `${JSON.stringify(q)} must contain ${JSON.stringify(bounds)}`);
  }
});

test('two viewports in the same cell quantize to the same key', () => {
  // This is the whole point: a pan of a few pixels must not mint a new URL, or
  // the CDN hit rate stays at zero. Both boxes sit inside the same 0.1° cells
  // on every edge.
  const a = quantizeBbox([-105.28, 39.55, -104.62, 39.98], 9);
  const b = quantizeBbox([-105.26, 39.57, -104.64, 39.97], 9);
  assert.deepEqual(a, b);
  assert.deepEqual(a, [-105.3, 39.5, -104.6, 40]);
});

test('a pan across a cell boundary does mint a new key', () => {
  // The flip side, asserted so nobody "fixes" the snapping into rounding to
  // nearest: crossing a boundary MUST produce a different box, because the
  // viewport now covers ground the previous request did not.
  const inside = quantizeBbox([-105.29, 39.55, -104.62, 39.98], 9);
  const across = quantizeBbox([-105.31, 39.55, -104.62, 39.98], 9);
  assert.notDeepEqual(inside, across);
});

test('quantize produces no floating-point dust', () => {
  // 0.1-degree steps are exactly where binary floating point misbehaves;
  // -105.30000000000001 and -105.3 are different cache keys.
  const q = quantizeBbox([-105.31, 39.55, -104.62, 40.01], 9);
  for (const v of q) {
    assert.equal(v, Math.round(v * 1e6) / 1e6, `${v} carries float dust`);
  }
});

test('quantize clamps latitude to the world', () => {
  const q = quantizeBbox([-10, -89.9, 10, 89.9], 5);
  assert.ok(q[1] >= -90);
  assert.ok(q[3] <= 90);
});

test('padding grows the box proportionally and stays in the world', () => {
  const padded = padBbox([-100, 40, -99, 41], 0.2);
  assert.equal(padded[0], -100.2);
  assert.equal(padded[2], -98.8);
  assert.ok(bboxContains(padded, [-100, 40, -99, 41]));

  const atPole = padBbox([-180, 89, -179, 90], 0.5);
  assert.ok(atPole[0] >= -180);
  assert.ok(atPole[3] <= 90);
});

test('containment is inclusive on the edges', () => {
  const outer: Bounds = [-100, 40, -99, 41];
  assert.ok(bboxContains(outer, outer));
  assert.ok(bboxContains(outer, [-99.5, 40.5, -99.4, 40.6]));
  assert.ok(!bboxContains(outer, [-100.1, 40, -99, 41]));
  assert.ok(!bboxContains(outer, [-100, 40, -98.9, 41]));
});
