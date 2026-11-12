import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gradedOnSameDay,
  latestReadingUnchanged,
  latestRowCurrent,
  percentileRowUnchanged,
  type LatestReading,
  type PercentileValues,
  type StoredLatestRow,
} from './unchanged-rows';

// These pin the skipping that keeps the national crons from rereading and
// rewriting rows that have not changed (the load that exhausted production disk
// I/O on 2026-11-12). A false "unchanged" would freeze a gauge on an old
// reading or grade, so each test checks what must still be written as well as
// what is skipped.

const next: LatestReading = {
  reading_timestamp: '2026-11-12T02:00:00.000Z',
  gauge_height_ft: 3.456,
  discharge_cfs: 412.004,
  qualifiers: ['P'],
};

// PostgREST's shape: numeric as numbers at the column's precision, offset timestamps.
const stored: StoredLatestRow = {
  gauge_station_id: 'st-1',
  reading_timestamp: '2026-11-12T02:00:00+00:00',
  gauge_height_ft: 3.46,
  discharge_cfs: 412,
  qualifiers: ['P'],
  fetched_at: '2026-11-12T02:05:00+00:00',
};

const sameDay = new Date('2026-11-12T03:20:00Z');

test('a reading the row already holds is unchanged, despite timestamp format and column rounding', () => {
  assert.equal(latestReadingUnchanged(stored, next), true);
  assert.equal(latestReadingUnchanged({ ...stored, gauge_height_ft: '3.46', discharge_cfs: '412.00' }, next), true);
});

test('a gauge with no stored row is never skipped', () => {
  assert.equal(latestReadingUnchanged(undefined, next), false);
  assert.equal(latestRowCurrent(undefined, next, sameDay), false);
});

test('a newer reading or a changed value or qualifier is not skipped', () => {
  assert.equal(latestReadingUnchanged(stored, { ...next, reading_timestamp: '2026-11-12T02:15:00.000Z' }), false);
  assert.equal(latestReadingUnchanged(stored, { ...next, discharge_cfs: 413 }), false);
  assert.equal(latestReadingUnchanged(stored, { ...next, gauge_height_ft: 3.47 }), false);
  assert.equal(latestReadingUnchanged(stored, { ...next, qualifiers: ['A'] }), false);
});

test('null and empty qualifiers are the same; a value appearing or clearing is not', () => {
  assert.equal(latestReadingUnchanged({ ...stored, qualifiers: null }, { ...next, qualifiers: [] }), true);
  assert.equal(latestReadingUnchanged({ ...stored, discharge_cfs: null }, next), false);
  assert.equal(latestReadingUnchanged(stored, { ...next, discharge_cfs: null }), false);
  assert.equal(latestReadingUnchanged({ ...stored, reading_timestamp: null }, next), false);
});

test('an unchanged reading is regraded once a day, because the percentile depends on the day', () => {
  assert.equal(latestRowCurrent(stored, next, sameDay), true);
  const tomorrow = new Date(sameDay.getTime() + 24 * 3_600_000);
  assert.equal(gradedOnSameDay(stored.fetched_at, tomorrow), false);
  assert.equal(latestRowCurrent(stored, next, tomorrow), false);
  assert.equal(gradedOnSameDay(null, sameDay), false);
  assert.equal(gradedOnSameDay('not a date', sameDay), false);
});

test('a changed reading is regraded even when the row was written today', () => {
  assert.equal(latestRowCurrent(stored, { ...next, discharge_cfs: 500 }, sameDay), false);
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
