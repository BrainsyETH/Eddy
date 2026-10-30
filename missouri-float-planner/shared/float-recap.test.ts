import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompletedFloat, StartCondition } from './float-archive';
import {
  exploredCopy,
  exploredMiles,
  exploredPercent,
  floatBadge,
  floatCondition,
  floatTracking,
  MOOD_THRESHOLDS,
  moodGate,
  pickFloatMood,
  riverExplored,
  riverLifetimeExplored,
} from './float-recap';

const START = Date.parse('2026-10-26T15:00:00Z');
const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(START + offsetMs).toISOString();

/** A measured four-hour float at planner pace that reached its take-out. */
function trip(overrides: Partial<CompletedFloat> = {}): CompletedFloat {
  return {
    version: 1,
    id: 'float-1',
    riverSlug: 'current',
    riverName: 'Current River',
    putInId: 'akers',
    putInName: 'Akers Ferry',
    takeOutId: 'pulltite',
    takeOutName: 'Pulltite',
    boatType: 'canoe',
    startedAt: START,
    endedAt: START + 4 * HOUR,
    elapsedMs: 4 * HOUR,
    movingMs: 3 * HOUR,
    stoppedMs: 0.5 * HOUR,
    unknownMs: 0.5 * HOUR,
    distanceMiles: 9.8,
    movingMph: 2.5,
    plannerMph: 2.5,
    firstMile: 10,
    lastMile: 19.8,
    reachedTakeOut: true,
    measurementVersion: 1,
    ...overrides,
  };
}

function condition(code: StartCondition['code'], overrides: Partial<StartCondition> = {}): StartCondition {
  return {
    code,
    gaugeName: 'Current River at Akers',
    usgsSiteId: '07064533',
    heightFt: 2.31,
    dischargeCfs: 412,
    observedAt: iso(-20 * 60_000),
    accuracyWarning: false,
    ...overrides,
  };
}

const stale = { observedAt: iso(-7 * HOUR) };

test('tracking: never placed is none, mostly unobserved is partial', () => {
  assert.equal(floatTracking(trip()), 'measured');
  assert.equal(floatTracking(trip({ firstMile: null, lastMile: null, distanceMiles: 0 })), 'none');
  assert.equal(floatTracking(trip({ movingMs: HOUR, stoppedMs: 0, unknownMs: 3 * HOUR })), 'partial');
});

test('every mood rule matches on its own data', () => {
  assert.equal(pickFloatMood(trip()), 'made-it');
  assert.equal(pickFloatMood(trip({ reachedTakeOut: false })), 'good-float');
  assert.equal(pickFloatMood(trip({ startCondition: condition('high') })), 'big-water');
  assert.equal(pickFloatMood(trip({ startCondition: condition('dangerous') })), 'big-water');
  assert.equal(pickFloatMood(trip({ elapsedMs: 6 * 60_000, endedAt: START + 6 * 60_000, movingMs: 0, stoppedMs: 0, unknownMs: 6 * 60_000 })), 'quick-dip');
  assert.equal(pickFloatMood(trip({ startWeather: { tempF: 70, precipIn1h: 0.1, observedAt: iso(-30 * 60_000) } })), 'rain');
  assert.equal(pickFloatMood(trip({ startWeather: { tempF: 41, precipIn1h: 0, observedAt: iso(-30 * 60_000) } })), 'chilly');
  assert.equal(pickFloatMood(trip({ startCondition: condition('low') })), 'scrape');
  assert.equal(pickFloatMood(trip({ startCondition: condition('too_low') })), 'scrape');
  assert.equal(pickFloatMood(trip({ movingMph: 3.5 })), 'speed-run');
  assert.equal(pickFloatMood(trip({ movingMph: 1.5 })), 'lazy-river');
  assert.equal(pickFloatMood(trip({ movingMs: 2 * HOUR, stoppedMs: 1.75 * HOUR, unknownMs: 0.25 * HOUR })), 'lazy-river');
});

