import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundsForLine,
  bufferBounds,
  corridorBoxes,
  estimateBytes,
  formatBytes,
  latToTileY,
  lngToTileX,
  tileCountAtZoom,
  tileCountForBoxes,
  tileCountForRange,
  type Bounds,
} from '../../../packages/eddy-geo/index';

// The Current River as /api/rivers/current actually returns it.
const CURRENT_RIVER_BOUNDS: Bounds = [-91.6614, 36.252224, -90.756214, 37.450406];

test('tile x/y follow Web Mercator', () => {
  assert.equal(lngToTileX(-180, 0), 0);
  assert.equal(lngToTileX(0, 1), 1);
  assert.equal(latToTileY(0, 1), 1);
  // Missouri at z10 — a sanity anchor rather than a magic number.
  assert.equal(lngToTileX(-91.5, 10), 251);
});

test('tile Y is inverted relative to latitude', () => {
  // North gives the SMALLER Y. Getting this backwards silently produces a
  // negative span and a wrong tile count.
  assert.ok(latToTileY(37.45, 10) < latToTileY(36.25, 10));
});

test('a single point still needs one tile', () => {
  assert.equal(tileCountAtZoom([-91.5, 37.0, -91.5, 37.0], 10), 1);
});

test('tile count grows about fourfold per zoom level', () => {
  const z12 = tileCountAtZoom(CURRENT_RIVER_BOUNDS, 12);
  const z13 = tileCountAtZoom(CURRENT_RIVER_BOUNDS, 13);
  const ratio = z13 / z12;
  assert.ok(ratio > 3 && ratio < 5, `expected ~4x, got ${ratio.toFixed(2)}x`);
});

test('a zoom range sums its levels', () => {
  const sum =
    tileCountAtZoom(CURRENT_RIVER_BOUNDS, 8) +
    tileCountAtZoom(CURRENT_RIVER_BOUNDS, 9) +
    tileCountAtZoom(CURRENT_RIVER_BOUNDS, 10);
  assert.equal(tileCountForRange(CURRENT_RIVER_BOUNDS, 8, 10), sum);
});

test('reversed zoom arguments are tolerated', () => {
  assert.equal(
    tileCountForRange(CURRENT_RIVER_BOUNDS, 12, 8),
    tileCountForRange(CURRENT_RIVER_BOUNDS, 8, 12)
  );
});

// ── the numbers that decide whether offline ships ────────────────

test('the naive full-bbox download is impractical at high zoom', () => {
  // Measured against the real geometry: z8-15 over the plain bounding box is
  // ~15.5k tiles, ~530 MB, for ONE river. This asserts the problem is real, so
  // nobody "simplifies" the corridor logic away later.
  const naive = tileCountForRange(CURRENT_RIVER_BOUNDS, 8, 15);
  assert.ok(naive > 10000, `expected >10k tiles, got ${naive}`);
  assert.ok(estimateBytes(naive) > 300 * 1024 * 1024);
});

test('corridor chunking brings a river into shippable range', () => {
  // A synthetic diagonal river across the same bbox, matching the real point
  // count closely enough to exercise the chunking.
  const coords: Array<[number, number]> = Array.from({ length: 632 }, (_, i) => {
    const t = i / 631;
    return [-91.6614 + t * 0.905, 36.252224 + t * 1.198];
  });

  const boxes = corridorBoxes(coords, 64, 2);
  assert.ok(boxes.length >= 8 && boxes.length <= 12, `got ${boxes.length} boxes`);

  const naive = tileCountForRange(CURRENT_RIVER_BOUNDS, 8, 14);
  const corridor = tileCountForBoxes(boxes, 8, 14);
  assert.ok(corridor < naive, 'corridor must be smaller than the bbox');
  // Measured saving at z8-14 was ~3.2x on the real geometry.
  assert.ok(naive / corridor > 2, `saving was only ${(naive / corridor).toFixed(1)}x`);
});

test('z8-14 over a corridor stays within a downloadable budget', () => {
  const coords: Array<[number, number]> = Array.from({ length: 632 }, (_, i) => {
    const t = i / 631;
    return [-91.6614 + t * 0.905, 36.252224 + t * 1.198];
  });
  const bytes = estimateBytes(tileCountForBoxes(corridorBoxes(coords), 8, 14));
  // Budget check, not a precise figure: a river must not be a ~500 MB download.
  assert.ok(bytes < 150 * 1024 * 1024, `estimated ${formatBytes(bytes)}`);
});

// ── buffering ────────────────────────────────────────────────────

test('buffering widens bounds in both axes', () => {
  const [minLng, minLat, maxLng, maxLat] = bufferBounds(CURRENT_RIVER_BOUNDS, 2);
  assert.ok(minLng < CURRENT_RIVER_BOUNDS[0]);
  assert.ok(minLat < CURRENT_RIVER_BOUNDS[1]);
  assert.ok(maxLng > CURRENT_RIVER_BOUNDS[2]);
  assert.ok(maxLat > CURRENT_RIVER_BOUNDS[3]);
});

test('the longitude buffer widens with latitude', () => {
  // Longitude degrees shrink toward the poles, so the same km buffer must span
  // more degrees further north. Without the cos(lat) term a buffer tuned for
  // Missouri would be too narrow in Alaska.
  const missouri = bufferBounds([-91, 37, -91, 37], 10);
  const alaska = bufferBounds([-91, 65, -91, 65], 10);
  assert.ok(alaska[2] - alaska[0] > missouri[2] - missouri[0]);
});

test('latitude buffering is clamped to the Mercator limit', () => {
  const [, minLat, , maxLat] = bufferBounds([-91, 84.9, -91, 84.9], 500);
  assert.ok(maxLat <= 85.0511287798066);
  assert.ok(minLat >= -85.0511287798066);
});

// ── line bounds ──────────────────────────────────────────────────

test('bounds enclose every coordinate', () => {
  const bounds = boundsForLine([
    [-91.5, 37.0],
    [-90.9, 36.4],
    [-91.2, 37.3],
  ]);
  assert.deepEqual(bounds, [-91.5, 36.4, -90.9, 37.3]);
});

test('empty and non-finite input yields null rather than Infinity bounds', () => {
  assert.equal(boundsForLine([]), null);
  assert.equal(boundsForLine([[NaN, NaN]]), null);
  assert.equal(corridorBoxes([]).length, 0);
});

test('corridor chunks overlap so there is no gap mid-river', () => {
  const coords: Array<[number, number]> = Array.from({ length: 130 }, (_, i) => [
    -91 + i * 0.01,
    37,
  ]);
  const boxes = corridorBoxes(coords, 64, 0);
  // Chunk n ends at the point chunk n+1 starts from, so ranges must touch.
  assert.ok(boxes.length >= 2);
  assert.ok(boxes[1][0] <= boxes[0][2], 'consecutive boxes must overlap in longitude');
});

test('size formatting stays readable across magnitudes', () => {
  assert.equal(formatBytes(500 * 1024), '500 KB');
  assert.equal(formatBytes(5.5 * 1024 * 1024), '5.5 MB');
  assert.equal(formatBytes(42 * 1024 * 1024), '42 MB');
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.0 GB');
});
