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
  CONFIRM_FIXES,
  INITIAL_TRACK,
  buildRouteIndex,
  riverMileAt,
  stretchProgress,
  trackFix,
  type CalibrationAnchor,
  type LngLat,
  type PositionFix,
  type RouteIndex,
  type TrackResult,
  type TrackState,
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

const STRAIGHT_INDEX = indexOf(STRAIGHT, [
  { lngLat: at(0, 0), riverMile: 0 },
  { lngLat: at(10_000, 0), riverMile: 10_000 / MILE },
]);

/** A tracker already committed at a place on the line. */
function committedAt(lineMeters: number, timestamp = T0): TrackState {
  return { committed: { lineMeters, timestamp }, candidate: null, lastFixAt: timestamp };
}

/** Feed fixes in order; returns every result and the final state. */
function feed(index: RouteIndex, state: TrackState, fixes: PositionFix[]): { results: TrackResult[]; state: TrackState } {
  const results: TrackResult[] = [];
  for (const f of fixes) {
    const step = trackFix(index, state, f, f.timestamp);
    results.push(step.result);
    state = step.state;
  }
  return { results, state };
}

const matchedAt = (result: TrackResult) => (result.kind === 'matched' ? result.lineMeters : null);

test('the first position is committed only once fixes agree on it', () => {
  // A quick start's start anchor is the first committed position, so one
  // stray fix must not become it.
  const fixes = [0, 1, 2].map((k) => fix(3_000 + k * 20, 5, T0 + k * 10_000));
  const { results, state } = feed(STRAIGHT_INDEX, INITIAL_TRACK, fixes);
  assert.deepEqual(results.slice(0, CONFIRM_FIXES - 1), [
    { kind: 'uncertain', reason: 'acquiring' },
    { kind: 'uncertain', reason: 'acquiring' },
  ]);
  const last = results[CONFIRM_FIXES - 1];
  assert.ok(last.kind === 'matched' && !last.continuous && Math.abs(last.lineMeters - 3_040) < 1);
  assert.ok(state.committed && Math.abs(state.committed.lineMeters - 3_040) < 1);
});

test('on an oxbow the last position keeps the match on the right arm', () => {
  // On the first arm but drifting toward the neck, nearer the second arm's
  // line than their own. Nearest-segment matching would jump them a
  // kilometre downstream.
  const { results } = feed(OXBOW_INDEX, committedAt(500), [
    fix(510, 70, T0 + 10_000),
    fix(520, 72, T0 + 20_000),
    fix(530, 70, T0 + 30_000),
    fix(540, 70, T0 + 40_000),
  ]);
  for (const [k, result] of results.entries()) {
    assert.ok(result.kind === 'matched' && result.continuous, `fix ${k} should stay on the first arm`);
    assert.ok(Math.abs(result.lineMeters - (510 + k * 10)) < 1);
  }
  // Proof the scenario is a real trap: acquired with no history, the same
  // spot settles on the wrong arm.
  const unaided = feed(OXBOW_INDEX, INITIAL_TRACK, [0, 1, 2].map((k) => fix(510, 70, T0 + k * 10_000)));
  assert.ok((matchedAt(unaided.results[2]) ?? 0) > 1_120);
});

test('a long segment cannot carry a match beyond the reachable window', () => {
  // One 10 km segment. Before the projection was clamped, an 8.5 km jump in
  // ten seconds matched as continuous movement.
  const index = indexOf([at(0, 0), at(10_000, 0)], [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(10_000, 0), riverMile: 10_000 / MILE },
  ]);
  const { results, state } = feed(index, committedAt(500), [fix(9_000, 0, T0 + 10_000)]);
  assert.deepEqual(results[0], { kind: 'uncertain', reason: 'relocating' });
  assert.equal(state.committed?.lineMeters, 500, 'progress must not move on one fix');
  // An ordinary step along the same segment is still followed.
  const next = feed(index, committedAt(500), [fix(530, 3, T0 + 10_000)]);
  assert.ok(next.results[0].kind === 'matched' && next.results[0].continuous);
  assert.ok(Math.abs((matchedAt(next.results[0]) ?? 0) - 530) < 1);
});

test('one impossible jump is held as uncertain, and a lone spike is forgotten', () => {
  // Dense geometry, where the old global fallback accepted the jump outright
  // and could put the paddler at the take-out.
  const { results, state } = feed(STRAIGHT_INDEX, committedAt(500), [
    fix(9_000, 0, T0 + 10_000),
    fix(540, 0, T0 + 20_000),
  ]);
  assert.deepEqual(results[0], { kind: 'uncertain', reason: 'relocating' });
  assert.ok(results[1].kind === 'matched' && results[1].continuous);
  assert.ok(Math.abs((matchedAt(results[1]) ?? 0) - 540) < 1);
  assert.equal(state.candidate, null, 'the spike must not keep counting toward a relocation');
});

test('a relocation is committed after consistent fixes, and marked discontinuous', () => {
  // A wrong earlier match, or a GPS that settles somewhere else after a gap:
  // several fixes moving plausibly together are evidence, one is not.
  const fixes = [0, 1, 2].map((k) => fix(9_000 + k * 20, 0, T0 + (k + 1) * 10_000));
  const { results, state } = feed(STRAIGHT_INDEX, committedAt(500), fixes);
  assert.deepEqual(results.slice(0, 2).map((r) => r.kind), ['uncertain', 'uncertain']);
  assert.equal(results[2].kind, 'matched');
  assert.ok(results[2].kind === 'matched' && !results[2].continuous);
  assert.ok(state.committed && Math.abs(state.committed.lineMeters - 9_040) < 1);
});