test('mood order: no tracking beats High, High beats Quick dip, Quick dip beats Rain, Speed beats Made it', () => {
  const untracked = { firstMile: null, lastMile: null, distanceMiles: 0, movingMph: null };
  assert.equal(pickFloatMood(trip({ ...untracked, startCondition: condition('high') })), null);
  const short = { elapsedMs: 5 * 60_000, endedAt: START + 5 * 60_000, movingMs: 5 * 60_000, stoppedMs: 0, unknownMs: 0 };
  assert.equal(pickFloatMood(trip({ ...short, startCondition: condition('high') })), 'big-water');
  assert.equal(pickFloatMood(trip({ ...short, startWeather: { tempF: 60, precipIn1h: 0.3, observedAt: iso(0) } })), 'quick-dip');
  assert.equal(pickFloatMood(trip({ movingMph: 3.5, reachedTakeOut: true })), 'speed-run');
  assert.equal(
    pickFloatMood(trip({ startCondition: condition('low'), startWeather: { tempF: 40, precipIn1h: 0, observedAt: iso(0) } })),
    'chilly',
    'a cold float on low water gets Chilly on purpose',
  );
});

test('a stale or suspect high reading earns no mood at all, never a celebration', () => {
  for (const reading of [condition('high', stale), condition('dangerous', { accuracyWarning: true })]) {
    assert.equal(pickFloatMood(trip({ startCondition: reading })), null);
    assert.equal(pickFloatMood(trip({ startCondition: reading, movingMph: 3.5 })), null);
  }
  assert.equal(pickFloatMood(trip({ startCondition: condition('low', stale) })), 'made-it', 'a stale Low names nothing');
});

test('speed moods need a measured float and twenty minutes of moving time', () => {
  const partial = { movingMs: HOUR, stoppedMs: 0, unknownMs: 3 * HOUR };
  assert.equal(pickFloatMood(trip({ ...partial, movingMph: 3.5 })), 'made-it');
  assert.equal(pickFloatMood(trip({ ...partial, movingMph: 1 })), 'made-it');
  const brief = { movingMs: MOOD_THRESHOLDS.minMovingMs - 60_000, stoppedMs: 0.1 * HOUR, unknownMs: 4 * HOUR - (MOOD_THRESHOLDS.minMovingMs - 60_000) - 0.1 * HOUR };
  assert.equal(floatTracking(trip(brief)), 'partial');
  assert.equal(pickFloatMood(trip({ elapsedMs: HOUR, endedAt: START + HOUR, movingMs: 15 * 60_000, stoppedMs: 15 * 60_000, unknownMs: 30 * 60_000, movingMph: 3.5 })), 'made-it');
});

test('moodGate: the recap and the share image get the same otter', () => {
  assert.equal(moodGate({ tracking: 'none', code: 'high', current: true }), 'standard');
  assert.equal(moodGate({ tracking: 'none', code: 'dangerous', current: true }), 'standard');
  assert.equal(moodGate({ tracking: 'partial', code: 'high', current: true }), 'big-water');
  assert.equal(moodGate({ tracking: 'measured', code: 'dangerous', current: false }), 'standard');
  assert.equal(moodGate({ tracking: 'measured', code: 'flowing', current: true }), 'open');
  assert.equal(moodGate({ tracking: 'measured', code: null, current: false }), 'open');
});

test('missing data falls through; old floats are never guessed at', () => {
  const old = trip({ movingMph: null, plannerMph: null, reachedTakeOut: false });
  assert.equal(pickFloatMood(old), 'good-float');
  assert.equal(floatCondition(old), null);
  assert.equal(riverExplored(old), null);
  assert.equal(pickFloatMood(trip({ startWeather: { tempF: 20, precipIn1h: 1, observedAt: iso(-3 * HOUR) } })), 'made-it', 'weather from hours before is not the day');
});

