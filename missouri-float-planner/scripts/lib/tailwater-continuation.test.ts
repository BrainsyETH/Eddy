import assert from 'node:assert/strict';
import test from 'node:test';
import { appendReviewedContinuation } from './tailwater-continuation';

const mouth = [-92.289813, 36.210834];
const base = [[-92.288, 36.212], mouth];
const downstream = [mouth, [-92.290645, 36.210395], [-92.290387783, 36.209253598]];

test('Norfork continuation follows the White bend to the east-bank ramp station', () => {
  const joined = appendReviewedContinuation(base, downstream);
  assert.deepEqual(joined.coordinates, [base[0], ...downstream]);
  assert.ok(joined.addedMiles > 0.13 && joined.addedMiles < 0.14);
  assert.equal(base.length, 2, 'source geometry is not mutated');
});

test('a reversed, disconnected or oversized continuation cannot silently bridge a route', () => {
  assert.throws(() => appendReviewedContinuation(base, [...downstream].reverse()), /does not join/);
  assert.throws(() => appendReviewedContinuation(base, [[-92.28, 36.21], downstream[2]]), /does not join/);
  assert.throws(() => appendReviewedContinuation(base, [mouth, [-92.29, 36.1]]), /length/);
  assert.throws(() => appendReviewedContinuation(base, [mouth]), /two points/);
});
