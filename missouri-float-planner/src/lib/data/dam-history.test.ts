import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPatternDays,
  centralDayHours,
  bucketHourly,
  patternDayKeys,
  patternHasObservations,
  PATTERN_PAST_DAYS,
  type StoredHour,
} from './dam-history';

/** A CWMS sample. */
function point(iso: string, value: number) {
  return { timestamp: Date.parse(iso), value };
}

/** A stored hour, as the pattern read hands it back. */
function stored(metric: StoredHour['metric'], iso: string, valueCfs: number): StoredHour {
  return { metric, observedHour: iso, valueCfs };
}

// 17:00 UTC is noon Central in July (CDT).
const NOON_CENTRAL = Date.parse('2026-07-28T17:00:00Z');

test('an hour is the mean of its samples, not the last one', () => {
  // The bar is an hour wide, so a spot value is not what it represents. A dam
  // that ramps from 0 to 20,000 at :30 has an honest hourly mean near 10,000;
  // drawing the :55 sample would show a full hour of full generation that never
  // happened.
  const buckets = bucketHourly([
    point('2026-07-28T14:00:00Z', 0),
    point('2026-07-28T14:15:00Z', 0),
    point('2026-07-28T14:30:00Z', 20_000),
    point('2026-07-28T14:45:00Z', 20_000),
  ]);

  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].observedHour, '2026-07-28T14:00:00.000Z');
  assert.equal(buckets[0].valueCfs, 10_000);
  assert.equal(buckets[0].sampleCount, 4, 'kept so a one-sample hour is recognisable');
});

test('buckets come back in time order, one per hour', () => {
  const buckets = bucketHourly([
    point('2026-07-28T16:10:00Z', 300),
    point('2026-07-28T14:10:00Z', 100),
    point('2026-07-28T15:10:00Z', 200),
  ]);
  assert.deepEqual(
    buckets.map((b) => b.valueCfs),
    [100, 200, 300]
  );
});

test('junk samples are dropped rather than averaged in', () => {
  // A negative discharge means the series does not mean what the resolver
  // thinks it means. The table's CHECK would reject it; dropping it here keeps
  // the mean of the surrounding good samples honest.
  const buckets = bucketHourly([
    point('2026-07-28T14:00:00Z', 100),
    point('2026-07-28T14:15:00Z', -5),
    point('2026-07-28T14:30:00Z', 300),
    { timestamp: Date.parse('2026-07-28T14:45:00Z'), value: Number.NaN },
  ]);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].valueCfs, 200);
  assert.equal(buckets[0].sampleCount, 2);
});

test('an empty series produces no buckets rather than a zero hour', () => {
  assert.deepEqual(bucketHourly([]), []);
});

// ── The period-ending convention ───────────────────────────────────────────
// The bug these pin shipped because the two halves of the feature disagreed:
// dam-forecast.ts mapped a stamp to [t-1h, t) and this file floored it. Both
// conventions are now stated in tests, so a change to either one that does not
// change the other fails here.

test('a period-ending hourly mean lands on the hour it covers, not the one it is stamped', () => {
  // Measured at Tenkiller, 2026-08-14: the Ave.1Hour.1Hour series read 0 at
  // 12:00Z and 258 at 13:00Z, while the Inst series read 258 AT 12:00Z. The
  // 13:00Z stamp is the average of 12:00–13:00, so it is the 12:00 bar. Drawing
  // it at 13:00 said the units started an hour later than they did.
  const buckets = bucketHourly(
    [point('2026-08-14T13:00:00Z', 258), point('2026-08-14T14:00:00Z', 1808)],
    3_600_000
  );

  assert.deepEqual(
    buckets.map((b) => b.observedHour),
    ['2026-08-14T12:00:00.000Z', '2026-08-14T13:00:00.000Z']
  );
  assert.equal(buckets[0].valueCfs, 258, 'the hour that ended at 13:00Z');
});

test('an instantaneous series is left where its stamp puts it', () => {
  // Duration 0 means the point IS the moment. Shifting it would invent the
  // same off-by-one in the other direction.
  const buckets = bucketHourly([point('2026-08-14T12:00:00Z', 258)], 0);
  assert.equal(buckets[0].observedHour, '2026-08-14T12:00:00.000Z');
});

