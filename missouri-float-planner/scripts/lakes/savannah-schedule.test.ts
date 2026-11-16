import assert from 'node:assert/strict';
import test from 'node:test';
import { easternDay, scheduleRunRecord, summarizeHorizon, type CwmsValue } from './savannah-schedule';

const NOW = '2026-11-09T18:40:00Z';
const h = (iso: string) => Date.parse(iso);

test('a horizon counts the hours ahead of the read and separates scheduled generation from zero placeholders', () => {
  const scheduled: CwmsValue[] = [
    [h('2026-11-09T15:00:00Z'), 30, 0], [h('2026-11-09T18:00:00Z'), 0, 0], [h('2026-11-09T21:00:00Z'), 66, 0],
    [h('2026-11-10T00:00:00Z'), 52, 0], [h('2026-11-10T03:00:00Z'), 0, 0], [h('2026-11-10T05:00:00Z'), 0, 0], [h('2026-11-10T06:00:00Z'), null, 5],
  ];
  const s = summarizeHorizon(scheduled, NOW);
  assert.equal(s.points, 6);
  assert.equal(s.hours_ahead, 4);
  assert.equal(s.nonzero_hours_ahead, 2);
  assert.equal(s.last_nonzero_ahead_at, '2026-11-10T00:00:00.000Z');
  assert.equal(s.last_at, '2026-11-10T05:00:00.000Z');
  assert.deepEqual(s.eastern_days, ['2026-11-09'], 'the 05:00Z total is the hour ending midnight Eastern, the last hour of the 9th, not a reach into the 10th');
  assert.equal(easternDay(h('2026-11-10T06:00:00Z')), '2026-11-10', 'the next hourly total is the first hour of the 10th');
  assert.equal(easternDay(h('2026-11-10T05:00:00Z'), false), '2026-11-10', 'an instant at 05:00Z, not a period total, is the 10th');
  const observed: CwmsValue[] = [[h('2026-11-09T15:00:00Z'), 29, 0], [h('2026-11-09T21:00:00Z'), 0, 0], [h('2026-11-10T00:00:00Z'), 0, 0]];
  const record = scheduleRunRecord('hartwell', scheduled, observed, NOW);
  assert.equal(record.observed.nonzero_hours_ahead, 0, 'observed energy ahead of now is a placeholder, and must never be read as a schedule');
  assert.deepEqual(record.scheduled_ahead, [['2026-11-09T21:00:00.000Z', 66], ['2026-11-10T00:00:00.000Z', 52], ['2026-11-10T03:00:00.000Z', 0], ['2026-11-10T05:00:00.000Z', 0]]);
});
