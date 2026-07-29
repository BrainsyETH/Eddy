// src/lib/map/viewport-parity.test.ts
// Asserts the web copy of the viewport-cache arithmetic still equals @eddy/geo's.
//
// Two implementations exist for the reason stated in ./viewport.ts: Vercel
// installs only missouri-float-planner/, so shippable web code cannot import
// @eddy/geo. Tests are the one place that may reach across — they run under
// tsconfig.test.json rather than the build — which makes this file the only
// thing standing between the two copies and silent drift.
//
// Drift here is not cosmetic. quantizeBbox decides the CACHE KEY both clients
// send to /api/public-lands and /api/gauges/map. If the two grids disagree, the
// phone and the website warm two disjoint sets of CDN entries for the same
// viewports and each one misses everything the other cached — a cost nothing
// would surface, because both apps would still be perfectly correct.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bboxContains as sharedContains,
  bboxGridSize as sharedGrid,
  padBbox as sharedPad,
  quantizeBbox as sharedQuantize,
  type Bounds,
} from '../../../../packages/eddy-geo/index';
import { bboxContains, bboxGridSize, padBbox, quantizeBbox } from './viewport';

// Real viewports, chosen to straddle both grid-size thresholds (z8 and z11) and
// to include a bbox whose edges already sit on a grid line — the case where
// floor/ceil is a no-op and a rounding bug hides.
const FIXTURES: Array<{ bounds: Bounds; zoom: number; what: string }> = [
  { bounds: [-91.5, 37.0, -91.0, 37.4], zoom: 6, what: 'Ozarks, zoomed out past the 0.5° grid' },
  { bounds: [-91.42, 37.11, -91.19, 37.28], zoom: 8, what: 'Current River at the 0.1° grid' },
  { bounds: [-91.42, 37.11, -91.19, 37.28], zoom: 10.9, what: 'just under the 0.02° threshold' },
  { bounds: [-91.42, 37.11, -91.19, 37.28], zoom: 11, what: 'exactly at the 0.02° threshold' },
  { bounds: [-91.3, 37.2, -91.2, 37.3], zoom: 13, what: 'edges already on the grid' },
  { bounds: [-93.42, 36.02, -92.87, 36.31], zoom: 12, what: 'Buffalo River, Arkansas' },
  { bounds: [-179.9, -85.0, -179.4, -84.6], zoom: 9, what: 'near the antimeridian and the pole' },
];

test('bboxGridSize matches @eddy/geo at every zoom', () => {
  for (let zoom = 0; zoom <= 22; zoom += 0.5) {
    assert.equal(bboxGridSize(zoom), sharedGrid(zoom), `grid size disagrees at z${zoom}`);
  }
});

test('quantizeBbox matches @eddy/geo — this is the CDN cache key', () => {
  for (const { bounds, zoom, what } of FIXTURES) {
    assert.deepEqual(
      quantizeBbox(bounds, zoom),
      sharedQuantize(bounds, zoom),
      `quantizeBbox disagrees on ${what}`,
    );
  }
});

test('padBbox matches @eddy/geo, at the default and an explicit fraction', () => {
  for (const { bounds, what } of FIXTURES) {
    assert.deepEqual(padBbox(bounds), sharedPad(bounds), `padBbox default disagrees on ${what}`);
    assert.deepEqual(
      padBbox(bounds, 0.35),
      sharedPad(bounds, 0.35),
      `padBbox(0.35) disagrees on ${what}`,
    );
  }
});

test('bboxContains matches @eddy/geo, including the shares-an-edge case', () => {
  const outer: Bounds = [-92, 36, -91, 37];
  const cases: Bounds[] = [
    [-91.8, 36.2, -91.2, 36.8], // strictly inside
    [-92, 36, -91, 37], // identical — containment is not strict
    [-92.1, 36.2, -91.2, 36.8], // west of it
    [-91.8, 36.2, -90.9, 36.8], // east of it
    [-91.8, 35.9, -91.2, 36.8], // south of it
  ];
  for (const inner of cases) {
    assert.equal(
      bboxContains(outer, inner),
      sharedContains(outer, inner),
      `bboxContains disagrees on ${JSON.stringify(inner)}`,
    );
  }
});

test('the quantized box always contains the viewport it came from', () => {
  // Not a parity assertion — the PROPERTY the copy exists to preserve. A
  // quantized box smaller than the screen shows up as boundaries that appear
  // only after you pan past them, which reads as missing data rather than as a
  // cache bug.
  for (const { bounds, zoom, what } of FIXTURES) {
    assert.ok(bboxContains(quantizeBbox(bounds, zoom), bounds), `quantized box lost ground on ${what}`);
  }
});
