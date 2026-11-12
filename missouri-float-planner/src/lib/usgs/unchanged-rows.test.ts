import assert from 'node:assert/strict';
import test from 'node:test';
import {
  latestRowUnchanged,
  percentileRowUnchanged,
  type NextLatestRow,
  type PercentileValues,
  type StoredLatestRow,
} from './unchanged-rows';

// These pin the write-skipping that keeps the national crons from rewriting
// identical rows (the load that exhausted production disk I/O on 2026-11-12).
// A false "unchanged" would freeze a gauge on an old reading, so each test
// checks the change that must still be written as well as the skip.

const next: NextLatestRow = {
  gauge_station_id: 'st-1',
  reading_timestamp: '2026-11-12T02:00:00.000Z',
  gauge_height_ft: 3.456,
  discharge_cfs: 412.004,
  qualifiers: ['P'],
  flow_percentile: 41,
};

// PostgREST's shape: numeric as numbers at the column's precision, offset timestamps.
const stored: StoredLatestRow = {
  gauge_station_id: 'st-1',
  reading_timestamp: '2026-11-12T02:00:00+00:00',
  gauge_height_ft: 3.46,
  discharge_cfs: 412,
  qualifiers: ['P'],
  flow_percentile: 41,
};

test('a reading the row already holds is skipped, despite timestamp format and column rounding', () => {
  assert.equal(latestRowUnchanged(stored, next), true);
  assert.equal(latestRowUnchanged({ ...stored, gauge_height_ft: '3.46', discharge_cfs: '412.00' }, next), true);
});

test('a gauge with no stored row is always written', () => {
  assert.equal(latestRowUnchanged(undefined, next), false);
});

test('a newer reading, a changed value or a changed grade is written', () => {
  assert.equal(latestRowUnchanged(stored, { ...next, reading_timestamp: '2026-11-12T02:15:00.000Z' }), false);
  assert.equal(latestRowUnchanged(stored, { ...next, discharge_cfs: 413 }), false);
  assert.equal(latestRowUnchanged(stored, { ...next, gauge_height_ft: 3.47 }), false);
  assert.equal(latestRowUnchanged(stored, { ...next, flow_percentile: 42 }), false);
  assert.equal(latestRowUnchanged(stored, { ...next, flow_percentile: null }), false);
  assert.equal(latestRowUnchanged(stored, { ...next, qualifiers: ['A'] }), false);
});

test('null and empty qualifiers are the same; a value appearing or clearing is not', () => {
  assert.equal(latestRowUnchanged({ ...stored, qualifiers: null }, { ...next, qualifiers: [] }), true);
  assert.equal(latestRowUnchanged({ ...stored, discharge_cfs: null }, next), false);
  assert.equal(latestRowUnchanged(stored, { ...next, discharge_cfs: null }), false);
  assert.equal(latestRowUnchanged({ ...stored, reading_timestamp: null }, next), false);
});

const values: PercentileValues = {
  p05: 10.5, p10: 12, p20: 15, p25: 18, p50: 30, p75: 55, p80: 61, p90: 90, p95: null, mean: 42.1,
  count_years: 40, begin_year: 1985, end_year: 2025, source: 'usgs_statistics_api_v0',
};

test('a percentile row with the same statistics and source is skipped', () => {
  assert.equal(percentileRowUnchanged({ day_of_year: 1, ...values }, values), true);
  assert.equal(percentileRowUnchanged({ day_of_year: 1, ...values, p05: '10.5', mean: '42.1' }, values), true);
});

test('a new day, a changed statistic or a different source is written', () => {
  assert.equal(percentileRowUnchanged(undefined, values), false);
  assert.equal(percentileRowUnchanged({ day_of_year: 1, ...values, p50: 31 }, values), false);
  assert.equal(percentileRowUnchanged({ day_of_year: 1, ...values, p95: 120 }, values), false);
  assert.equal(percentileRowUnchanged({ day_of_year: 1, ...values, end_year: 2024 }, values), false);
  assert.equal(
    percentileRowUnchanged({ day_of_year: 1, ...values, source: 'usgs_legacy_stat_service' }, values),
    false,
  );
});
