import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observationNormalsUrl,
  parseObservationNormals,
  parseTimeOfYear,
  type NormalsResponse,
} from './usgs-statistics';

// Fixtures below are VERBATIM from
// api.waterdata.usgs.gov/statistics/v0/observationNormals for USGS-07068000
// (Current River at Doniphan), captured 2026-08-02. Only computation_id is
// dropped. If the response shape changes, this file should fail before any
// river page does.

function payload(...values: unknown[]): NormalsResponse {
  return {
    features: [
      {
        properties: {
          monitoring_location_id: 'USGS-07068000',
          data: [{ parameter_code: '00060', values: values as never }],
        },
      },
    ],
    next: null,
  };
}

const JUL_4_PERCENTILE = {
  time_of_year: '07-04',
  time_of_year_type: 'day_of_year',
  values: ['1233.0', '1260.0', '1525.0', '1980.0', '2550.0', '3390.0', '3950.0'],
  percentiles: ['5', '10', '25', '50', '75', '90', '95'],
  sample_count: 105,
  approval_status: 'approved',
  computation: 'percentile',
};

const JUL_4_MEAN = {
  time_of_year: '07-04',
  time_of_year_type: 'day_of_year',
  value: '2284.0',
  sample_count: 105,
  approval_status: 'approved',
  computation: 'arithmetic_mean',
};

// ── the shape the app actually consumes ──────────────────────────

test('merges the percentile and mean computations onto one day row', () => {
  const rows = parseObservationNormals(payload(JUL_4_PERCENTILE, JUL_4_MEAN));

  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, {
    month: 7,
    day: 4,
    p05: 1233,
    p10: 1260,
    p20: null, // not published by the modern API
    p25: 1525,
    p50: 1980,
    p75: 2550,
    p80: null, // not published by the modern API
    p90: 3390,
    p95: 3950,
    mean: 2284,
    countYears: 105,
    beginYear: null,
    endYear: null,
  });
});

test('p90 is populated — the legacy service left it empty for every site', () => {
  // This is the whole reason upperAnchor() in src/lib/usgs/gauges.ts exists.
  // If this ever goes null again, the flow band's top cut point (90) silently
  // reverts to interpolating off p95.
  const [row] = parseObservationNormals(payload(JUL_4_PERCENTILE));
  assert.equal(row.p90, 3390);
});

test('the computations may arrive in either order', () => {
  const meanFirst = parseObservationNormals(payload(JUL_4_MEAN, JUL_4_PERCENTILE));
  const percentileFirst = parseObservationNormals(payload(JUL_4_PERCENTILE, JUL_4_MEAN));
  assert.deepEqual({ ...meanFirst[0] }, { ...percentileFirst[0] });
});

// ── Feb 29 ───────────────────────────────────────────────────────

test('Feb 29 parses, and carries its genuinely smaller sample', () => {
  // Real numbers: 26 leap years of record against 105 for an ordinary day.
  // The row is honest rather than absent; count_years is what tells a reader
  // how much weight it carries.
  const rows = parseObservationNormals(
    payload({
      time_of_year: '02-29',
      time_of_year_type: 'day_of_year',
      values: ['1177.5', '1476.0', '1842.5', '2140.0', '2977.5', '4316.0', '4700.5'],
      percentiles: ['5', '10', '25', '50', '75', '90', '95'],
      sample_count: 26,
      computation: 'percentile',
    })
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].month, 2);
  assert.equal(rows[0].day, 29);
  assert.equal(rows[0].p50, 2140);
  assert.equal(rows[0].countYears, 26);
});

// ── the ways this could silently produce wrong numbers ───────────

test('a values/percentiles length mismatch is skipped, never zipped', () => {
  // Misaligning these would write p50 into the p75 column — a plausible-looking
  // wrong answer, which is worse than no answer.
  const rows = parseObservationNormals(
    payload({
      time_of_year: '07-04',
      time_of_year_type: 'day_of_year',
      values: ['1233.0', '1260.0'],
      percentiles: ['5', '10', '25'],
      sample_count: 105,
      computation: 'percentile',
    })
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].p05, null);
  assert.equal(rows[0].p10, null);
  assert.equal(rows[0].p25, null);
});

