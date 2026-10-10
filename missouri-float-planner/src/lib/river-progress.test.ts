// missouri-float-planner/src/lib/river-progress.test.ts
//
// Covers packages/eddy-geo/river-progress.ts and float-pace.ts, the pure core
// of Float Mode (#1448). eddy-ios has no test runner; see route-preview.test.ts
// for the same arrangement.
//
// Geometry is built in local metres and converted to lng/lat near the Current
// River, so every scenario reads in distances a person can picture.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARRIVAL_MILES,
  buildRouteIndex,
  matchFix,
  riverMileAt,
  stretchProgress,
  type CalibrationAnchor,
  type LngLat,
  type PositionFix,
  type RouteIndex,
} from '../../../packages/eddy-geo/river-progress';
import {
  estimateRemaining,
  observedPace,
  type PaceSample,
} from '../../../packages/eddy-geo/float-pace';

const MILE = 1609.344;
const LAT0 = 37.0;
const LNG0 = -91.4;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const T0 = Date.parse('2026-07-04T14:00:00Z');

/** Local metres (east, north) to [lng, lat]. */
function at(x: number, y: number): LngLat {
  return [LNG0 + x / (COS * 111_320), LAT0 + y / 111_320];
}

function fix(x: number, y: number, timestamp: number, accuracyMeters: number | null = 10): PositionFix {
  return { lngLat: at(x, y), accuracyMeters, timestamp };
}

function indexOf(line: LngLat[], anchors: CalibrationAnchor[]): RouteIndex {
  const result = buildRouteIndex(line, anchors);
  assert.ok(result.ok, `expected a usable route, got ${result.ok ? '' : result.reason}`);
  return result.index;
}

/** A straight 10 km stretch, densified so segments are short. */
const STRAIGHT: LngLat[] = Array.from({ length: 101 }, (_, i) => at(i * 100, 0));

/**
 * An oxbow: east 1 km, a 120 m neck, then back west 1 km. The two arms are
 * closer to each other than the off-route tolerance, which is the case that
 * defeats nearest-segment matching.
 */
const OXBOW: LngLat[] = [
  ...Array.from({ length: 11 }, (_, i) => at(i * 100, 0)),
  at(1000, 60),
  ...Array.from({ length: 11 }, (_, i) => at(1000 - i * 100, 120)),
];
const OXBOW_LENGTH = 1000 + 120 + 1000;

// ── Calibration ────────────────────────────────────────────────────────────

test('river miles come from the anchors, so bends the line cut are counted', () => {
  // The line measures 10 km but the guide miles say 3% more: the simplified
  // line ran short through bends. Miles must follow the anchors, not the line.
  const guideMiles = (10_000 / MILE) * 1.03;
  const index = indexOf(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 40 },
    { lngLat: at(10_000, 0), riverMile: 40 + guideMiles },
  ]);
  assert.ok(Math.abs(riverMileAt(index, 0) - 40) < 1e-6);
  assert.ok(Math.abs(riverMileAt(index, 10_000) - (40 + guideMiles)) < 1e-6);
  assert.ok(Math.abs(riverMileAt(index, 5_000) - (40 + guideMiles / 2)) < 1e-6);
  const total = stretchProgress(40, 40 + guideMiles, riverMileAt(index, 0)).remainingMiles;
  assert.ok(Math.abs(total - guideMiles) < 1e-6, 'the total must equal the planner distance');
});

test('calibration is piecewise between neighbouring anchors', () => {
  // The middle anchor sits at 4 km but carries 3 miles: the first part of the
  // stretch is curvier than the second. Each part takes its own scale.
  const index = indexOf(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 10 },
    { lngLat: at(4_000, 0), riverMile: 12.6 },
    { lngLat: at(10_000, 0), riverMile: 16.4 },
  ]);
  assert.ok(Math.abs(riverMileAt(index, 2_000) - 11.3) < 1e-6);
  assert.ok(Math.abs(riverMileAt(index, 7_000) - 14.5) < 1e-6);
});

