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
  locateOnRoute,
  pointAt,
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
import { estimateRemaining, movingPace, type PaceSample } from '../../../packages/eddy-geo/float-pace';

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

test('every calibration span is checked, not just the total', () => {
  // Correct total, but a middle pair claims three miles across 100 m. End to
  // end it is invisible; span by span it is not. The bad anchor is left out
  // and its neighbours calibrate that stretch instead.
  const total = 10_000 / MILE;
  const result = buildRouteIndex(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(5_000, 0), riverMile: 3.1 },
    { lngLat: at(5_100, 0), riverMile: 6.1 },
    { lngLat: at(10_000, 0), riverMile: total },
  ]);
  assert.ok(result.ok);
  assert.equal(result.index.excludedAnchors, 1);
  const across = riverMileAt(result.index, 5_100) - riverMileAt(result.index, 5_000);
  assert.ok(Math.abs(across - 100 / MILE) < 0.01, `100 m read as ${across.toFixed(2)} mi`);
  // A middle anchor whose mile runs backwards is left out the same way.
  const backwards = buildRouteIndex(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(5_000, 0), riverMile: -1 },
    { lngLat: at(10_000, 0), riverMile: total },
  ]);
  assert.ok(backwards.ok && backwards.index.excludedAnchors === 1);
  // Close access points still calibrate: 150 m reading as 0.12 mi is within
  // the absolute allowance for placing anchors on a simplified line.
  const close = buildRouteIndex(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(150, 0), riverMile: 0.12 },
    { lngLat: at(10_000, 0), riverMile: total },
  ]);
  assert.ok(close.ok && close.index.excludedAnchors === 0);
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
    buildRouteIndex(STRAIGHT, [{ ...ends[0], riverMile: 5 }, { ...ends[1], riverMile: 5 }]),
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

test('a one-off location reads its river mile and how far from the river it is', () => {
  const index = indexOf(STRAIGHT, [
    { lngLat: at(0, 0), riverMile: 10 },
    { lngLat: at(10_000, 0), riverMile: 10 + 10_000 / MILE },
  ]);
  const here = locateOnRoute(index, at(5_000, 300));
  assert.ok(here && Math.abs(here.riverMile - (10 + 5_000 / MILE)) < 1e-6);
  assert.ok(here && Math.abs(here.offsetMeters - 300) < 1);
});

test('a place on the line maps back to its coordinates', () => {
  const index = indexOf(OXBOW, [
    { lngLat: at(0, 0), riverMile: 0 },
    { lngLat: at(0, 120), riverMile: OXBOW_LENGTH / MILE },
  ]);
  const [lng, lat] = pointAt(index, 1_120 + 300);
  const [elng, elat] = at(700, 120);
  assert.ok(Math.abs(lng - elng) < 1e-6 && Math.abs(lat - elat) < 1e-6);
  assert.deepEqual(pointAt(index, -50), pointAt(index, 0), 'clamped to the line');
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
  // the second arm must win, over several fixes rather than one, and while
  // they are being confirmed neither arm is presented as live.
  const fixes = [0, 1, 2].map((k) => fix(490 - k * 10, 120, T0 + (k + 1) * 10_000));
  const { results, state } = feed(OXBOW_INDEX, committedAt(500), fixes);
  assert.deepEqual(results.slice(0, CONFIRM_FIXES - 1), [
    { kind: 'uncertain', reason: 'relocating' },
    { kind: 'uncertain', reason: 'relocating' },
  ]);
  const switched = results[CONFIRM_FIXES - 1];
  assert.ok(switched.kind === 'matched' && !switched.continuous);
  // x = 470 on the second arm is 1120 + 530 m along the line.
  assert.ok(Math.abs((matchedAt(switched) ?? 0) - 1_650) < 1);
  assert.ok(state.committed && state.committed.lineMeters > 1_120);
});

test('while a competing position is confirmed, the last reliable one is held as it was', () => {
  // Advancing the questionable match, or its timestamp, would present it as
  // live and feed it to pace.
  const before = committedAt(500);
  const step = trackFix(OXBOW_INDEX, before, fix(490, 120, T0 + 10_000), T0 + 10_000);
  assert.deepEqual(step.result, { kind: 'uncertain', reason: 'relocating' });
  assert.deepEqual(step.state.committed, before.committed);
});

