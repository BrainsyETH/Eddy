// missouri-float-planner/src/lib/route-preview.test.ts
//
// Covers packages/eddy-geo/route-preview.ts, which the iOS plan screen draws
// with. eddy-ios has no test runner; see packages/eddy-hazards/index.ts for the
// same arrangement and the reason for it.
//
// The load-bearing assertions are the two that a human eye cannot check: that
// north is UP, and that a degenerate or missing route returns null instead of
// an invented line.

import assert from 'node:assert/strict';
import test from 'node:test';
import { routePreview, type LngLat } from '../../../packages/eddy-geo/route-preview';

const BOX = { width: 300, height: 120, padding: 10 };

/** A diagonal running north-east, so both axes are exercised at once. */
const DIAGONAL: LngLat[] = [
  [-91.5, 37.0],
  [-91.4, 37.1],
  [-91.3, 37.2],
];

test('north is up: a point further north gets a SMALLER y', () => {
  // SVG y grows downward and latitude grows northward. Getting this backwards
  // mirrors the river vertically, and a mirrored river still looks like a
  // river — which is exactly why it needs a test rather than a glance.
  const preview = routePreview(DIAGONAL, BOX);
  assert.ok(preview);
  assert.ok(preview.end.y < preview.start.y, 'the northern end should sit higher in the box');
});

test('west is left: a point further west gets a SMALLER x', () => {
  const preview = routePreview(DIAGONAL, BOX);
  assert.ok(preview);
  assert.ok(preview.start.x < preview.end.x);
});

test('the drawing stays inside the box, padding included', () => {
  const preview = routePreview(DIAGONAL, BOX)!;
  const coords = preview.path
    .split(/[ML]/)
    .filter(Boolean)
    .map((pair) => pair.trim().split(' ').map(Number));
  for (const [x, y] of coords) {
    assert.ok(x >= BOX.padding - 0.01 && x <= BOX.width - BOX.padding + 0.01, `x out of box: ${x}`);
    assert.ok(y >= BOX.padding - 0.01 && y <= BOX.height - BOX.padding + 0.01, `y out of box: ${y}`);
  }
});

test('aspect is preserved — the line is fitted, never stretched to fill', () => {
  // A stretch twice as wide as it is tall must not come out filling a box with
  // a different ratio. If it did, every river would render as the same shape.
  const wide: LngLat[] = [
    [-92.0, 37.0],
    [-91.0, 37.0],
    [-91.0, 37.1],
  ];
  const preview = routePreview(wide, BOX)!;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pair of preview.path.split(/[ML]/).filter(Boolean)) {
    const [x, y] = pair.trim().split(' ').map(Number);
    xs.push(x);
    ys.push(y);
  }
  const drawnW = Math.max(...xs) - Math.min(...xs);
  const drawnH = Math.max(...ys) - Math.min(...ys);
  // Source ratio is ~10:1 after the cos(lat) correction shrinks longitude;
  // the drawn ratio has to stay far from the box's own 2.5:1.
  assert.ok(drawnW / drawnH > 5, `expected a long thin route, got ${drawnW}x${drawnH}`);
});

test('longitude is corrected for latitude', () => {
  // One degree of longitude is about 0.8 of a degree of latitude at 37°N. An
  // uncorrected projection draws an east-west river ~20% too wide, which looks
  // entirely plausible and is wrong.
  const square: LngLat[] = [
    [-91.0, 37.0],
    [-90.0, 37.0],
    [-90.0, 38.0],
  ];
  const preview = routePreview(square, { width: 400, height: 400, padding: 0 })!;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pair of preview.path.split(/[ML]/).filter(Boolean)) {
    const [x, y] = pair.trim().split(' ').map(Number);
    xs.push(x);
    ys.push(y);
  }
  const drawnW = Math.max(...xs) - Math.min(...xs);
  const drawnH = Math.max(...ys) - Math.min(...ys);
  // cos(37.5°) ≈ 0.793.
  assert.ok(Math.abs(drawnW / drawnH - 0.793) < 0.02, `ratio was ${drawnW / drawnH}`);
});

test('the markers sit on the true ends, not on a sampled vertex', () => {
  // 400 points through a 20-point sample: the first and last must survive
  // exactly, because they are the two access points somebody chose.
  const many: LngLat[] = Array.from({ length: 400 }, (_, i) => [-91.5 + i * 0.001, 37 + i * 0.001]);
  const preview = routePreview(many, { ...BOX, maxPoints: 20 })!;
  const first = preview.path.slice(1).split(' ').slice(0, 2).map(Number);
  const lastPair = preview.path.split('L').pop()!.trim().split(' ').map(Number);
  assert.deepEqual([preview.start.x, preview.start.y], first);
  assert.deepEqual([preview.end.x, preview.end.y], lastPair);
});

test('the sample is capped', () => {
  const many: LngLat[] = Array.from({ length: 4000 }, (_, i) => [-91.5 + i * 0.0001, 37]);
  const preview = routePreview(many, { ...BOX, maxPoints: 50 })!;
  assert.equal(preview.path.split(/[ML]/).filter(Boolean).length, 50);
});

test('a route that cannot be drawn returns null rather than an invented one', () => {
  // Every one of these used to be a candidate for "just draw a straight line
  // between the two ends". A straight line is a claim about a river.
  assert.equal(routePreview(null, BOX), null);
  assert.equal(routePreview(undefined, BOX), null);
  assert.equal(routePreview([], BOX), null);
  assert.equal(routePreview([[-91, 37]], BOX), null);
  // Every point identical — no extent to fit.
  assert.equal(
    routePreview(
      [
        [-91, 37],
        [-91, 37],
      ],
      BOX,
    ),
    null,
  );
  // A box with no area.
  assert.equal(routePreview(DIAGONAL, { width: 0, height: 120 }), null);
});

test('non-finite coordinates are dropped, not drawn', () => {
  const dirty = [
    [-91.5, 37.0],
    [Number.NaN, 37.1],
    [-91.3, 37.2],
  ] as LngLat[];
  const preview = routePreview(dirty, BOX);
  assert.ok(preview);
  assert.ok(!preview.path.includes('NaN'));
});

test('a reversed route draws the same shape with the ends swapped', () => {
  const forward = routePreview(DIAGONAL, BOX)!;
  const backward = routePreview([...DIAGONAL].reverse(), BOX)!;
  assert.deepEqual(forward.start, backward.end);
  assert.deepEqual(forward.end, backward.start);
});