test('a line drawn from the mouth upstream still measures downstream progress', () => {
  // geometry_starts_at_headwaters is false on some rivers: the line runs the
  // other way, so river miles fall along it.
  const index = indexOf(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 6.2 },
    { lngLat: at(10_000, 0), riverMile: 0 },
  ]);
  const putIn = riverMileAt(index, 9_000);
  const here = riverMileAt(index, 5_000);
  const progress = stretchProgress(putIn, riverMileAt(index, 1_000), here);
  assert.ok(progress.travelledMiles > 0 && progress.remainingMiles > 0);
  assert.ok(Math.abs(progress.fraction - 0.5) < 1e-6);
});

test('data that cannot support progress is refused, never corrected', () => {
  const ends: CalibrationAnchor[] = [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(10_000, 0), riverMile: 10_000 / MILE },
  ];
  assert.deepEqual(buildRouteIndex([at(0, 0)], ends), { ok: false, reason: 'too-few-points' });
  assert.deepEqual(buildRouteIndex([], ends), { ok: false, reason: 'too-few-points' });
  assert.deepEqual(buildRouteIndex(null, ends), { ok: false, reason: 'too-few-points' });
  assert.deepEqual(buildRouteIndex(STRAIGHT, [ends[0]]), { ok: false, reason: 'too-few-anchors' });
  assert.deepEqual(
    buildRouteIndex(STRAIGHT, [ends[0], { lngLat: at(5_000, 2_000), riverMile: 3 }]),
    { ok: false, reason: 'anchor-off-line' },
  );
  assert.deepEqual(
    buildRouteIndex(STRAIGHT, [ends[0], { lngLat: at(5_000, 0), riverMile: 5 }, { ...ends[1], riverMile: 4 }]),
    { ok: false, reason: 'anchors-out-of-order' },
  );
  // The War Eagle case: the line is about twice the miles it claims.
  assert.deepEqual(
    buildRouteIndex(STRAIGHT, [ends[0], { ...ends[1], riverMile: 10_000 / MILE / 2 }]),
    { ok: false, reason: 'length-disagreement' },
  );
  // Within the 10% tolerance is accepted.
  assert.equal(buildRouteIndex(STRAIGHT, [ends[0], { ...ends[1], riverMile: (10_000 / MILE) * 1.09 }]).ok, true);
});

// ── Matching ──────────────────────────────────────────────────────────────

const OXBOW_INDEX = indexOf(OXBOW, [
  { lngLat: at(0, 0), riverMile: 0 },
  { lngLat: at(0, 120), riverMile: OXBOW_LENGTH / MILE },
]);

test('on an oxbow the last position keeps the match on the right arm', () => {
  // The paddler is on the first arm but drifting toward the neck, nearer the
  // second arm's line than their own. Nearest-segment matching would jump
  // them a kilometre downstream.
  const previous = { lineMeters: 500, timestamp: T0 };
  const result = matchFix(OXBOW_INDEX, fix(510, 70, T0 + 10_000), previous, T0 + 10_000);
  assert.equal(result.kind, 'matched');
  assert.ok(result.kind === 'matched' && Math.abs(result.lineMeters - 510) < 1 && result.continuous);
  // Proof the scenario is a real trap: with no history, the nearest segment
  // is the wrong arm.
  const unaided = matchFix(OXBOW_INDEX, fix(510, 70, T0 + 10_000), null, T0 + 10_000);
  assert.ok(unaided.kind === 'matched' && unaided.lineMeters > 1_120);
});

test('a match that cannot be reached from the last one widens and is marked discontinuous', () => {
  // A wrong earlier match, or a fix after a gap: nothing near the last
  // position fits, so the whole line is searched and pace must not read the
  // jump as speed.
  const previous = { lineMeters: 500, timestamp: T0 };
  const result = matchFix(OXBOW_INDEX, fix(100, 120, T0 + 5_000), previous, T0 + 5_000);
  assert.equal(result.kind, 'matched');
  assert.ok(result.kind === 'matched' && Math.abs(result.lineMeters - 2020) < 1);
  assert.ok(result.kind === 'matched' && !result.continuous);
});

test('after a long gap the window has grown, so the match stays continuous', () => {
  const previous = { lineMeters: 500, timestamp: T0 };
  const result = matchFix(OXBOW_INDEX, fix(100, 120, T0 + 15 * 60_000), previous, T0 + 15 * 60_000);
  assert.ok(result.kind === 'matched' && result.continuous);
});