test('one condition source: the Start snapshot, else the server reading with a code', () => {
  const water = {
    gaugeName: 'Current River at Van Buren',
    gaugeStationId: 'station-uuid',
    observedAt: iso(5 * 60_000),
    heightFt: 3.1,
    dischargeCfs: 900,
    conditionCode: 'high' as const,
    usgsSiteId: '07067000',
  };
  assert.equal(floatCondition(trip({ water, startCondition: condition('flowing') }))?.code, 'flowing');
  const fallback = floatCondition(trip({ water }));
  assert.equal(fallback?.source, 'water');
  assert.equal(fallback?.current, true);
  assert.equal(pickFloatMood(trip({ water })), 'big-water');
  const unlabelled = { ...water, conditionCode: undefined };
  assert.equal(floatCondition(trip({ water: unlabelled })), null, 'a reading with no code is shown, never labelled');
});

test('malformed fields read as absent and never throw', () => {
  const junk = [
    { startCondition: { code: 'purple' } },
    { startCondition: condition('unknown' as StartCondition['code']) },
    { startCondition: 'high' },
    { startWeather: { tempF: 'cold' } },
    { riverSpan: { firstMile: 10, lastMile: 5, firstName: 'a', lastName: 'b' }, coveredMiles: [[6, 7]] },
    { riverSpan: { firstMile: 0, lastMile: 10, firstName: 'a', lastName: 'b' }, coveredMiles: [[2, 'x']] },
    { riverSpan: { firstMile: 0, lastMile: 10, firstName: 'a', lastName: 'b' }, coveredMiles: { 0: [1, 2] } },
  ] as unknown as Partial<CompletedFloat>[];
  for (const fields of junk) {
    const t = trip(fields);
    assert.doesNotThrow(() => pickFloatMood(t));
    assert.equal(floatBadge(t), null);
    assert.equal(riverExplored(t), null);
  }
});

test('badge: the condition label and readings at reported precision', () => {
  assert.deepEqual(floatBadge(trip({ startCondition: condition('flowing') })), {
    code: 'flowing',
    label: 'Flowing',
    cfsLabel: '412 cfs',
    ftLabel: '2.31 ft',
    current: true,
  });
  assert.equal(floatBadge(trip({ startCondition: condition('flowing', stale) }))?.current, false);
});

const span = { firstMile: 0, lastMile: 100, firstName: 'Montauk', lastName: 'Big Spring' };

test('river explored: credited intervals clamped to the span', () => {
  const result = riverExplored(trip({ riverSpan: span, coveredMiles: [[-2, 3], [10, 15.5], [99, 104], [120, 130]] }));
  assert.ok(result);
  assert.equal(result.miles, 3 + 5.5 + 1);
  assert.equal(result.fraction, 0.095);
  assert.deepEqual(result.segments, [{ start: 0, end: 0.03 }, { start: 0.1, end: 0.155 }, { start: 0.99, end: 1 }]);
  assert.equal(riverExplored(trip({ riverSpan: span, coveredMiles: [[120, 130]] })), null, 'wholly outside');
  assert.equal(riverExplored(trip({ riverSpan: span, coveredMiles: null })), null, 'too many to keep');
  assert.equal(riverExplored(trip({ riverSpan: span })), null, 'an older build');
  assert.equal(riverExplored(trip({ coveredMiles: [[1, 2]] })), null, 'no span');
  assert.equal(riverExplored(trip({ riverSpan: span, coveredMiles: [[1, 2], [2.01, 3]] }))?.segments.length, 2, 'a few metres apart stays two');
});

test('river explored copy leads with miles; the share is secondary', () => {
  assert.deepEqual(exploredCopy(riverExplored(trip({ riverSpan: span, coveredMiles: [[10, 15.5]] }))!, 'the Current'), {
    miles: '5.5 river miles explored',
    share: '6% of the Current’s float miles',
  });
  assert.equal(exploredCopy(riverExplored(trip({ riverSpan: span, coveredMiles: [[10, 10.4]] }))!, 'the Current').share, 'Under 1% of the Current’s float miles');
  assert.equal(exploredCopy(riverExplored(trip({ riverSpan: span, coveredMiles: [[10, 11]] }))!, 'the Current').miles, '1.0 river mile explored');
});

