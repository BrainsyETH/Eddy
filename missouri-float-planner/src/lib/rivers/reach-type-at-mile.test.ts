import assert from 'node:assert/strict';
import test from 'node:test';
import { pickReachRiverType } from './reach-type-at-mile';

// The Black, as migration 00204 seeds it: the upper reach inherits (NULL), the
// lower reach is a tailwater from mile 38 down.
const BLACK = [
  { river_type: null, river_mile_start: null, river_mile_end: '38.0' },
  { river_type: 'dam_tailwater', river_mile_start: '38.0', river_mile_end: null },
];

test('a put-in below the dam is a tailwater even though the river row is not', () => {
  assert.equal(pickReachRiverType(BLACK, 45, 'spring_fed_float'), 'dam_tailwater');
  assert.equal(pickReachRiverType(BLACK, 38, 'spring_fed_float'), 'dam_tailwater');
});

test('a put-in above the dam inherits the river row', () => {
  assert.equal(pickReachRiverType(BLACK, 20, 'spring_fed_float'), 'spring_fed_float');
  assert.equal(pickReachRiverType(BLACK, 37.9, 'spring_fed_float'), 'spring_fed_float');
});

test('an inheriting reach never overrides the fallback', () => {
  const rows = [{ river_type: null, river_mile_start: 0, river_mile_end: 100 }];
  assert.equal(pickReachRiverType(rows, 50, 'rain_flashy'), 'rain_flashy');
  assert.equal(pickReachRiverType(rows, 50, null), null);
});

test('no reaches, or an unusable mile, is the fallback', () => {
  assert.equal(pickReachRiverType(null, 10, 'spring_fed_float'), 'spring_fed_float');
  assert.equal(pickReachRiverType([], 10, 'spring_fed_float'), 'spring_fed_float');
  assert.equal(pickReachRiverType(BLACK, Number.NaN, 'spring_fed_float'), 'spring_fed_float');
  assert.equal(pickReachRiverType(BLACK, null, 'spring_fed_float'), 'spring_fed_float');
});

test('numbers and numeric strings are both miles', () => {
  const rows = [{ river_type: 'dam_tailwater', river_mile_start: 12, river_mile_end: 30 }];
  assert.equal(pickReachRiverType(rows, 12, null), 'dam_tailwater');
  assert.equal(pickReachRiverType(rows, 29.99, null), 'dam_tailwater');
  assert.equal(pickReachRiverType(rows, 30, null), null);
  assert.equal(pickReachRiverType(rows, 11.99, null), null);
});