test('backwards movement is followed, not clamped to the furthest point reached', () => {
  const index = indexOf(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(10_000, 0), riverMile: 10_000 / MILE },
  ]);
  const result = matchFix(index, fix(550, 5, T0 + 30_000), { lineMeters: 600, timestamp: T0 }, T0 + 30_000);
  assert.ok(result.kind === 'matched' && Math.abs(result.lineMeters - 550) < 1 && result.continuous);
});

test('a position off the river is reported, not forced onto it, and matching resumes after', () => {
  const index = indexOf(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(10_000, 0), riverMile: 10_000 / MILE },
  ]);
  const previous = { lineMeters: 2_000, timestamp: T0 };
  const away = matchFix(index, fix(2_050, 600, T0 + 60_000), previous, T0 + 60_000);
  assert.equal(away.kind, 'off-route');
  assert.ok(away.kind === 'off-route' && Math.abs(away.offsetMeters - 600) < 1);
  const back = matchFix(index, fix(2_100, 20, T0 + 120_000), previous, T0 + 120_000);
  assert.ok(back.kind === 'matched' && back.continuous);
  // A tight bend is not off-route: 100 m off the simplified line with a
  // 20 m fix is still on the river.
  assert.equal(matchFix(index, fix(3_000, 100, T0 + 1), null, T0 + 1).kind, 'matched');
});

test('inaccurate, unknown-accuracy, stale and out-of-order fixes are rejected', () => {
  const previous = { lineMeters: 500, timestamp: T0 };
  const now = T0 + 60_000;
  assert.deepEqual(matchFix(OXBOW_INDEX, fix(500, 0, now, 200), previous, now), { kind: 'rejected', reason: 'inaccurate' });
  assert.deepEqual(matchFix(OXBOW_INDEX, fix(500, 0, now, null), previous, now), { kind: 'rejected', reason: 'inaccurate' });
  assert.deepEqual(matchFix(OXBOW_INDEX, fix(500, 0, now - 5 * 60_000), null, now), { kind: 'rejected', reason: 'stale' });
  assert.deepEqual(matchFix(OXBOW_INDEX, fix(500, 0, T0 - 1), previous, now), { kind: 'rejected', reason: 'out-of-order' });
});

// ── Progress and arrival ──────────────────────────────────────────────────

test('a take-out across a bend is not reached until the river says so', () => {
  // On the oxbow the paddler at the start is 120 m from the take-out in a
  // straight line, and two kilometres from it on the water.
  const start = matchFix(OXBOW_INDEX, fix(0, 5, T0), null, T0);
  assert.ok(start.kind === 'matched');
  const end = OXBOW_LENGTH / MILE;
  const progress = stretchProgress(0, end, start.riverMile);
  assert.equal(progress.arrived, false);
  assert.ok(progress.remainingMiles > 1.2);
});

test('arrival is offered near the take-out and the percentage clamps past it', () => {
  assert.equal(stretchProgress(10, 15, 15 - ARRIVAL_MILES / 2).arrived, true);
  assert.equal(stretchProgress(10, 15, 15 - ARRIVAL_MILES / 2).pastEnd, false);
  const past = stretchProgress(10, 15, 15.4);
  assert.equal(past.fraction, 1);
  assert.equal(past.pastEnd, true);
  assert.ok(past.remainingMiles < 0);
});

test('starting upstream of a saved put-in reads as zero percent, not negative', () => {
  const early = stretchProgress(22, 25, 21.5);
  assert.equal(early.fraction, 0);
  assert.ok(early.travelledMiles < 0);
  assert.ok(Math.abs(early.remainingMiles - 3.5) < 1e-9);
});

// ── Pace and remaining time ───────────────────────────────────────────────

/** Samples every `stepS` seconds moving at `mph`, continuing from `from`. */
function paddle(from: PaceSample, minutes: number, mph: number, stepS = 10): PaceSample[] {
  const out: PaceSample[] = [];
  for (let s = stepS; s <= minutes * 60; s += stepS) {
    out.push({ timestamp: from.timestamp + s * 1000, riverMile: from.riverMile + (mph * s) / 3600, continuous: true });
  }
  return out;
}

const LAUNCH: PaceSample = { timestamp: T0, riverMile: 30, continuous: false };

