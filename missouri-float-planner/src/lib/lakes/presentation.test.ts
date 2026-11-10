import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lakeReadingIsStale, lakeReadingLabel, sharedObservationAt } from './presentation';
import { publishedLakes, lakePageHref, damLakeExperienceEnabled } from './public-pages';
import { LAKES } from './registry';
import { lakeHealth } from '@/app/api/cron/sync-lake-levels/route';
import type { LakePoolReading } from '@shared/lake-types';

const now = Date.parse('2026-11-09T18:00:00Z');
const pool = (hours: number, daily = false): LakePoolReading => ({ valueFt: 705, at: new Date(now - hours * 3_600_000).toISOString(), daily, staleness: 'fresh' });

test('daily pool age follows daily cadence, including the 36-hour limit', () => {
  assert.equal(lakeReadingIsStale(pool(24, true), now), false);
  assert.equal(lakeReadingIsStale(pool(36, true), now), false);
  assert.equal(lakeReadingIsStale(pool(36.01, true), now), true);
  assert.match(lakeReadingLabel(pool(24, true), now), /^Daily report /);
});

test('hourly pool ages on the display clock rather than a frozen fresh flag', () => {
  assert.equal(lakeReadingIsStale(pool(6), now), false);
  assert.equal(lakeReadingIsStale(pool(6.01), now), true);
  assert.match(lakeReadingLabel(pool(7), now), /Outdated/);
  assert.equal(lakeReadingIsStale({ ...pool(0), at: 'invalid' }, now), true);
  assert.equal(lakeReadingIsStale(pool(-2), now), true);
});

test('shared age requires the same observation instant, not the same rounded age', () => {
  const at = '2026-11-09T17:00:00Z';
  assert.equal(sharedObservationAt([{ at }, undefined, { at: '2026-11-09T11:00:00-06:00' }]), at);
  assert.equal(sharedObservationAt([{ at }, { at: '2026-11-09T17:00:01Z' }]), null);
  assert.equal(sharedObservationAt([{ at: 'invalid' }]), null);
  assert.equal(sharedObservationAt([]), null);
});

test('discovery and lake links use the same reviewed public destinations', () => {
  for (const lake of publishedLakes()) assert.equal(lakePageHref(lake.slug), `/lakes/${lake.slug}`);
  assert.equal(lakePageHref('unknown'), undefined);
});

test('only the approved Table Rock and Truman experiences are public', () => {
  assert.deepEqual(publishedLakes().map(lake => lake.slug).sort(), ['table-rock', 'truman']);
  for (const lake of Object.values(LAKES)) {
    const approved = ['table-rock', 'truman'].includes(lake.slug);
    assert.equal(damLakeExperienceEnabled(lake.pool.damId), approved);
    assert.equal(lakePageHref(lake.slug), approved ? `/lakes/${lake.slug}` : undefined);
    if (approved) assert.equal(lake.rampCautionsVerified, false, 'page publication does not approve ramp thresholds');
  }
  assert.equal(damLakeExperienceEnabled('swl-bull-shoals-dam'), false);
  assert.equal(damLakeExperienceEnabled('unknown'), false);
  assert.equal(lakePageHref('bull-shoals'), undefined);
});

test('collector health becomes degraded when the public observation becomes outdated', () => {
  for (const lake of Object.values(LAKES)) {
    const daily = lake.poolCadence === 'daily';
    for (const hours of [0, 6, 6.01, 24, 36, 36.01, 40, 48, -2]) {
      const reading = pool(hours, daily);
      assert.equal(lakeHealth(lake, [{ at: reading.at }], now).healthy, !lakeReadingIsStale(reading, now));
    }
    assert.equal(lakeHealth(lake, [{ at: 'invalid' }], now).healthy, false);
    assert.equal(lakeHealth(lake, [], now).healthy, false);
  }
});
