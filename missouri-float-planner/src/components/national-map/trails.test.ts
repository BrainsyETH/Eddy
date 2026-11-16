import assert from 'node:assert/strict';
import test from 'node:test';
import { allocate, MAX_PARTICLES, selectBySpacing, TRAIL_CLASSES, wantedParticles } from './trails';

test('the cap serves the big rivers first; streams take what is left', () => {
  assert.deepEqual(allocate([100, 50, 80, 200], 300), [100, 50, 80, 70]);
  assert.deepEqual(allocate([400, 50], 300), [300, 0], 'streams get nothing rather than thinning the trunk rivers');
  const order = TRAIL_CLASSES.map((c) => c.key);
  assert.deepEqual(order.slice(0, 3), ['trunk', 'major', 'regional'], 'priority order starts with the largest rivers');
  assert.ok(order.indexOf('stream') > order.indexOf('tributary'));
  assert.ok(MAX_PARTICLES > 0);
});

test('density holds per screen pixel as the view zooms', () => {
  // Half the channel length visible at 2× zoom is the same screen length as all of it at the fit.
  assert.equal(wantedParticles(1000 * 1, 1 / 20), wantedParticles(500 * 2, 1 / 20));
  assert.equal(wantedParticles(0, 1 / 20), 0);
});

test('small streams nationally: longest first, one per cell, long enough to move', () => {
  const keep = selectBySpacing(
    [
      { length: 30, midX: 5, midY: 5 }, // cell 0:0, longest there
      { length: 20, midX: 8, midY: 6 }, // cell 0:0, loses to the longer line
      { length: 25, midX: 30, midY: 5 }, // cell 1:0
      { length: 4, midX: 70, midY: 5 }, // too short
    ],
    22,
    9,
  );
  assert.deepEqual(keep, [true, false, true, false]);
});

test('trail classes keep the hierarchy: smaller channels are thinner, fainter and slower', () => {
  const by = Object.fromEntries(TRAIL_CLASSES.map((c) => [c.key, c]));
  for (const [big, small] of [['trunk', 'major'], ['major', 'regional'], ['regional', 'tributary'], ['tributary', 'stream']]) {
    assert.ok(by[big].width > by[small].width, `${big} wider than ${small}`);
    assert.ok(by[big].alpha > by[small].alpha, `${big} brighter than ${small}`);
    assert.ok(by[big].speed > by[small].speed, `${big} faster than ${small}`);
  }
});
