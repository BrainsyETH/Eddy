import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { stationDayWindow } from '@shared/chart-calendar';
import { initialChartDates, validateChartDates } from '../../../eddy-ios/src/lib/gaugeChartDates';

test('chart date windows use readable UTC calendar dates', async () => {
  const { chartDateRange } = await import('../../../eddy-ios/src/lib/chartDateRange');
  assert.equal(chartDateRange('2026-09-16T00:00:00Z', '2026-09-23T23:59:59Z'), 'Sep 16–23');
  assert.equal(chartDateRange('2026-08-30', '2026-09-02'), 'Aug 30 – Sep 2');
  assert.equal(chartDateRange('2025-12-30', '2026-01-02'), 'Dec 30, 2025 – Jan 2, 2026');
  assert.equal(chartDateRange('bad', '2026-01-02'), 'Selected dates');
});

test('opening and applying shared native dates preserves the station window across device timezones', () => {
  const previous = process.env.TZ;
  const now = Date.parse('2026-12-31T12:00:00Z');
  const cases = [
    { from: '2026-03-01', to: '2026-03-31', days: 31 },
    { from: '2026-11-01', to: '2026-11-30', days: 30 },
    { from: '2024-02-29', to: '2024-02-29', days: 1 },
    { from: '2025-11-01', to: '2026-11-01', days: 366 },
  ];
  try {
    for (const zone of ['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = zone;
      for (const { from, to, days } of cases) {
        const calendar = { from, to };
        const window = stationDayWindow(from, to, 'America/Chicago');
        const fields = initialChartDates(window, calendar);
        assert.deepEqual(fields, calendar, `${zone}: picker must show the saved calendar dates`);
        assert.deepEqual(
          validateChartDates(fields.from, fields.to, now, 'America/Chicago'),
          { window, days },
          `${zone}: applying untouched dates must preserve the saved station-day window`,
        );
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('ordinary native date fields retain their local defaults and supplied window', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const now = new Date('2026-03-31T18:00:00Z');
    assert.deepEqual(initialChartDates(undefined, undefined, now), {
      from: '2026-03-02', to: '2026-03-31',
    });
    assert.deepEqual(initialChartDates({
      from: '2026-03-01T06:00:00Z', to: '2026-04-01T04:59:59Z',
    }), { from: '2026-02-28', to: '2026-03-31' });
    assert.equal(now.toISOString(), '2026-03-31T18:00:00.000Z');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
