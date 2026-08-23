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
  mergeViewportItems,
  padBbox,
  quantizeBbox,
  requestCovers,
  type Bounds,
  type ViewportItem,
  type ViewportRequest,
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

// ── requestCovers ───────────────────────────────────────────────────────────
// The one eligibility rule for "is a fetch needed", shared by the memory-cache
// scan and the last-request shortcut in useViewportGauges. The regression it
// pins: bounds containment alone must not let a capped answer keep standing in
// for a request with a bigger budget.

test('easing back across the fetch threshold is NOT covered by a capped detail answer', () => {
  // The reported scenario, as the pure decision: at z10.6 the hook fetched the
  // 300-row detail page for a padded box and the server capped it. The camera
  // eases out to z10.4 — still inside the padding, but the budget is the
  // 1000-row overview now. A bounds-only shortcut sat on the 300 gauges until
  // the viewport crossed the padding, where the missing hundreds arrived as a
  // cliff — exactly the intermittent zoom-out this chain exists to remove.
  const detailFetch: ViewportRequest = {
    bbox: [-92.4, 37.0, -91.0, 38.0], // the padded, quantized detail request
    limit: 300,
    capped: true,
  };
  const easedOutViewport: Bounds = [-92.2, 37.2, -91.2, 37.9]; // inside the padding
  assert.ok(bboxContains(detailFetch.bbox, easedOutViewport), 'the scenario needs containment');
  assert.ok(!requestCovers(detailFetch, easedOutViewport, 1000), 'a capped 300 does not answer a 1000 budget');
  // Both halves of the flip: the same answer still covers its own budget, and
  // an UNCAPPED detail answer covers the overview budget too — nothing was
  // dropped, so there is nothing a bigger page could add.
  assert.ok(requestCovers(detailFetch, easedOutViewport, 300));
  assert.ok(requestCovers({ ...detailFetch, capped: false }, easedOutViewport, 1000));
});

test('requestCovers still requires containment, and null covers nothing', () => {
  const last: ViewportRequest = { bbox: [-92, 37, -91, 38], limit: 1000, capped: false };
  assert.ok(!requestCovers(last, [-93, 37, -91, 38], 1000), 'a wider camera needs a fetch');
  assert.ok(!requestCovers(null, [-92, 37, -91, 38], 1000));
});

// ── mergeViewportItems ──────────────────────────────────────────────────────
// The rule under test: a CAPPED payload is lossy, so what was legitimately on
// screen inside its box is carried over; an UNCAPPED payload is the complete
// contents of the box and replaces outright. See the function's header for why
// merging into a complete answer would pin stale ghosts to the map.

const BOX: Bounds = [-100, 40, -98, 42];

function item(id: string, lng: number, lat: number, dischargeCfs: number | null): ViewportItem {
  return { id, coordinates: { lng, lat }, dischargeCfs };
}

test('an uncapped payload replaces outright — complete answers are authoritative', () => {
  const drawn = [item('stale', -99, 41, 500)];
  const next = [item('a', -99.5, 41.5, 100)];
  // Identity, not just contents: the caller must be able to reuse the server
  // payload untouched, and a drawn count that could exceed the server's
  // `total` starts exactly here.
  assert.equal(mergeViewportItems(drawn, next, false, BOX), next);
});

test('a capped payload carries over drawn items inside its box, deduped by id', () => {
  const drawn = [
    item('kept', -99, 41, 5), // inside, not in next → carried over
    item('dupe', -99.2, 41.2, 50), // inside, also in next → next's copy wins, once
    item('outside', -101, 41, 900), // outside the fetched box → dropped
  ];
  const next = [item('a', -99.5, 41.5, 100), item('dupe', -99.2, 41.2, 50)];
  const merged = mergeViewportItems(drawn, next, true, BOX);
  assert.deepEqual(
    merged.map((i) => i.id),
    ['a', 'dupe', 'kept'],
  );
});

test('nothing to carry over returns the payload untouched', () => {
  const next = [item('a', -99.5, 41.5, 100)];
  assert.equal(mergeViewportItems([], next, true, BOX), next);
  // Everything drawn is already in the payload — same answer.
  assert.equal(mergeViewportItems([item('a', -99.5, 41.5, 100)], next, true, BOX), next);
});

test('carried-over items sit on the box edge inclusively', () => {
  // The fetched box is what the server answered for; a gauge ON its edge was
  // in that answer's ground and must survive the merge.
  const drawn = [item('edge', -100, 40, 10)];
  const next = [item('a', -99, 41, 100)];
  const merged = mergeViewportItems(drawn, next, true, BOX);
  assert.deepEqual(
    merged.map((i) => i.id),
    ['a', 'edge'],
  );
});

test('overflow drops carried-over items smallest-discharge first, never payload items', () => {
  const drawn = [
    item('small', -99.1, 41, 1),
    item('mid', -99.2, 41, 50),
    item('big', -99.3, 41, 900),
    item('nullFlow', -99.4, 41, null), // ranks as 0 — dropped before any number
  ];
  const next = [item('a', -99.5, 41.5, 100), item('b', -99.6, 41.6, 200)];
  const merged = mergeViewportItems(drawn, next, true, BOX, 4);
  assert.deepEqual(
    merged.map((i) => i.id),
    ['a', 'b', 'big', 'mid'],
  );
});

test('a payload already at the ceiling takes no extras at all', () => {
  const drawn = [item('kept', -99, 41, 5000)];
  const next = [item('a', -99.5, 41.5, 100), item('b', -99.6, 41.6, 200)];
  const merged = mergeViewportItems(drawn, next, true, BOX, 2);
  assert.equal(merged, next);
});

test('the merged set never exceeds the ceiling', () => {
  const drawn = Array.from({ length: 50 }, (_, i) => item(`d${i}`, -99, 41, i));
  const next = Array.from({ length: 10 }, (_, i) => item(`n${i}`, -99.5, 41.5, i));
  const merged = mergeViewportItems(drawn, next, true, BOX, 30);
  assert.equal(merged.length, 30);
});