test('percentile columns follow the labels, not the array position', () => {
  // A site publishing a shorter ladder must not shift every number one column
  // to the left.
  const rows = parseObservationNormals(
    payload({
      time_of_year: '07-04',
      time_of_year_type: 'day_of_year',
      values: ['1980.0', '3390.0'],
      percentiles: ['50', '90'],
      sample_count: 40,
      computation: 'percentile',
    })
  );
  assert.equal(rows[0].p50, 1980);
  assert.equal(rows[0].p90, 3390);
  assert.equal(rows[0].p05, null);
});

test('month-of-year rows are ignored', () => {
  // Omitting normal_type returns MOY entries alongside DOY. '07' would parse as
  // a date under a laxer reader and overwrite a real day.
  const rows = parseObservationNormals(
    payload(
      { ...JUL_4_PERCENTILE, time_of_year: '07', time_of_year_type: 'month_of_year' },
      JUL_4_MEAN
    )
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].p50, null);
  assert.equal(rows[0].mean, 2284);
});

test('a different parameter in the same response is ignored', () => {
  const response: NormalsResponse = {
    features: [
      {
        properties: {
          data: [
            { parameter_code: '00065', values: [JUL_4_PERCENTILE] as never },
            { parameter_code: '00060', values: [JUL_4_MEAN] as never },
          ],
        },
      },
    ],
  };
  const rows = parseObservationNormals(response, '00060');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mean, 2284);
  assert.equal(rows[0].p50, null);
});

test('rows come back in calendar order', () => {
  const rows = parseObservationNormals(
    payload(
      { ...JUL_4_MEAN, time_of_year: '12-31' },
      { ...JUL_4_MEAN, time_of_year: '01-01' },
      { ...JUL_4_MEAN, time_of_year: '07-04' }
    )
  );
  assert.deepEqual(
    rows.map((r) => [r.month, r.day]),
    [[1, 1], [7, 4], [12, 31]]
  );
});

test('an empty response is an empty array, not a throw', () => {
  assert.deepEqual(parseObservationNormals({}), []);
  assert.deepEqual(parseObservationNormals({ features: [] }), []);
});

// ── time_of_year parsing ─────────────────────────────────────────

test('time_of_year is MM-DD, and anything else is rejected', () => {
  assert.deepEqual(parseTimeOfYear('07-04'), { month: 7, day: 4 });
  assert.deepEqual(parseTimeOfYear('12-31'), { month: 12, day: 31 });
  assert.equal(parseTimeOfYear('07'), null); // month-of-year
  assert.equal(parseTimeOfYear('2026-07-04'), null);
  assert.equal(parseTimeOfYear('13-01'), null);
  assert.equal(parseTimeOfYear('07-32'), null);
  assert.equal(parseTimeOfYear(''), null);
  assert.equal(parseTimeOfYear(undefined), null);
});

// ── the request ──────────────────────────────────────────────────

test('the URL asks for day-of-year JSON at a single site', () => {
  const url = new URL(observationNormalsUrl('07068000', '00060'));
  assert.equal(url.origin + url.pathname, 'https://api.waterdata.usgs.gov/statistics/v0/observationNormals');
  assert.equal(url.searchParams.get('monitoring_location_id'), 'USGS-07068000');
  assert.equal(url.searchParams.get('parameter_code'), '00060');
  assert.equal(url.searchParams.get('normal_type'), 'DOY');
  assert.equal(url.searchParams.get('mime_type'), 'application/json');
});

test('an already-prefixed site id is not double-prefixed', () => {
  const url = new URL(observationNormalsUrl('USGS-07068000', '00060'));
  assert.equal(url.searchParams.get('monitoring_location_id'), 'USGS-07068000');
});