test('a sub-hourly period-ending series folds into the hour it spans', () => {
  // A 15-minute mean stamped 11:00 covers 10:45–11:00, so it belongs to the
  // 10:00 bar with its three siblings — not to 11:00 on its own. Shifting by
  // the duration rather than a flat hour is what makes this work.
  const buckets = bucketHourly(
    [
      point('2026-08-14T10:15:00Z', 100),
      point('2026-08-14T10:30:00Z', 200),
      point('2026-08-14T10:45:00Z', 300),
      point('2026-08-14T11:00:00Z', 400),
    ],
    900_000
  );

  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].observedHour, '2026-08-14T10:00:00.000Z');
  assert.equal(buckets[0].valueCfs, 250);
  assert.equal(buckets[0].sampleCount, 4);
});

// ── Folding into Central days ──────────────────────────────────────────────

test('the pattern window is seven days behind today, oldest first', () => {
  const keys = patternDayKeys(PATTERN_PAST_DAYS, NOON_CENTRAL);
  assert.equal(keys.length, 8, 'seven days behind, plus today');
  assert.equal(keys[0], '2026-07-21');
  assert.equal(keys[7], '2026-07-28');
});

test('the window is built from Central days, not the server’s', () => {
  // 03:00 UTC on the 29th is still 10 PM on the 28th at the dam. A window built
  // from the server's own date would shift the whole strip by a day every
  // evening — the same bug weekdayFileFor once had for schedule files.
  const lateEvening = Date.parse('2026-07-29T03:00:00Z');
  assert.equal(patternDayKeys(1, lateEvening)[1], '2026-07-28');
});

test('an observation lands on the Central hour it was measured in', () => {
  // Index 0 is hour ending 1 — midnight to 1 AM Central. This is the same
  // off-by-one that "puts an angler in the water an hour early" everywhere else
  // in the feature, so it is done once and pinned here.
  const days = buildPatternDays(
    [
      stored('generationFlow', '2026-07-28T05:00:00Z', 19_130), // midnight CDT
      stored('generationFlow', '2026-07-28T18:00:00Z', 8_200), // 1 PM CDT
      stored('release', '2026-07-28T18:00:00Z', 8_550),
    ],
    { now: NOON_CENTRAL }
  );

  const today = days.find((d) => d.scheduleDate === '2026-07-28')!;
  assert.equal(today.turbineCfs[0], 19_130, 'hour ending 1 sits at index 0');
  assert.equal(today.turbineCfs[13], 8_200, 'hour ending 14 sits at index 13');
  assert.equal(today.totalReleaseCfs[13], 8_550);
  assert.equal(today.turbineCfs.length, 24);
});

test('an hour with no observation stays null, never zero', () => {
  // The rule the whole module exists to hold. A gap drawn as an empty bar says
  // "the units were off" — which is a claim about the river during an outage.
  const days = buildPatternDays(
    [stored('generationFlow', '2026-07-28T18:00:00Z', 8_200)],
    { now: NOON_CENTRAL }
  );
  const today = days.find((d) => d.scheduleDate === '2026-07-28')!;

  assert.equal(today.turbineCfs[12], null);
  assert.equal(today.totalReleaseCfs[13], null, 'one metric present does not fill the other');
  assert.equal(
    today.turbineCfs.filter((v) => v === null).length,
    23,
    'every unobserved hour is null, not 0'
  );
});

test('a day with nothing stored is still emitted', () => {
  // Dropping a dead day would close the gap and draw a continuous week that
  // never happened.
  const days = buildPatternDays(
    [stored('generationFlow', '2026-07-28T18:00:00Z', 8_200)],
    { now: NOON_CENTRAL }
  );
  assert.equal(days.length, 8);
  assert.deepEqual(
    days.map((d) => d.scheduleDate),
    ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28']
  );
  const quiet = days.find((d) => d.scheduleDate === '2026-07-24')!;
  assert.ok(quiet.turbineCfs.every((v) => v === null));
});

