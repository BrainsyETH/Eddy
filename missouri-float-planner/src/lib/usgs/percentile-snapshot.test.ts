import assert from 'node:assert/strict';
import test from 'node:test';
import { leapDayOfYear, leapDayOfYearForDate } from './percentile-snapshot';
import { parseDailyStatisticsRdb, parseRdb } from '../flow-providers/usgs';
import { calculateDischargePercentile } from './gauges';
import type { DailyStatistics } from '../flow-providers/types';

// ── leap-year normalization ──────────────────────────────────────
// The whole point: a calendar date must map to ONE row regardless of the
// year's leapness, or every date after February silently shifts by a day.

test('day-of-year anchors to leap-year offsets', () => {
  assert.equal(leapDayOfYear(1, 1), 1);
  assert.equal(leapDayOfYear(2, 28), 59);
  assert.equal(leapDayOfYear(2, 29), 60);
  assert.equal(leapDayOfYear(3, 1), 61);
  assert.equal(leapDayOfYear(12, 31), 366);
});

test('the same calendar date maps to the same row in leap and non-leap years', () => {
  // July 25 — after February, exactly where naive day-of-year drifts.
  const leapYear = leapDayOfYearForDate(new Date(2024, 6, 25));
  const nonLeapYear = leapDayOfYearForDate(new Date(2026, 6, 25));
  assert.equal(leapYear, nonLeapYear);
  assert.equal(leapYear, 207);
});

test('Feb 29 has its own row rather than colliding with Mar 1', () => {
  assert.notEqual(leapDayOfYear(2, 29), leapDayOfYear(3, 1));
});

test('impossible dates return null instead of a wrong number', () => {
  assert.equal(leapDayOfYear(0, 1), null);
  assert.equal(leapDayOfYear(13, 1), null);
  assert.equal(leapDayOfYear(1, 0), null);
  assert.equal(leapDayOfYear(1, 32), null);
  assert.equal(leapDayOfYear(1.5, 1), null);
});

// ── RDB parsing ──────────────────────────────────────────────────
// The statistics service only speaks RDB — format=json returns HTTP 400.

const RDB_HEADER =
  'agency_cd\tsite_no\tparameter_cd\tts_id\tloc_web_ds\tmonth_nu\tday_nu\tbegin_yr\tend_yr\tcount_nu\tmean_va\tp05_va\tp10_va\tp20_va\tp25_va\tp50_va\tp75_va\tp80_va\tp90_va\tp95_va';
const RDB_SPEC = '5s\t15s\t5s\t10n\t15s\t3n\t3n\t6n\t6n\t8n\t12s\t12s\t12s\t12s\t12s\t12s\t12s\t12s\t12s\t12s';

function rdb(...dataRows: string[]) {
  return ['# comment', '#', RDB_HEADER, RDB_SPEC, ...dataRows].join('\n');
}

test('skips comments and the format-spec row', () => {
  const rows = parseRdb(rdb('USGS\t07068000\t00060\t76361\t\t1\t1\t1922\t2026\t105\t3100'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].site_no, '07068000');
  assert.equal(rows[0].month_nu, '1');
});

test('parses a real-shaped statistics row, including the empty p90', () => {
  // Verbatim shape from waterservices.usgs.gov for site 07068000: p80 and p95
  // carry values while p90_va is blank.
  const rows = parseDailyStatisticsRdb(
    rdb('USGS\t07068000\t00060\t76361\t\t1\t1\t1922\t2026\t105\t3100\t1100\t1180\t1420\t1480\t2300\t3420\t3920\t\t9000')
  );

  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, {
    month: 1,
    day: 1,
    p05: 1100,
    p10: 1180,
    p20: 1420,
    p25: 1480,
    p50: 2300,
    p75: 3420,
    p80: 3920,
    p90: null,
    p95: 9000,
    mean: 3100,
    countYears: 105,
    beginYear: 1922,
    endYear: 2026,
  });
});

test('treats the USGS no-data sentinel as null, not a flow value', () => {
  const rows = parseDailyStatisticsRdb(
    rdb('USGS\t07068000\t00060\t76361\t\t2\t1\t1922\t2026\t105\t-999999\t\t100\t\t\t200\t\t\t\t')
  );
  assert.equal(rows[0].mean, null);
  assert.equal(rows[0].p05, null);
  assert.equal(rows[0].p10, 100);
});

test('skips rows with an unusable month/day', () => {
  const rows = parseDailyStatisticsRdb(
    rdb(
      'USGS\t07068000\t00060\t76361\t\t13\t1\t1922\t2026\t105\t100',
      'USGS\t07068000\t00060\t76361\t\t6\t15\t1922\t2026\t105\t100'
    )
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].month, 6);
});

test('empty or malformed payloads yield no rows rather than throwing', () => {
  assert.deepEqual(parseDailyStatisticsRdb(''), []);
  assert.deepEqual(parseDailyStatisticsRdb('# only comments'), []);
  assert.deepEqual(parseRdb(''), []);
});

// ── percentile math survives the missing p90 ─────────────────────

function stats(overrides: Partial<DailyStatistics>): DailyStatistics {
  return {
    siteId: '07068000',
    month: 7,
    day: 25,
    p10: 100,
    p25: 150,
    p50: 200,
    p75: 300,
    p90: null,
    mean: 250,
    yearsOfRecord: 100,
    ...overrides,
  };
}

test('percentile is still computable when USGS omits p90', () => {
  // This is the live situation: p90 empty, p95 present. Before the upper-anchor
  // fallback this returned null and the whole flow-rating feature was dead.
  const result = calculateDischargePercentile(400, stats({ p90: null, p95: 500 }));
  assert.notEqual(result, null);
  assert.ok(result! > 75 && result! < 95, `expected between p75 and p95, got ${result}`);
});

test('falls back to p80 when neither p90 nor p95 is published', () => {
  const result = calculateDischargePercentile(350, stats({ p90: null, p80: 400 }));
  assert.notEqual(result, null);
  assert.ok(result! > 75 && result! <= 80, `expected between p75 and p80, got ${result}`);
});

test('prefers a real p90 when the service does publish one', () => {
  const withP90 = calculateDischargePercentile(400, stats({ p90: 500, p95: 900 }));
  const withoutP90 = calculateDischargePercentile(400, stats({ p90: null, p95: 500 }));
  // Same anchor value, different label → different (correct) percentiles.
  assert.notEqual(withP90, withoutP90);
});

test('returns null only when no upper percentile at all is available', () => {
  assert.equal(calculateDischargePercentile(400, stats({ p90: null })), null);
});

test('flow above the upper anchor still yields a bounded percentile', () => {
  const result = calculateDischargePercentile(5000, stats({ p90: null, p95: 500 }));
  assert.ok(result !== null && result <= 100, `expected ≤100, got ${result}`);
});
