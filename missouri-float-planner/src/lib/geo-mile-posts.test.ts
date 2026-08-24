import assert from 'node:assert/strict';
import test from 'node:test';
import { milePosts } from '../../../packages/eddy-geo/index';

// Mile markers along a selected river — see milePosts' header for why a post's
// mile is `fraction × lengthMiles` (the database's own riverMile formula)
// rather than a ground-truth walk of the thinned geometry.

/** A straight north–south line at a fixed longitude. */
function northSouth(latStart: number, latEnd: number, steps: number): Array<[number, number]> {
  const line: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    line.push([-91.5, latStart + ((latEnd - latStart) * i) / steps]);
  }
  return line;
}

test('a 10-mile line posts nine one-mile markers, ends unposted', () => {
  // Mile 0 and the final endpoint are the put-in and take-out everything else
  // already marks; posting them would double-label both ends.
  const posts = milePosts(northSouth(37, 37.2, 20), 10, 1);
  assert.equal(posts.length, 9);
  assert.deepEqual(
    posts.map((p) => p.mile),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test('posts advance monotonically along the line', () => {
  const posts = milePosts(northSouth(37, 37.5, 40), 34.2, 5);
  for (let i = 1; i < posts.length; i++) {
    assert.ok(posts[i].lat > posts[i - 1].lat, 'each post sits downstream of the last');
    assert.ok(posts[i].mile > posts[i - 1].mile);
  }
  assert.ok(posts.every((p) => p.mile < 34.2), 'no post past the river length');
});

test('a post interpolates inside its segment, not onto a vertex', () => {
  // Two vertices, one segment: the 1-mile post on a 2-mile line is its exact
  // midpoint. Vertex-snapping (what the network's colour stops do) would put
  // it on an endpoint.
  const posts = milePosts(
    [
      [-91.5, 37],
      [-91.5, 37.1],
    ],
    2,
    1,
  );
  assert.equal(posts.length, 1);
  assert.ok(Math.abs(posts[0].lat - 37.05) < 1e-9);
  assert.equal(posts[0].lng, -91.5);
});

test('an east–west line is measured like a north–south one', () => {
  // The cos(lat) correction: at 38°N a degree of longitude is ~0.79 of a
  // degree of latitude, so without it an E–W river's posts would bunch toward
  // one end relative to the same river run N–S. Same catalogued length, same
  // interval — the posts must divide both lines into the same number of steps
  // at even spacing.
  const ns = milePosts(northSouth(37, 37.4, 10), 20, 5);
  const ew: Array<[number, number]> = [];
  for (let i = 0; i <= 10; i++) ew.push([-92 + 0.05 * i, 38]);
  const ewPosts = milePosts(ew, 20, 5);
  assert.equal(ns.length, 3);
  assert.equal(ewPosts.length, 3);
  // Even spacing: the middle post of a uniform line is its midpoint.
  assert.ok(Math.abs(ewPosts[1].lng - -91.75) < 1e-9);
});

test('degenerate input posts nothing rather than throwing', () => {
  assert.deepEqual(milePosts([], 10, 1), []);
  assert.deepEqual(milePosts([[-91.5, 37]], 10, 1), []);
  assert.deepEqual(milePosts(northSouth(37, 37.1, 4), 0, 1), []);
  assert.deepEqual(milePosts(northSouth(37, 37.1, 4), 10, 0), []);
  // A zero-length "line" — every vertex identical — has no along-ness to post.
  assert.deepEqual(
    milePosts(
      [
        [-91.5, 37],
        [-91.5, 37],
      ],
      10,
      1,
    ),
    [],
  );
});

test('an interval that never fits posts nothing', () => {
  assert.deepEqual(milePosts(northSouth(37, 37.1, 4), 4.5, 5), []);
});