test('rows outside the window are ignored rather than wrapped in', () => {
  // A retention straggler, and a row from the future. Neither has a bar to go
  // in, and neither may be folded onto some other day's hour.
  const days = buildPatternDays(
    [
      stored('generationFlow', '2026-06-01T18:00:00Z', 5_000),
      stored('generationFlow', '2026-08-05T18:00:00Z', 5_000),
      stored('generationFlow', 'not-a-timestamp', 5_000),
    ],
    { now: NOON_CENTRAL }
  );
  assert.ok(days.every((d) => d.turbineCfs.every((v) => v === null)));
});

test('a pattern of pure gaps is not worth drawing', () => {
  // Better absent than misleading: a strip of nothing reads as a week of
  // silence at the powerhouse rather than as a feature with no data yet.
  const empty = buildPatternDays([], { now: NOON_CENTRAL });
  assert.equal(patternHasObservations(empty), false);

  const one = buildPatternDays(
    [stored('release', '2026-07-26T18:00:00Z', 1_250)],
    { now: NOON_CENTRAL }
  );
  assert.equal(patternHasObservations(one), true, 'one observed hour anywhere is enough');
});

// ── Daylight saving ────────────────────────────────────────────────────────
// A Central calendar day is not always 24 hours long, and the first version of
// this module assumed it was. Both failures below were reproduced against the
// real implementation before being fixed.

test('a Central day knows its own length', () => {
  assert.equal(centralDayHours('2026-07-28'), 24, 'an ordinary day');
  assert.equal(centralDayHours('2026-03-08'), 23, 'spring forward');
  assert.equal(centralDayHours('2026-11-01'), 25, 'fall back');
});

/** One observation every UTC hour across a span, each value distinct. */
function everyHour(startUtc: string, count: number): StoredHour[] {
  return Array.from({ length: count }, (_, h) => ({
    metric: 'generationFlow' as const,
    observedHour: new Date(Date.parse(startUtc) + h * 3_600_000).toISOString(),
    valueCfs: 1000 + h,
  }));
}

test('spring forward does not invent a missing observation', () => {
  // The old 24-slot array left index 2 null on a feed that never missed a
  // reading, so the strip would have drawn "Eddy has no observation here" on a
  // perfectly healthy day — the one claim this payload exists not to make
  // falsely.
  const days = buildPatternDays(everyHour('2026-03-08T06:00:00Z', 23), {
    now: Date.parse('2026-03-09T18:00:00Z'),
    past: 2,
  });
  const day = days.find((d) => d.scheduleDate === '2026-03-08')!;

  assert.equal(day.turbineCfs.length, 23, 'the day is 23 hours and says so');
  assert.ok(
    day.turbineCfs.every((v) => v !== null),
    `a healthy feed left gaps: ${JSON.stringify(day.turbineCfs)}`
  );
  assert.equal(day.startUtc, '2026-03-08T06:00:00.000Z');
});

test('fall back does not discard an observation', () => {
  // 1 AM CDT and 1 AM CST both mapped to Central hour 1, so the second silently
  // overwrote the first and one real reading was lost every November.
  const days = buildPatternDays(everyHour('2026-11-01T05:00:00Z', 25), {
    now: Date.parse('2026-11-02T18:00:00Z'),
    past: 2,
  });
  const day = days.find((d) => d.scheduleDate === '2026-11-01')!;

  assert.equal(day.turbineCfs.length, 25, 'the day is 25 hours and says so');
  assert.deepEqual(
    day.turbineCfs,
    Array.from({ length: 25 }, (_, h) => 1000 + h),
    'every hour survives, in order, none overwritten'
  );
  assert.equal(day.startUtc, '2026-11-01T05:00:00.000Z');
});

test('an ordinary day is still 24 hours anchored at Central midnight', () => {
  const days = buildPatternDays(everyHour('2026-07-28T05:00:00Z', 24), {
    now: Date.parse('2026-07-28T17:00:00Z'),
    past: 1,
  });
  const day = days.find((d) => d.scheduleDate === '2026-07-28')!;
  assert.equal(day.turbineCfs.length, 24);
  assert.equal(day.startUtc, '2026-07-28T05:00:00.000Z');
  assert.equal(day.turbineCfs[0], 1000, 'index 0 is the hour beginning at midnight Central');
});
