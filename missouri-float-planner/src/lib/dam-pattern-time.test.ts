import assert from 'node:assert/strict';
import test from 'node:test';
import { patternRows } from '@shared/dam-generation';
import type { DamPatternDay, DamScheduleDay } from '@shared/dam-types';
import { PATTERN_TIME_TICKS, patternTimeTicks } from './dam-pattern-time';

function day(date: string, startUtc: string, count: number): DamPatternDay {
  return { scheduleDate: date, startUtc, turbineCfs: Array(count).fill(1000), totalReleaseCfs: Array(count).fill(1000) };
}
function schedule(date: string): DamScheduleDay {
  return { scheduleDate: date, retrievedAt: `${date}T12:00:00Z`, idle: [], hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: 100, cfs: 1000, isRamp: false })) };
}

test('ordinary observed and future days align with the shared six-hour ruler', () => {
  const now = Date.parse('2026-10-28T18:00:00Z');
  const observed = day('2026-10-27', '2026-10-27T05:00:00Z', 24);
  const rows = patternRows([observed], [schedule('2026-10-29')], undefined, 100, now);
  assert.deepEqual(patternTimeTicks(rows[0], observed.startUtc, now), PATTERN_TIME_TICKS);
  assert.deepEqual(patternTimeTicks(rows[1], undefined, now), PATTERN_TIME_TICKS);
});

for (const [date, startUtc, count, nextDay, indices] of [
  ['2026-03-08', '2026-03-08T06:00:00Z', 23, '2026-03-09T18:00:00Z', [0, 5, 11, 17, 23]],
  ['2026-11-01', '2026-11-01T05:00:00Z', 25, '2026-11-02T18:00:00Z', [0, 7, 13, 19, 25]],
] as const) {
  test(`${count}-hour history places Central-time labels on the correct observed cells`, () => {
    const observed = day(date, startUtc, count);
    const now = Date.parse(nextDay);
    const [row] = patternRows([observed], [], undefined, 100, now);
    assert.deepEqual(patternTimeTicks(row, startUtc, now).map(tick => tick.position), indices.map(i => i / count));
  });
}

for (const [date, startUtc, count, instant, indices] of [
  ['2026-03-08', '2026-03-08T06:00:00Z', 23, '2026-03-08T13:00:00Z', [0, 5, 11, 17, 23]],
  ['2026-11-01', '2026-11-01T05:00:00Z', 25, '2026-11-01T14:00:00Z', [0, 7, 13, 19, 25]],
] as const) {
  test(`${count}-hour today aligns observed and upcoming hours on either side of now`, () => {
    const observed = day(date, startUtc, count);
    const now = Date.parse(instant);
    const [row] = patternRows([observed], [schedule(date)], undefined, 100, now);
    assert.deepEqual(patternTimeTicks(row, startUtc, now).map(tick => tick.position), indices.map(i => i / count));
  });
}

test('an unavailable anchor keeps a usable standard ruler', () => {
  const now = Date.parse('2026-10-28T18:00:00Z');
  const [row] = patternRows([day('2026-10-27', 'invalid', 24)], [], undefined, 100, now);
  assert.deepEqual(patternTimeTicks(row, 'invalid', now), PATTERN_TIME_TICKS);
});
