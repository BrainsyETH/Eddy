import assert from 'node:assert/strict';
import test from 'node:test';
import { boundsForLine, formatBytes } from '../../../packages/eddy-geo/index';

// This file used to cover the Web Mercator tile maths behind the offline map
// download — tile counts per zoom, corridor boxes along a river, and the
// download-size estimate. That feature was removed and the maths went with it,
// so what is left is the two helpers that outlived it: the line bounds the map
// camera uses, and the byte formatter the Storage screen reads.

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
  // The camera fits whatever this returns. Infinity bounds would send it to
  // the whole globe; null is a case the caller already handles.
  assert.equal(boundsForLine([]), null);
  assert.equal(boundsForLine([[NaN, NaN]]), null);
});

test('a partly corrupt line still yields bounds from the points that are real', () => {
  assert.deepEqual(
    boundsForLine([
      [-91.5, 37.0],
      [NaN, 36.0],
      [-90.9, 36.4],
    ]),
    [-91.5, 36.4, -90.9, 37.0],
  );
});

// ── size formatting ──────────────────────────────────────────────

test('size formatting stays readable across magnitudes', () => {
  assert.equal(formatBytes(500 * 1024), '500 KB');
  assert.equal(formatBytes(5.5 * 1024 * 1024), '5.5 MB');
  assert.equal(formatBytes(42 * 1024 * 1024), '42 MB');
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2.0 GB');
});
