import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestMarkerIndex } from './marker-pointer-priority';

const cedargrove = { left: 667, top: 99, width: 44, height: 44 };
const flyingW = { left: 675, top: 109, width: 44, height: 44 };

test('an overlapping marker activates the access point nearest the pointer', () => {
  assert.equal(nearestMarkerIndex([cedargrove, flyingW], 689, 121), 0);
  assert.equal(nearestMarkerIndex([cedargrove, flyingW], 697, 131), 1);
});

test('no marker is prioritized when the pointer is outside the hit radius', () => {
  assert.equal(nearestMarkerIndex([cedargrove, flyingW], 900, 400), null);
});

test('an exact centre remains stable regardless of DOM insertion order', () => {
  assert.equal(nearestMarkerIndex([flyingW, cedargrove], 689, 121), 1);
});