test('fixes that scatter do not add up to a relocation', () => {
  const fixes = [9_000, 4_000, 9_000, 4_000].map((x, k) => fix(x, 0, T0 + (k + 1) * 10_000));
  const { results, state } = feed(STRAIGHT_INDEX, committedAt(500), fixes);
  assert.ok(results.every((r) => r.kind === 'uncertain'));
  assert.equal(state.committed?.lineMeters, 500);
});

test('a wrong oxbow match recovers once fixes clearly favour the other arm', () => {
  // Committed on the first arm, but the paddler is really on the second,
  // 120 m away and still inside the off-route tolerance. Fixes squarely on
  // the second arm must win, over several fixes rather than one.
  const fixes = [0, 1, 2].map((k) => fix(490 - k * 10, 120, T0 + (k + 1) * 10_000));
  const { results, state } = feed(OXBOW_INDEX, committedAt(500), fixes);
  assert.ok(results[0].kind === 'matched' && (matchedAt(results[0]) ?? 0) < 1_000, 'one fix does not switch arms');
  const switched = results[CONFIRM_FIXES - 1];
  assert.ok(switched.kind === 'matched' && !switched.continuous);
  // x = 470 on the second arm is 1120 + 530 m along the line.
  assert.ok(Math.abs((matchedAt(switched) ?? 0) - 1_650) < 1);
  assert.ok(state.committed && state.committed.lineMeters > 1_120);
});

test('after a long gap the window has grown, so a plausible move stays continuous', () => {
  const { results } = feed(OXBOW_INDEX, committedAt(500), [fix(100, 120, T0 + 15 * 60_000)]);
  assert.ok(results[0].kind === 'matched' && results[0].continuous);
});

test('backwards movement is followed, not clamped to the furthest point reached', () => {
  const { results } = feed(STRAIGHT_INDEX, committedAt(600), [fix(550, 5, T0 + 30_000)]);
  assert.ok(results[0].kind === 'matched' && results[0].continuous);
  assert.ok(Math.abs((matchedAt(results[0]) ?? 0) - 550) < 1);
});

test('a position off the river is reported, not forced onto it, and matching resumes after', () => {
  const { results } = feed(STRAIGHT_INDEX, committedAt(2_000), [
    fix(2_050, 600, T0 + 60_000),
    fix(2_100, 20, T0 + 120_000),
  ]);
  assert.ok(results[0].kind === 'off-route' && Math.abs(results[0].offsetMeters - 600) < 1);
  assert.ok(results[1].kind === 'matched' && results[1].continuous);
  // A tight bend is not off-route: 100 m off the simplified line with a
  // 10 m fix is still on the river.
  const bend = feed(STRAIGHT_INDEX, committedAt(3_000), [fix(3_000, 100, T0 + 10_000)]);
  assert.equal(bend.results[0].kind, 'matched');
});

test('inaccurate, unknown-accuracy, stale and out-of-order fixes are rejected and change nothing', () => {
  const state = committedAt(500);
  const now = T0 + 60_000;
  for (const [f, reason] of [
    [fix(500, 0, now, 200), 'inaccurate'],
    [fix(500, 0, now, null), 'inaccurate'],
    [fix(500, 0, now - 5 * 60_000), 'stale'],
    [fix(500, 0, T0 - 1), 'out-of-order'],
  ] as const) {
    const step = trackFix(OXBOW_INDEX, state, f, now);
    assert.deepEqual(step.result, { kind: 'rejected', reason });
    assert.equal(step.state, state);
  }
});

// ── Progress and arrival ──────────────────────────────────────────────────

test('a take-out across a bend is not reached until the river says so', () => {
  // On the oxbow the paddler at the start is 120 m from the take-out in a
  // straight line, and two kilometres from it on the water.
  const { results } = feed(OXBOW_INDEX, INITIAL_TRACK, [0, 1, 2].map((k) => fix(0, 5, T0 + k * 10_000)));
  const start = results[2];
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

test('very slow, steady drift is movement, not a stop', () => {
  // 0.2 mph stays inside the stop radius for nine minutes. An hour of it
  // used to return no pace at all.
  const samples = [LAUNCH, ...paddle(LAUNCH, 60, 0.2)];
  const pace = observedPace(samples, 1);
  assert.ok(pace && Math.abs(pace.mph - 0.2) < 0.01, `got ${pace?.mph}`);
  assert.equal(pace?.stopped, false);
});

test('slowing to a crawl lowers the estimate instead of holding the earlier pace', () => {
  const fast = [LAUNCH, ...paddle(LAUNCH, 30, 3)];
  const slow = paddle(fast[fast.length - 1], 30, 0.2);
  const pace = observedPace([...fast, ...slow], 1);
  assert.ok(pace && pace.mph < 0.5, `got ${pace?.mph}`);
  assert.ok((estimateRemaining(2, null, pace).minutes ?? 0) > estimateRemaining(2, null, observedPace(fast, 1)).minutes!);
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
