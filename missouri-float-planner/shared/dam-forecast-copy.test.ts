import assert from 'node:assert/strict';
import test from 'node:test';
import {
  forecastClockLabel,
  forecastDays,
  nextForecastChangeSentence,
} from './dam-forecast-copy';
import type { DamForecastWindow } from './dam-types';

const ZONE = 'America/Chicago';

function window(
  startIso: string,
  endIso: string,
  generating: boolean,
  peakCfs: number | null = generating ? 15_720 : null
): DamForecastWindow {
  return { startUtc: startIso, endUtc: endIso, generating, peakCfs };
}

test('clock labels are the dam zone, never the host zone', () => {
  // 19:00Z in August is 2 PM CDT; the same UTC hour in January is 1 PM CST.
  // A host machine in any timezone must produce the same strings.
  assert.equal(forecastClockLabel('2026-08-15T19:00:00.000Z', ZONE), '2 PM');
  assert.equal(forecastClockLabel('2026-01-15T19:00:00.000Z', ZONE), '1 PM');
  assert.equal(forecastClockLabel('2026-08-15T05:00:00.000Z', ZONE), '12 AM');
  assert.equal(forecastClockLabel('2026-08-15T17:00:00.000Z', ZONE), '12 PM');
});

test('a window inside one day renders as one span with a hedged peak', () => {
  // 14:00-22:00Z on Aug 15 = 9 AM - 5 PM CDT.
  const days = forecastDays([window('2026-08-15T14:00:00.000Z', '2026-08-15T22:00:00.000Z', true)], ZONE);
  assert.equal(days.length, 1);
  assert.equal(days[0].dayKey, '2026-08-15');
  assert.equal(days[0].dayLabel, 'Sat, Aug 15');
  assert.deepEqual(days[0].spans, [
    { generating: true, label: '9 AM – 5 PM', peakLabel: '~15,720 cfs peak' },
  ]);
});

test('a window crossing midnight files a span under BOTH days', () => {
  // 9 PM CDT Aug 15 to 6 AM CDT Aug 16. A reader scans by day; a span filed
  // only under the day it started would leave tomorrow morning looking
  // unforecast.
  const days = forecastDays(
    [window('2026-08-16T02:00:00.000Z', '2026-08-16T11:00:00.000Z', false, null)],
    ZONE
  );
  assert.equal(days.length, 2);
  assert.equal(days[0].spans[0].label, '9 PM – midnight');
  assert.equal(days[1].spans[0].label, 'midnight – 6 AM');
  assert.equal(days[0].spans[0].peakLabel, null, 'idle spans carry no peak');
});

test('the 25-hour fall-back day stays one day', () => {
  // 2026-11-01: Central runs 05:00Z Nov 1 to 06:00Z Nov 2 — 25 real hours.
  // The walk discovers days by formatting instants, so the long day groups
  // as one day with no invented split and no dropped hour.
  const days = forecastDays(
    [window('2026-11-01T05:00:00.000Z', '2026-11-02T06:00:00.000Z', false, null)],
    ZONE
  );
  assert.equal(days.length, 1);
  assert.equal(days[0].dayKey, '2026-11-01');
  assert.equal(days[0].spans[0].label, 'midnight – midnight');
});

test('the 23-hour spring-forward day stays one day', () => {
  // 2026-03-08: Central runs 06:00Z Mar 8 to 05:00Z Mar 9 — 23 real hours.
  const days = forecastDays(
    [window('2026-03-08T06:00:00.000Z', '2026-03-09T05:00:00.000Z', false, null)],
    ZONE
  );
  assert.equal(days.length, 1);
  assert.equal(days[0].dayKey, '2026-03-08');
  assert.equal(days[0].spans[0].label, 'midnight – midnight');
});

// ── nextForecastChangeSentence ──────────────────────────────────────────────
// NOW for these: 2026-08-15T19:30:00Z = 2:30 PM CDT, Saturday.
const NOW = Date.parse('2026-08-15T19:30:00Z');

test('a stop later today names the clock alone', () => {
  const windows = [
    window('2026-08-15T14:00:00.000Z', '2026-08-16T02:00:00.000Z', true),
    window('2026-08-16T02:00:00.000Z', '2026-08-16T11:00:00.000Z', false, null),
  ];
  assert.equal(
    nextForecastChangeSentence(windows, ZONE, NOW),
    'Generation forecast to stop at 9 PM'
  );
});

test('a start tomorrow says tomorrow', () => {
  const windows = [
    window('2026-08-15T14:00:00.000Z', '2026-08-16T11:00:00.000Z', false, null),
    window('2026-08-16T11:00:00.000Z', '2026-08-16T20:00:00.000Z', true),
  ];
  assert.equal(
    nextForecastChangeSentence(windows, ZONE, NOW),
    'Generation forecast to start at 6 AM tomorrow'
  );
});

test('midnight at the start of tomorrow is midnight TONIGHT', () => {
  // The correction nextScheduleChangeSentence carries, for the same reason:
  // a reader at 2:30 PM is nine and a half hours from this boundary, and
  // "midnight tomorrow" reads as a day later — the dangerous direction.
  const windows = [
    window('2026-08-15T14:00:00.000Z', '2026-08-16T05:00:00.000Z', true),
    window('2026-08-16T05:00:00.000Z', '2026-08-16T11:00:00.000Z', false, null),
  ];
  assert.equal(
    nextForecastChangeSentence(windows, ZONE, NOW),
    'Generation forecast to stop at midnight tonight'
  );
});

test('a flip two days out names the weekday', () => {
  const windows = [
    window('2026-08-15T14:00:00.000Z', '2026-08-17T11:00:00.000Z', false, null),
    window('2026-08-17T11:00:00.000Z', '2026-08-17T20:00:00.000Z', true),
  ];
  assert.equal(
    nextForecastChangeSentence(windows, ZONE, NOW),
    'Generation forecast to start at 6 AM Monday'
  );
});

test('fails closed: no window over now, a gap, or no next window all say nothing', () => {
  // No window containing now — the forecast cannot say what the dam is doing.
  assert.equal(
    nextForecastChangeSentence(
      [window('2026-08-16T00:00:00.000Z', '2026-08-16T05:00:00.000Z', true)],
      ZONE,
      NOW
    ),
    null
  );
  // A gap between the current window and the next: "stops at 9 PM" would be
  // read off hours the source said nothing about.
  assert.equal(
    nextForecastChangeSentence(
      [
        window('2026-08-15T14:00:00.000Z', '2026-08-15T22:00:00.000Z', true),
        window('2026-08-16T00:00:00.000Z', '2026-08-16T05:00:00.000Z', false, null),
      ],
      ZONE,
      NOW
    ),
    null
  );
  // A single window with nothing after it: the posted forecast never flips.
  assert.equal(
    nextForecastChangeSentence(
      [window('2026-08-15T14:00:00.000Z', '2026-08-16T02:00:00.000Z', true)],
      ZONE,
      NOW
    ),
    null
  );
});
