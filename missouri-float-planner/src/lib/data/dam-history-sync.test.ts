import assert from 'node:assert/strict';
import test from 'node:test';
import { syncDamHistory, summarizeHistorySync, type HistorySyncIO } from './dam-history-sync';
import { USACE_DAMS, recordsHistory } from '@/lib/flow-providers/usace-registry';
import { jobOutcome } from '@/lib/admin/dashboard/jobs-model';

const NOW = Date.parse('2026-10-15T12:25:00Z');
const HOUR_MS = 3_600_000;
const dam = USACE_DAMS['swt-keystone-dam'];
const sources = {
  generationFlow: { tsId: 'KEYS.Flow-Power.Ave.1Hour.1Hour.rev', unit: 'cfs' },
  release: { tsId: 'KEYS.Flow-Res Out.Inst.1Hour.0.rev', unit: 'cfs' },
};
const point = (iso: string, value = 0) => ({ timestamp: Date.parse(iso), value });
function io(overrides: Partial<HistorySyncIO> = {}): HistorySyncIO {
  return {
    resolve: async () => sources,
    fetch: async () => ({ points: [point('2026-10-15T11:00:00Z')], units: 'cfs', name: 'test', retrievedAt: null }),
    write: async (_id, _metric, buckets) => buckets.length,
    ...overrides,
  };
}

test('zero flow is healthy and period-ending readings are shifted before the open-hour filter', async () => {
  const writes: Array<{ metric: string; hours: string[] }> = [];
  const results = await syncDamHistory(dam, 72, NOW, io({
    fetch: async (_office, _tsId, _unit, begin, end, options) => {
      assert.equal(begin.getTime(), NOW - 72 * HOUR_MS);
      assert.equal(end.getTime(), NOW);
      assert.equal(options?.skipCache, true);
      return { points: [point('2026-10-15T12:00:00Z')], units: 'cfs', name: 'test', retrievedAt: null };
    },
    write: async (_id, metric, buckets) => {
      assert.equal(buckets[0].valueCfs, 0);
      writes.push({ metric, hours: buckets.map((b) => b.observedHour) });
      return buckets.length;
    },
  }));
  assert.deepEqual(writes, [{ metric: 'generationFlow', hours: ['2026-10-15T11:00:00.000Z'] }]);
  assert.equal(results[0].status, 'ok');
  assert.equal(results[1].status, 'empty');
});

test('missing resolution is degraded even when another expected stream works', async () => {
  const summary = summarizeHistorySync(await syncDamHistory(dam, 48, NOW, io({
    resolve: async () => ({ release: sources.release }),
  })));
  assert.equal(summary.monitoring_status, 'partial');
  assert.equal(summary.ok, false);
  assert.equal(summary.metricsExpected, 2);
  assert.equal(summary.metricsHealthy, 1);
  assert.equal(summary.issues[0].status, 'missing');
  assert.equal(jobOutcome(summary, 200).status, 'partial');
});

test('replaying only old data writes useful history but does not count as recovery', async () => {
  const summary = summarizeHistorySync(await syncDamHistory(dam, 72, NOW, io({
    fetch: async () => ({ points: [point('2026-10-14T08:00:00Z')], units: 'cfs', name: 'test', retrievedAt: null }),
  })));
  assert.equal(summary.written, 2);
  assert.equal(summary.metricsSeen, 2);
  assert.equal(summary.metricsHealthy, 0);
  assert.equal(summary.monitoring_status, 'error');
  assert.ok(summary.issues.every((s) => s.status === 'stale'));
  assert.equal(jobOutcome(summary, 200).status, 'error');
});

test('empty, invalid and future-only responses cannot count as healthy coverage', async () => {
  for (const points of [[], [point('2026-10-15T11:00:00Z', -1)], [point('2026-10-15T15:00:00Z')]]) {
    const summary = summarizeHistorySync(await syncDamHistory(dam, 48, NOW, io({
      fetch: async () => ({ points, units: 'cfs', name: 'test', retrievedAt: null }),
      write: async () => { throw new Error('empty buckets must not be written'); },
    })));
    assert.equal(summary.metricsHealthy, 0);
    assert.ok(summary.issues.every((s) => s.status === 'empty'));
  }
});

test('a failed write does not stop the other metric from being collected', async () => {
  const results = await syncDamHistory(dam, 48, NOW, io({
    write: async (_id, metric, buckets) => {
      if (metric === 'generationFlow') throw new Error('write failed');
      return buckets.length;
    },
  }));
  assert.equal(results[0].status, 'error');
  assert.equal(results[1].status, 'ok');
  assert.equal(summarizeHistorySync(results).monitoring_status, 'partial');
});

test('partial and zero database writes are failures even with fresh source data', async () => {
  for (const written of [0, 1]) {
    const results = await syncDamHistory(dam, 48, NOW, io({
      fetch: async () => ({ points: [point('2026-10-15T10:00:00Z'), point('2026-10-15T11:00:00Z')], units: 'cfs', name: 'test', retrievedAt: null }),
      write: async () => written,
    }));
    assert.ok(results.every((s) => s.status === 'write_failed'));
    assert.equal(summarizeHistorySync(results).metricsHealthy, 0);
  }
});

test('resolver errors and daily replacements retain the expected denominator', async () => {
  const failed = await syncDamHistory(dam, 48, NOW, io({ resolve: async () => { throw new Error('catalog failed'); } }));
  assert.equal(summarizeHistorySync(failed).metricsExpected, 2);
  assert.ok(failed.every((s) => s.status === 'error'));
  const daily = await syncDamHistory(dam, 48, NOW, io({ resolve: async () => ({
    generationFlow: { ...sources.generationFlow, dailyMean: true },
  }) }));
  assert.deepEqual(daily.map((s) => s.status), ['daily_mean', 'missing']);
  assert.equal(summarizeHistorySync(daily).metricsExpected, 2);
});

test('daily-only Mark Twain is not an expected hourly outage', async () => {
  const results = await syncDamHistory(USACE_DAMS['mvs-mark-twain'], 48, NOW, io({
    resolve: async () => ({ release: { ...sources.release, dailyMean: true } }),
  }));
  assert.equal(summarizeHistorySync(results).metricsExpected, 0);
  assert.equal(summarizeHistorySync(results).monitoring_status, 'ok');
});

test('the 16-of-36 incident reports partial coverage and names all twenty missing streams', async () => {
  const results = [];
  for (const dam of Object.values(USACE_DAMS).filter(recordsHistory)) {
    results.push(...await syncDamHistory(dam, 48, NOW, io({
      resolve: async () => dam.resolvedHistoryMetrics ? {} : dam.series,
    })));
  }
  const summary = summarizeHistorySync(results);
  assert.equal(summary.metricsExpected, 36);
  assert.equal(summary.metricsHealthy, 16);
  assert.equal(summary.monitoring_status, 'partial');
  assert.equal(summary.issues.filter((s) => s.expected).length, 20);
});

test('all expected streams recovered produces OK', async () => {
  const summary = summarizeHistorySync(await syncDamHistory(dam, 48, NOW, io()));
  assert.equal(summary.metricsHealthy, 2);
  assert.equal(summary.monitoring_status, 'ok');
  assert.equal(jobOutcome(summary, 200).status, 'ok');
});
