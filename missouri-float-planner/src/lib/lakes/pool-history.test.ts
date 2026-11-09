import assert from 'node:assert/strict';
import test from 'node:test';
import { historyForWire, poolChange, toleranceFor } from './pool-history';

const T0 = Date.parse('2026-11-09T18:00:00Z');
const h = (n: number) => T0 - n * 3_600_000;

test('the change is latest minus the reading nearest the window, within tolerance, or null', () => {
  const hourly = [0, 1, 2, 3, 22, 23, 24, 25, 48].map((n) => ({ at: h(n), elevationFt: 915 + n * 0.01 }));
  assert.equal(poolChange(hourly, 24, toleranceFor(false)), -0.24);
  assert.equal(poolChange(hourly, 168, toleranceFor(false)), null, 'a 7-day change needs a reading near 7 days back');
  const sparse = [{ at: h(0), elevationFt: 916 }, { at: h(40), elevationFt: 915 }];
  assert.equal(poolChange(sparse, 24, toleranceFor(false)), null, 'a 40-hour-old reading is not a 24-hour change');
  const daily = [{ at: h(0), elevationFt: 706.3 }, { at: h(24), elevationFt: 706.1 }, { at: h(48), elevationFt: 705.9 }, { at: h(168), elevationFt: 705.0 }];
  assert.equal(poolChange(daily, 24, toleranceFor(true)), 0.2);
  assert.equal(poolChange(daily, 168, toleranceFor(true)), 1.3);
  assert.equal(poolChange([{ at: h(0), elevationFt: 706 }], 24, 3), null);
});

test('the wire history is oldest first, inside the window, and tolerates a slightly future stamp', () => {
  const points = [{ at: h(0), elevationFt: 1 }, { at: h(200), elevationFt: 2 }, { at: h(100), elevationFt: 3 }, { at: T0 + 1_800_000, elevationFt: 4 }];
  assert.deepEqual(historyForWire(points, T0, 7).map(([, v]) => v), [3, 1, 4]);
});
