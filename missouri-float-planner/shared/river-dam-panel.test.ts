import test from 'node:test';
import assert from 'node:assert/strict';
import { coveredDayKey, dailyForecastDays } from './river-dam-panel';

// Sunday 2026-11-01, 7:30 PM CST — when the bad panel was screenshotted.
const SUNDAY_EVENING = Date.parse('2026-11-02T01:30:00Z');

test('CWMS daily points are read as the day BEFORE their stamp', () => {
  // Stamped Monday 00:00 CST: Sunday's average. The old panel labelled it Mon.
  assert.equal(coveredDayKey(Date.parse('2026-11-02T06:00:00Z')), '2026-11-01');
  // Across the DST change (CDT stamp, Oct 31 00:00 local) the rule holds.
  assert.equal(coveredDayKey(Date.parse('2026-10-31T05:00:00Z')), '2026-10-30');
  // An hourly point at hour ending 24 stays on its own day.
  assert.equal(coveredDayKey(Date.parse('2026-11-03T06:00:00Z')), '2026-11-02');
});

test('daily forecast boxes land on the day they cover, from today on', () => {
  // The live Bull Shoals series as the old panel received it on Nov 1.
  const points = [
    { at: '2026-11-01T05:00:00Z', cfs: 1500 }, // Oct 31 — past
    { at: '2026-11-02T06:00:00Z', cfs: 1500 }, // Sun Nov 1 — today
    { at: '2026-11-03T06:00:00Z', cfs: 2300 }, // Mon Nov 2
    { at: '2026-11-04T06:00:00Z', cfs: 2300 }, // Tue Nov 3
  ];
  const days = dailyForecastDays(points, SUNDAY_EVENING);
  assert.deepEqual(
    days.map((d) => [d.key, d.dayName, d.dateLabel, d.cfs]),
    [
      ['2026-11-01', 'Today', 'Nov 1', 1500],
      ['2026-11-02', 'Mon', 'Nov 2', 2300],
      ['2026-11-03', 'Tue', 'Nov 3', 2300],
    ]
  );
});

test('an hourly forecast collapses to each day\'s peak', () => {
  const days = dailyForecastDays(
    [
      { at: '2026-11-02T14:00:00Z', cfs: 3000 },
      { at: '2026-11-02T20:00:00Z', cfs: 9000 },
      { at: '2026-11-02T22:00:00Z', cfs: 4000 },
      { at: 'not a date', cfs: 99_999 },
    ],
    SUNDAY_EVENING
  );
  assert.deepEqual(days.map((d) => [d.key, d.cfs]), [['2026-11-02', 9000]]);
});