test('steady paddling reports its pace', () => {
  const samples = [LAUNCH, ...paddle(LAUNCH, 30, 2.5)];
  const pace = observedPace(samples, 1);
  assert.ok(pace && Math.abs(pace.mph - 2.5) < 0.01);
  assert.equal(pace?.stopped, false);
});

test('a lunch stop is excluded and holds the estimate instead of growing it', () => {
  const moving = [LAUNCH, ...paddle(LAUNCH, 20, 3)];
  const before = observedPace(moving, 1);
  const last = moving[moving.length - 1];
  // 40 minutes on a gravel bar with a few metres of GPS wander.
  const lunch = Array.from({ length: 240 }, (_, i) => ({
    timestamp: last.timestamp + (i + 1) * 10_000,
    riverMile: last.riverMile + (i % 2 ? 0.004 : -0.004),
    continuous: true,
  }));
  const during = observedPace([...moving, ...lunch], 1);
  assert.ok(before && during);
  assert.ok(Math.abs(during.mph - before.mph) < 0.05, 'pace must hold through a stop');
  assert.equal(during.stopped, true);
  assert.equal(estimateRemaining(4, null, during).minutes, estimateRemaining(4, null, before).minutes);
});

test('slow drifting on low water still counts as progress', () => {
  const samples = [LAUNCH, ...paddle(LAUNCH, 30, 0.8)];
  const pace = observedPace(samples, 1);
  assert.ok(pace && Math.abs(pace.mph - 0.8) < 0.01, `got ${pace?.mph}`);
  assert.equal(pace?.stopped, false);
});

test('a tracking gap and a jump on reacquisition are not read as speed', () => {
  const first = [LAUNCH, ...paddle(LAUNCH, 10, 2)];
  const last = first[first.length - 1];
  // Fifteen minutes with no fixes, then one that appears 3 miles on.
  const reacquired: PaceSample = { timestamp: last.timestamp + 15 * 60_000, riverMile: last.riverMile + 3, continuous: true };
  const jump: PaceSample = { timestamp: reacquired.timestamp + 10_000, riverMile: reacquired.riverMile + 1, continuous: false };
  const after = paddle(jump, 10, 2);
  const pace = observedPace([...first, reacquired, jump, ...after], 1);
  assert.ok(pace && Math.abs(pace.mph - 2) < 0.01, `got ${pace?.mph}`);
});

test('until there is enough movement, the estimate is the planner or "learning"', () => {
  const brief = [LAUNCH, ...paddle(LAUNCH, 3, 2.5)];
  assert.equal(observedPace(brief, 1), null);
  assert.deepEqual(estimateRemaining(5, null, null), { minutes: null, basis: 'learning' });
  assert.deepEqual(estimateRemaining(5, 2.5, null), { minutes: 120, basis: 'planner' });
});

test('observed pace takes over from the planner gradually', () => {
  const fifteen = observedPace([LAUNCH, ...paddle(LAUNCH, 15, 4)], 1);
  assert.ok(fifteen);
  const blended = estimateRemaining(6, 2, fifteen);
  assert.equal(blended.basis, 'blended');
  // Half way: 3 mph over 6 miles is 120 minutes.
  assert.equal(blended.minutes, 120);
  const full = estimateRemaining(6, 2, observedPace([LAUNCH, ...paddle(LAUNCH, 40, 4)], 1));
  assert.deepEqual(full, { minutes: 90, basis: 'observed' });
});

test('paddling back upstream counts against pace', () => {
  const down = [LAUNCH, ...paddle(LAUNCH, 20, 3)];
  const up = paddle(down[down.length - 1], 5, -1);
  const pace = observedPace([...down, ...up], 1);
  assert.ok(pace && pace.mph < 3);
});

test('a line drawn upstream measures pace in the travel direction', () => {
  const samples = [LAUNCH, ...paddle(LAUNCH, 30, -2)];
  const pace = observedPace(samples, -1);
  assert.ok(pace && Math.abs(pace.mph - 2) < 0.01);
});

test('nothing remaining reads as zero minutes', () => {
  assert.deepEqual(estimateRemaining(0, 2.5, null), { minutes: 0, basis: 'planner' });
});