test('agreement gathered before a long gap does not confirm a fix after it', () => {
  // Two agreeing fixes, fifteen minutes of nothing, then one fix 2.5 km
  // away: that one fix must start a fresh confirmation, not finish the old.
  const fixes = [fix(1_000, 0, T0), fix(1_010, 0, T0 + 10_000), fix(3_500, 0, T0 + 14.5 * 60_000)];
  const { results, state } = feed(STRAIGHT_INDEX, INITIAL_TRACK, fixes);
  assert.deepEqual(results.map((r) => r.kind), ['uncertain', 'uncertain', 'uncertain']);
  assert.equal(state.committed, null);
  assert.equal(state.candidate?.support, 1);
});

test('after a long gap, tracking reacquires with confirmation instead of trusting the wide window', () => {
  // Fifteen minutes without a fix lets the window span the whole oxbow. One
  // ambiguous fix used to move progress 1.1 km downstream as continuous.
  const gapEnd = T0 + 15 * 60_000;
  const first = trackFix(OXBOW_INDEX, committedAt(500), fix(500, 65, gapEnd), gapEnd);
  assert.deepEqual(first.result, { kind: 'uncertain', reason: 'reacquiring' });
  assert.deepEqual(first.state.committed, { lineMeters: 500, timestamp: T0 });
  // Consistent fixes after the gap resume tracking, marked discontinuous so
  // the gap is not read as pace.
  const fixes = [0, 1, 2].map((k) => fix(500 + k * 20, 5, gapEnd + k * 10_000));
  const { results } = feed(OXBOW_INDEX, committedAt(500), fixes);
  assert.deepEqual(results.slice(0, 2).map((r) => r.kind), ['uncertain', 'uncertain']);
  assert.ok(results[2].kind === 'matched' && !results[2].continuous);
  assert.ok(Math.abs((matchedAt(results[2]) ?? 0) - 540) < 1);
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

const MIN = 60_000;

/** A sample every 10 s for `minutes`, moving at `mph`, continuing from `from`. */
function paddle(from: PaceSample, minutes: number, mph: number): PaceSample[] {
  const out: PaceSample[] = [];
  for (let s = 10; s <= minutes * 60; s += 10) {
    out.push({ timestamp: from.timestamp + s * 1000, riverMile: from.riverMile + (mph * s) / 3600, continuous: true });
  }
  return out;
}
const tail = (samples: PaceSample[]) => samples[samples.length - 1];
const LAUNCH: PaceSample = { timestamp: T0, riverMile: 30, continuous: false };

test('pace is your speed while moving', () => {
  const pace = movingPace([LAUNCH, ...paddle(LAUNCH, 30, 2.5)], 1);
  assert.ok(pace.mph != null && Math.abs(pace.mph - 2.5) < 0.01);
  assert.equal(pace.paused, false);
});

test('a lunch stop never raises time left, whenever it starts', () => {
  // 32 minutes, so the stop does not begin on any convenient boundary. A
  // block-based rule moved 80 minutes to 95 while sitting still.
  const moving = [LAUNCH, ...paddle(LAUNCH, 32, 3)];
  const before = estimateRemaining(4, null, movingPace(moving, 1)).minutes;
  for (const sat of [1, 3, 6, 10, 45]) {
    const reading = movingPace([...moving, ...paddle(tail(moving), sat, 0)], 1);
    assert.equal(estimateRemaining(4, null, reading).minutes, before, `after ${sat} min stopped`);
  }
  assert.equal(movingPace([...moving, ...paddle(tail(moving), 10, 0)], 1).paused, true);
});

test('a break with GPS jitter is still a break', () => {
  const moving = [LAUNCH, ...paddle(LAUNCH, 30, 3)];
  const last = tail(moving);
  const lunch = Array.from({ length: 270 }, (_, i) => ({
    timestamp: last.timestamp + (i + 1) * 10_000,
    riverMile: last.riverMile + (i % 2 ? 0.004 : -0.004),
    continuous: true,
  }));
  const before = movingPace(moving, 1);
  const during = movingPace([...moving, ...lunch], 1);
  assert.ok(before.mph && during.mph && Math.abs(during.mph - before.mph) < 0.05, `got ${during.mph}`);
  assert.equal(during.paused, true);
});

test('slowing to a drift raises the estimate instead of keeping the earlier pace', () => {
  // 3 mph, then a slow pool at 0.2 mph: two miles is ten hours, not 40 min.
  // Each 25 m run takes about 4.7 minutes, under the six that make a stop,
  // so this also proves a possible stop that ends in movement counts in full.
  const fast = [LAUNCH, ...paddle(LAUNCH, 30, 3)];
  const pace = movingPace([...fast, ...paddle(tail(fast), 30, 0.2)], 1);
  assert.ok(pace.mph != null && Math.abs(pace.mph - 0.2) < 0.02, `got ${pace.mph}`);
  assert.equal(pace.paused, false);
  assert.equal(estimateRemaining(2, null, pace).minutes, 600);
});

test('too slow to tell from sitting still reads as paused, not as recent pace', () => {
  // 0.1 mph for an hour. GPS cannot separate that from a stop, so the
  // earlier pace is kept but flagged, and the screen says so.
  const fast = [LAUNCH, ...paddle(LAUNCH, 30, 3)];
  const reading = movingPace([...fast, ...paddle(tail(fast), 60, 0.1)], 1);
  assert.equal(reading.paused, true);
  assert.equal(estimateRemaining(2, null, reading).paused, true);
});

test('paddling upstream counts against pace instead of being ignored', () => {
  const down = [LAUNCH, ...paddle(LAUNCH, 30, 3)];
  const someUp = movingPace([...down, ...paddle(tail(down), 5, -1)], 1);
  assert.ok(someUp.mph != null && someUp.mph < 3);
  // Net upstream over the whole window: no estimate rather than the old one.
  const allUp = movingPace([...down, ...paddle(tail(down), 20, -1)], 1);
  assert.equal(allUp.mph, null);
  assert.equal(allUp.paused, false);
});

test('after a break, pace moves to how you are going now', () => {
  const first = [LAUNCH, ...paddle(LAUNCH, 30, 3)];
  const lunch = [...first, ...paddle(tail(first), 30, 0)];
  const after = movingPace([...lunch, ...paddle(tail(lunch), 20, 1.5)], 1);
  assert.ok(after.mph != null && Math.abs(after.mph - 1.5) < 0.05, `got ${after.mph}`);
  assert.equal(after.paused, false);
});

test('a confirmed GPS jump is not read as speed', () => {
  const first = [LAUNCH, ...paddle(LAUNCH, 20, 2)];
  const jump: PaceSample = { ...tail(first), timestamp: tail(first).timestamp + 10_000, riverMile: tail(first).riverMile + 1, continuous: false };
  const pace = movingPace([...first, jump, ...paddle(jump, 20, 2)], 1);
  assert.ok(pace.mph != null && Math.abs(pace.mph - 2) < 0.01, `got ${pace.mph}`);
});

test('a line drawn upstream measures pace in the travel direction', () => {
  const pace = movingPace([LAUNCH, ...paddle(LAUNCH, 30, -2)], -1);
  assert.ok(pace.mph != null && Math.abs(pace.mph - 2) < 0.01);
});

test('learning and blending follow real moving time, updating with every fix', () => {
  // First estimate after about five minutes of moving, not ten.
  assert.equal(movingPace([LAUNCH, ...paddle(LAUNCH, 4, 2.5)], 1).mph, null);
  const six = movingPace([LAUNCH, ...paddle(LAUNCH, 6, 2.5)], 1);
  assert.ok(six.mph != null && six.movingMs >= 5 * MIN && six.movingMs <= 6 * MIN);
  // Planner fully replaced after about thirty minutes of moving, not forty.
  const thirtyOne = movingPace([LAUNCH, ...paddle(LAUNCH, 31, 4)], 1);
  assert.equal(estimateRemaining(6, 2, thirtyOne).basis, 'observed');
  // Pace responds between fixes, not only at block boundaries.
  const base = [LAUNCH, ...paddle(LAUNCH, 20, 2)];
  const a = movingPace([...base, ...paddle(tail(base), 1, 4)], 1).mph!;
  const b = movingPace([...base, ...paddle(tail(base), 2, 4)], 1).mph!;
  assert.ok(b > a && a > 2);
});

test('until there is enough moving time, the estimate is the planner or "learning"', () => {
  assert.deepEqual(estimateRemaining(5, null, null), { minutes: null, basis: 'learning', paused: false });
  assert.deepEqual(estimateRemaining(5, 2.5, null), { minutes: 120, basis: 'planner', paused: false });
});

test('your pace takes over from the planner over the first half hour of moving', () => {
  // Halfway through the blend: 3 mph over 6 miles is 120 minutes.
  const half = { mph: 4, movingMs: 15 * MIN, paused: false };
  assert.deepEqual(estimateRemaining(6, 2, half), { minutes: 120, basis: 'blended', paused: false });
  assert.deepEqual(estimateRemaining(6, 2, { ...half, movingMs: 30 * MIN }), { minutes: 90, basis: 'observed', paused: false });
});

test('nothing remaining reads as zero minutes', () => {
  assert.deepEqual(estimateRemaining(0, 2.5, null), { minutes: 0, basis: 'planner', paused: false });
});
