import assert from 'node:assert/strict';
import test from 'node:test';
import { gaugeFreshness, observationAgeHours, isCurrentWaterMeasurement } from './gauge-freshness';
import { percentileBatch, PERCENTILE_SHARDS } from './percentile-shards';
const now = Date.parse('2026-09-23T12:00:00Z');
const ago = (hours: number) => new Date(now - hours * 3600000).toISOString();
test('freshness uses observation time with exact boundaries and rejects invalid/future timestamps', () => {
  for (const [hours, status] of [[0,'live'], [6,'live'], [6.01,'delayed'], [24,'delayed'], [24.01,'historical'], [24*365*60,'historical']] as const) assert.equal(gaugeFreshness(ago(hours), now), status);
  for (const time of [null, '', 'not-a-date', ago(-1)]) {
    assert.equal(gaugeFreshness(time, now), 'unavailable');
    assert.equal(observationAgeHours(time, now), null);
  }
});
test('historical water quality cannot masquerade as current temperature or oxygen', () => {
  assert.equal(isCurrentWaterMeasurement({ observedAt: '2013-10-01T00:00:00Z' }, now), false);
  assert.equal(isCurrentWaterMeasurement({ observedAt: ago(24) }, now), true);
  assert.equal(isCurrentWaterMeasurement({ observedAt: ago(24.01) }, now), false);
  assert.equal(isCurrentWaterMeasurement({ observedAt: 'invalid' }, now), false);
});
test('statistics shards cover every station once per cycle independent of catalog order', () => {
  const ids = Array.from({ length: 14259 }, (_, i) => String(1000000 + i));
  const seen = Array.from({ length: PERCENTILE_SHARDS }, (_, hour) => percentileBatch([...ids, ...ids.slice(0,100)], hour)).flat();
  assert.equal(seen.length, ids.length);
  assert.deepEqual([...seen].sort(), [...ids].sort());
  for (let hour = 0; hour < PERCENTILE_SHARDS; hour++) {
    const batch = percentileBatch(ids, hour);
    assert.deepEqual(percentileBatch([...ids].reverse(), hour), batch);
    if (batch.length > 1) assert.equal(percentileBatch(ids, hour + PERCENTILE_SHARDS)[0], batch[1]);
  }
});
