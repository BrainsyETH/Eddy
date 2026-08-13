import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPatternDays,
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