test('lifetime: one common boundary, never over 100%', () => {
  const older = trip({ id: 'a', startedAt: START - 400 * HOUR, endedAt: START - 396 * HOUR, riverSpan: span, coveredMiles: [[0, 100]] });
  const newer = trip({ id: 'b', riverSpan: { ...span, firstMile: 10, lastMile: 90 }, coveredMiles: [[20, 30]] });
  const result = riverLifetimeExplored([older, newer], 'current');
  assert.ok(result);
  assert.equal(result.miles, 80);
  assert.equal(result.fraction, 1);
  assert.equal(result.span.lastMile - result.span.firstMile, 80);
  assert.equal(result.floats, 2);

  const newest = trip({ id: 'c', startedAt: START + 100 * HOUR, endedAt: START + 104 * HOUR, coveredMiles: [[40, 50]] });
  assert.equal(riverLifetimeExplored([older, newer, newest], 'current')?.span.firstMile, 10, 'the newest float without a span cannot set the boundary');
  assert.equal(riverLifetimeExplored([older, newer, newest], 'current')?.floats, 2);

  const overlapping = riverLifetimeExplored([
    trip({ id: 'd', riverSpan: span, coveredMiles: [[10, 20]] }),
    trip({ id: 'e', startedAt: START + HOUR, endedAt: START + 5 * HOUR, riverSpan: span, coveredMiles: [[15, 25]] }),
  ], 'current');
  assert.equal(overlapping?.miles, 15);
  assert.equal(riverLifetimeExplored([older], 'jacks-fork'), null);
});

test('explored copy never rounds to a claim the float did not make', () => {
  assert.equal(exploredMiles(0.04), 'Under 0.1');
  assert.equal(exploredMiles(0.05), '0.1');
  assert.equal(exploredMiles(9.64), '9.6');
  assert.equal(exploredPercent(0.996), '99%', 'not complete, so not 100%');
  assert.equal(exploredPercent(1), '100%');
  assert.equal(exploredPercent(0.004), 'Under 1%');
  assert.equal(exploredPercent(0.015), '2%');
  const sliver = riverExplored(trip({ riverSpan: span, coveredMiles: [[10, 10.04]] }))!;
  assert.deepEqual(exploredCopy(sliver, 'the Current'), {
    miles: 'Under 0.1 river miles explored',
    share: 'Under 1% of the Current’s float miles',
  });
  const nearly = riverExplored(trip({ riverSpan: span, coveredMiles: [[0, 99.6]] }))!;
  assert.equal(exploredCopy(nearly, 'the Current').share, '99% of the Current’s float miles');
  const whole = riverExplored(trip({ riverSpan: span, coveredMiles: [[-1, 101]] }))!;
  assert.equal(exploredCopy(whole, 'the Current').share, '100% of the Current’s float miles');
});

test('a malformed snapshot timestamp cannot mask a valid server reading', () => {
  const water = {
    gaugeName: 'Current River at Van Buren', gaugeStationId: 'station-uuid', observedAt: iso(5 * 60_000),
    heightFt: 3.1, dischargeCfs: 900, conditionCode: 'high' as const, usgsSiteId: '07067000',
  };
  for (const observedAt of ['not a date', '2026-13-45T99:00:00Z']) {
    const chosen = floatCondition(trip({ startCondition: condition('flowing', { observedAt }), water }));
    assert.equal(chosen?.source, 'water', observedAt);
    assert.equal(chosen?.code, 'high');
  }
  assert.equal(floatCondition(trip({ startCondition: condition('flowing', { observedAt: 'soon' }) })), null, 'and with no fallback, nothing');
  assert.equal(floatCondition(trip({ water: { ...water, observedAt: 'later' } })), null);
});

test('a Start snapshot with no USGS id (a USACE station) is still the condition', () => {
  const chosen = floatCondition(trip({ startCondition: condition('high', { usgsSiteId: null }) }));
  assert.equal(chosen?.source, 'start');
  assert.equal(chosen?.usgsSiteId, null);
  assert.equal(pickFloatMood(trip({ startCondition: condition('high', { usgsSiteId: null }) })), 'big-water');
});
