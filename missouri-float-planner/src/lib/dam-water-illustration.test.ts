import test from 'node:test';
import referenceFixture from './lakes/fixtures/table-rock-pool-reference.json';
import assert from 'node:assert/strict';
import type { DamSnapshot, DamMetricValue } from '@shared/dam-types';
import type { LakeSection } from '@shared/lake-types';
import { lakePoolPositionSentence } from '@shared/lake-pool-reference';
import { damWaterIllustrationState, hasDamWaterIllustration, tableRockSeasonalPoolFt } from './dam-water-illustration';

const at = '2026-11-17T01:00:00Z';
const now = Date.parse(at) + 600_000;
const metric = (value: number): DamMetricValue => ({ value, unit: 'cfs', at, staleness: 'fresh' });
const dam = (metrics: DamSnapshot['metrics'] = {}): DamSnapshot => ({
  id: 'swl-table-rock-dam', metrics: { poolElevation: { ...metric(909.6), unit: 'ft' }, release: metric(3433), generationFlow: metric(3433), ...metrics },
} as DamSnapshot);

test('illustration stays on the web Table Rock pilot and falls back for incomplete data', () => {
  assert(hasDamWaterIllustration(dam()));
  assert(!hasDamWaterIllustration({ ...dam(), id: 'swl-bull-shoals-dam' }));
  for (const value of [undefined, metric(NaN), { ...metric(1), at: 'invalid' }]) {
    assert(!hasDamWaterIllustration(dam({ poolElevation: value })));
    assert(!hasDamWaterIllustration(dam({ release: value })));
  }
  assert(hasDamWaterIllustration(dam({ release: metric(0) })), 'zero is a real reading');
  assert(!hasDamWaterIllustration(dam({ release: metric(-1) })));
});

test('seasonal pool matches Corps samples, including both 30-minute transitions', () => {
  for (const sample of referenceFixture.samples) for (const [timestamp, expected] of sample.response.values) {
    assert(Math.abs(tableRockSeasonalPoolFt(new Date(timestamp).toISOString())! - expected) < 1e-8);
  }
  for (const [stamp, expected] of [
    ['2026-01-01T05:59:00Z', 915], ['2026-04-30T06:00:00Z', 915],
    ['2026-04-30T06:15:00Z', 915.5], ['2026-04-30T06:30:00Z', 916],
    ['2026-05-31T07:00:00Z', 917], ['2026-11-30T18:00:00Z', 917],
    ['2026-12-01T06:00:00Z', 917], ['2026-12-01T06:15:00Z', 916],
    ['2026-12-01T06:30:00Z', 915], ['2028-04-30T06:15:00Z', 915.5],
  ] as const) assert.equal(tableRockSeasonalPoolFt(stamp), expected, stamp);
  assert.equal(tableRockSeasonalPoolFt('bad'), null);
});

test('flow paths require fresh outlet measurements, never a total-minus-turbines guess', () => {
  const missingSpill = damWaterIllustrationState(dam({ release: metric(12000), generationFlow: metric(8000) }), now);
  assert.equal(missingSpill.spillwayActive, false);
  assert.equal(missingSpill.turbineActive, true);
  assert.equal(damWaterIllustrationState(dam({ spillwayFlow: metric(4000) }), now).spillwayActive, true);
  assert.equal(damWaterIllustrationState(dam({ spillwayFlow: metric(0) }), now).spillwayActive, false);
  assert.equal(damWaterIllustrationState(dam({ release: metric(0), spillwayFlow: metric(4000) }), now).spillwayActive, false);
  for (const change of [{ at: '2026-11-15T01:00:00Z' }, { at: '2026-11-18T01:00:00Z' }, { dailyMean: true }, { value: NaN }, { value: -1 }]) {
    assert.equal(damWaterIllustrationState(dam({ spillwayFlow: { ...metric(4000), ...change } }), now).spillwayActive, false);
    assert.equal(damWaterIllustrationState(dam({ generationFlow: { ...metric(4000), ...change } }), now).turbineActive, false);
  }
  assert.equal(damWaterIllustrationState(dam({ release: { ...metric(12000), dailyMean: true } }), now).turbineActive, false);
});

test('lake movement belongs to the same observation and disappears when stale', () => {
  const lake = { slug: 'table-rock', pool: { valueFt: 909.6, at, staleness: 'fresh' }, change24hFt: -.2 } as LakeSection;
  assert.equal(damWaterIllustrationState(dam(), now, lake).change24hFt, -.2);
  assert.equal(damWaterIllustrationState(dam(), now + 86400000, lake).change24hFt, undefined);
  assert.equal(damWaterIllustrationState(dam(), now, { ...lake, pool: { ...lake.pool!, at: '2026-11-17T00:00:00Z' } }).change24hFt, undefined);
  assert.equal(damWaterIllustrationState(dam(), now, { ...lake, pool: { ...lake.pool!, valueFt: 910 } }).change24hFt, undefined);
  const high = damWaterIllustrationState(dam({ poolElevation: { ...metric(925), unit: 'ft' } }), now);
  assert(high.surfaceY < 98, 'high lake draws above the seasonal line');
  assert(damWaterIllustrationState(dam(), now).surfaceY > 98, 'low lake draws below it');
});

test('lake summaries preserve flood context and resolve older cached references consistently', () => {
  const lake = { slug: 'table-rock', pool: { valueFt: 916, at: '2026-07-01T12:00:00Z' }, operatingRange: { conservationFt: 915, floodFt: 931 } } as LakeSection;
  assert.equal(lakePoolPositionSentence(lake), '1.0 ft below the 917.0 ft seasonal pool.');
  assert.equal(lakePoolPositionSentence({ ...lake, pool: { ...lake.pool!, at: '2026-01-01T12:00:00Z' } }), '1.0 ft above the 915.0 ft seasonal pool, in the flood-control range.');
  for (const [ft, expected] of [
    [917, 'At the 917.0 ft seasonal pool.'],
    [920, '3.0 ft above the 917.0 ft seasonal pool, in the flood-control range.'],
    [931, '14.0 ft above the 917.0 ft seasonal pool, in the flood-control range.'],
    [932, '1.0 ft above the 931 ft flood pool.'],
  ] as const) assert.equal(lakePoolPositionSentence({ ...lake, pool: { ...lake.pool!, valueFt: ft } }), expected);
  assert.equal(lakePoolPositionSentence({ ...lake, pool: undefined }), null);
  const high = damWaterIllustrationState(dam({ poolElevation: metric(932) }), now);
  assert.equal(high.highWaterContext, '1.0 ft above the 931 ft flood pool.');
  assert.equal(damWaterIllustrationState(dam(), now).highWaterContext, null);
});

test('each measured outlet controls only its own flow; total release gates all motion', () => {
  const mixed = dam({ release: metric(9000), generationFlow: { ...metric(7000), at: '2026-11-15T01:00:00Z' }, spillwayFlow: metric(2000) });
  const view = damWaterIllustrationState(mixed, now);
  assert(view.releaseActive);
  assert(!view.turbineActive);
  assert(view.spillwayActive);
  for (const change of [{ dailyMean: true }, { at: '2026-11-15T01:00:00Z' }, { at: '2026-11-18T01:00:00Z' }, { value: 0 }]) {
    const stopped = damWaterIllustrationState({ ...mixed, metrics: { ...mixed.metrics, release: { ...metric(9000), ...change } } }, now);
    assert(!stopped.releaseActive && !stopped.turbineActive && !stopped.spillwayActive);
  }
});
