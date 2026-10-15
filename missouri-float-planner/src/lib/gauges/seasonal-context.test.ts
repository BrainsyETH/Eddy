import test from 'node:test';
import assert from 'node:assert/strict';
import { gaugeSeasonalContext, loadGaugeSeasonalStats } from './seasonal-context';
import type { DailyStatistics } from '../flow-providers/types';

const asOf = new Date('2026-10-15T02:00:00Z');
const reading = { provider: 'usgs', dischargeCfs: 300, readingTimestamp: '2026-10-15T01:45:00Z', readingSuspect: false };
const stats: DailyStatistics = { siteId: '07068000', month: 10, day: 14, parameterCode: '00060',
  p05: 50, p10: 100, p20: 200, p25: 250, p50: 500, p75: 750, p80: 800, p90: 900, p95: 950, mean: 500, yearsOfRecord: 40 };

test('catalog context grades the returned discharge, including zero and newer readings', () => {
  const context = gaugeSeasonalContext(reading, stats, asOf);
  assert.equal(context?.percentile, 30);
  assert.equal(context?.band, 'normal');
  assert.equal(context?.unit, 'cfs');
  assert.equal(context?.asOf, asOf.toISOString());
  assert.equal(gaugeSeasonalContext({ ...reading, dischargeCfs: 0 }, stats, asOf)?.percentile, 0);
  assert.equal(gaugeSeasonalContext({ ...reading, dischargeCfs: 900 }, stats, asOf)?.percentile, 90);
});

test('catalog seasonal context requires fresh trusted USGS discharge and a deep discharge record', () => {
  for (const patch of [
    { provider: 'usace' }, { provider: 'nws' }, { readingSuspect: true },
    { dischargeCfs: null }, { dischargeCfs: NaN }, { dischargeCfs: Infinity },
    { readingTimestamp: null }, { readingTimestamp: 'invalid' },
    { readingTimestamp: '2026-10-14T18:00:00Z' }, { readingTimestamp: '2026-10-16T01:00:00Z' },
  ]) assert.equal(gaugeSeasonalContext({ ...reading, ...patch }, stats, asOf), null);
  for (const record of [null, { ...stats, yearsOfRecord: 9 }, { ...stats, yearsOfRecord: null },
    { ...stats, parameterCode: '00065' }, { ...stats, p10: null }]) {
    assert.equal(gaugeSeasonalContext(reading, record, asOf), null);
  }
});

test('catalog snapshot lookup batches only USGS IDs and uses the Ozarks calendar date', async () => {
  const filters: Record<string, unknown> = {};
  let calls = 0;
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
    in: (column: string, values: string[]) => {
      calls++;
      assert.equal(column, 'site_no');
      assert.deepEqual(values, ['07068000', '07067000']);
      return Promise.resolve({ error: null, data: [{ site_no: '07068000', count_years: 40, p10: 100, p50: 500, p90: 900 }] });
    },
  };
  const client = { from: (table: string) => { assert.equal(table, 'usgs_daily_percentiles'); return builder; } };
  const result = await loadGaugeSeasonalStats(client as unknown as Parameters<typeof loadGaugeSeasonalStats>[0], [
    { provider: 'usgs', usgs_site_id: '07068000' }, { provider: null, usgs_site_id: '07067000' },
    { provider: 'usgs', usgs_site_id: '07068000' }, { provider: 'usace', usgs_site_id: 'dam' },
    { provider: 'usgs', usgs_site_id: null },
  ], new Date('2026-10-01T02:00:00Z'));
  assert.equal(calls, 1);
  assert.deepEqual(filters, { parameter_code: '00060', day_of_year: 274 });
  assert.equal(result.get('07068000')?.yearsOfRecord, 40);
});

test('optional seasonal lookup failure leaves the catalog usable', async () => {
  const client = { from: () => { throw new Error('network unavailable'); } };
  const original = console.warn;
  console.warn = () => {};
  try {
    const result = await loadGaugeSeasonalStats(client as unknown as Parameters<typeof loadGaugeSeasonalStats>[0], [
      { provider: 'usgs', usgs_site_id: '07068000' },
    ], asOf);
    assert.equal(result.size, 0);
  } finally { console.warn = original; }
});
