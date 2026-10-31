import { IDLE_TRACKER } from '../../../eddy-ios/src/lib/floatRecording';
import { essentialsPosition, locationMessage, aheadItems, aheadSymbol, currentFloatReports, essentialsClock, locationAgeLabel } from '../../../eddy-ios/src/lib/floatEssentials';
import type { HazardReport } from '../../../eddy-ios/src/lib/hazardReportQueue';
import { activeFloatStatus, floatDisplayPosition, fixAgeLabel, floatRouteBounds, floatOverviewBounds, recapBackupStatus, activityLabel, gpsQualityNote, paceLine, progressLine, spokenStats } from '../../../eddy-ios/src/lib/floatDisplay';
import { openStartPicker, chooseStartRiver, chooseStartAccess, continueToTakeOut, gpsRiver, gpsRiverCandidates, nextTakeOuts, startPlannerParams } from '../../../eddy-ios/src/lib/floatStartSelection';
import { createGpsRiverLookup } from '../../../eddy-ios/src/lib/gpsRiverLookup';
import { recapFloat } from '../../../eddy-ios/src/lib/floatRecap';
import { matchesSetupDownload, restoreSetupDownload } from '../../../eddy-ios/src/lib/floatSetupDownload';
import { TRIP_PACKAGE_VERSION, type TripPackage } from '../../../eddy-ios/src/lib/tripDownload';
// missouri-float-planner/src/lib/float-session.test.ts
//
// Covers eddy-ios/src/lib/floatSession.ts, the pure model of one float on the
// water. eddy-ios has no test runner; see route-preview.test.ts for the same
// arrangement. The geometry maths itself is covered by river-progress.test.ts;
// these tests are about the session around it: starting, restoring, and what
// the screen is told.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import {
  MAX_SAMPLES,
  applyFix,
  arrivalAnchor,
  arrivalCopy,
  arrivalOutlook,
  mapFeatures,
  markerDistance,
  withHazards,
  formatDuration,
  remainingCopy,
  statusCopy,
  restoreSession,
  routeFromRiver,
  riverSpanOf,
  startSession,
  suggestRivers,
  takeOutChoices,
  viewSession,
  type FloatSession,
} from '../../../eddy-ios/src/lib/floatSession';
import type { LngLat, PositionFix, RouteIndex } from '@eddy/geo';
import { START_FIX_MAX_AGE_MS, usableStartFix, startRiverPosition, sameFloatStretch, floatSetupKey, currentMovingSpeed, currentStartCondition, putInLocation, estimateStartId } from '../../../eddy-ios/src/lib/floatStart';
import { startWeatherFrom, startWeatherPoint, START_WEATHER_WINDOW_MS } from '../../../eddy-ios/src/lib/floatStartWeather';
import { arrivalDayLabel, startTiming } from '../../../eddy-ios/src/lib/floatStartTiming';
import type { StartCondition } from '@shared/float-archive';
import { spanCalibration } from '@shared/float-recap';
import { fetchWeather } from './weather/openweather';

const MILE = 1609.344;
const LAT0 = 37.0;
const LNG0 = -91.4;
const COS = Math.cos((LAT0 * Math.PI) / 180);
const T0 = Date.parse('2026-07-04T14:00:00Z');

/** Local metres east of the start, on the river. */
function at(x: number, y = 0): LngLat {
  return [LNG0 + x / (COS * 111_320), LAT0 + y / 111_320];
}

function point(id: string, x: number, riverMile: number, extra: Partial<MapAccessPoint> = {}): MapAccessPoint {
  const [lng, lat] = at(x);
  return { id, name: id, riverMile, type: 'access', isPublic: true, coordinates: { lng, lat }, ...extra };
}

/** A straight 10 km river whose miles run 20.0 to 26.2, downstream eastward. */
const RIVER = {
  slug: 'current',
  name: 'Current River',
  geometry: { type: 'LineString' as const, coordinates: Array.from({ length: 101 }, (_, i) => at(i * 100)) },
};
const MILES_PER_M = 1 / MILE;
const ACCESS = [
  point('akers', 0, 20),
  point('cave', 3_000, 20 + 3_000 * MILES_PER_M, { isFloatEndpoint: false }),
  point('pulltite', 6_000, 20 + 6_000 * MILES_PER_M),
  point('round-spring', 10_000, 20 + 10_000 * MILES_PER_M),
];

function prepared() {
  const result = routeFromRiver(RIVER, ACCESS, '2026-07-04T12:00:00Z');
  assert.ok(result.ok);
  return result;
}

function fix(x: number, timestamp: number): PositionFix {
  return { lngLat: at(x, 5), accuracyMeters: 10, timestamp };
}

/** Fixes every 10 s moving east at `mps` from `x`, applied in order. */
function float(session: FloatSession, index: RouteIndex, x: number, from: number, seconds: number, mps: number) {
  for (let s = 0; s <= seconds; s += 10) {
    session = applyFix(session, index, fix(x + mps * s, from + s * 1000), from + s * 1000);
  }
  return session;
}

test('river data that cannot support a float is refused with a reason', () => {
  assert.deepEqual(routeFromRiver(null, ACCESS, null), { ok: false, reason: 'no-river-data' });
  assert.deepEqual(routeFromRiver(RIVER, null, null), { ok: false, reason: 'no-river-data' });
  assert.deepEqual(routeFromRiver({ ...RIVER, geometry: { type: 'LineString', coordinates: [] } }, ACCESS, null), {
    ok: false,
    reason: 'too-few-points',
  });
});

test('a quick start offers only real take-outs, downstream, nearest first', () => {
  const { route, index } = prepared();
  const fromHere = takeOutChoices(route, index, 21);
  assert.deepEqual(fromHere.map((a) => a.id), ['pulltite', 'round-spring']);
  // Cave is on the river and calibrates it, but cannot end a float.
  assert.ok(route.anchors.some((a) => a.id === 'cave'));
  assert.ok(!takeOutChoices(route, index, null).some((a) => a.id === 'cave'));
});

test('start previews reject stale, future, invalid, and imprecise locations', () => {
  const preview = { point: at(2_000), accuracy: 10, timestamp: T0 };
  assert.equal(usableStartFix(preview, T0), true);
  assert.equal(usableStartFix(preview, T0 + START_FIX_MAX_AGE_MS - 1), true);
  assert.equal(usableStartFix(preview, T0 + START_FIX_MAX_AGE_MS), false);
  assert.equal(usableStartFix(preview, T0 - 1), false);
  for (const accuracy of [null, -1, 101, NaN, Infinity]) {
    assert.equal(usableStartFix({ ...preview, accuracy }, T0), false);
  }
  for (const point of [[NaN, 37], [-181, 37], [-91, 91]] as LngLat[]) {
    assert.equal(usableStartFix({ ...preview, point }, T0), false);
  }
});

test('only a fresh fix near the chosen river narrows take-outs, without seeding tracking', () => {
  const { route, index } = prepared();
  const preview = { point: at(2_000, 20), accuracy: 10, timestamp: T0 };
  const hit = startRiverPosition(index, preview, T0);
  assert.ok(hit);
  assert.deepEqual(takeOutChoices(route, index, hit.riverMile).map((choice) => choice.id), ['pulltite', 'round-spring']);
  for (const position of [
    startRiverPosition(index, { ...preview, point: at(2_000, 250) }, T0),
    startRiverPosition(index, { ...preview, accuracy: 500 }, T0),
    startRiverPosition(index, preview, T0 + START_FIX_MAX_AGE_MS),
    startRiverPosition(index, null, T0),
  ]) {
    assert.equal(position, null);
    assert.equal(takeOutChoices(route, index, position).length, 3);
  }
  const started = startSession({ id: 'preview-only', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  assert.equal(started.session.startMile, null);
  assert.equal(started.session.plannerMph, null);
  assert.equal(started.session.position, null);
});

test('a saved float must run downstream to a known take-out', () => {
  const { route, index } = prepared();
  const base = { id: 's1', kind: 'saved' as const, route, index, now: T0 };
  assert.deepEqual(startSession({ ...base, putInId: 'pulltite', takeOutId: 'akers' }), { ok: false, reason: 'take-out-upstream' });
  assert.deepEqual(startSession({ ...base, putInId: 'akers', takeOutId: 'nowhere' }), { ok: false, reason: 'no-take-out' });
  assert.equal(startSession({ ...base, putInId: 'akers', takeOutId: 'pulltite' }).ok, true);
});

test('a quick start waits for a confirmed position, then measures from it', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'q1', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  let session = started.session;
  assert.equal(viewSession(session, T0).status, 'acquiring');

  session = applyFix(session, index, fix(2_000, T0), T0);
  session = applyFix(session, index, fix(2_010, T0 + 10_000), T0 + 10_000);
  const pending = viewSession(session, T0 + 10_000);
  assert.equal(pending.status, 'acquiring');
  assert.equal(pending.milesLeft, null, 'no miles before the position is confirmed');

  session = applyFix(session, index, fix(2_020, T0 + 20_000), T0 + 20_000);
  const view = viewSession(session, T0 + 20_000);
  assert.equal(view.status, 'live');
  assert.equal(view.fraction, 0);
  assert.ok(Math.abs(view.milesLeft! - 7_980 * MILES_PER_M) < 0.01);
  assert.ok(session.startMile != null && Math.abs(session.startMile - (20 + 2_020 * MILES_PER_M)) < 0.01);
});

test('a planned float started partway down measures progress from recording, not its planned put-in', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's2', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  assert.equal(started.session.startMile, null);
  assert.equal(recapFloat(started.session, T0).putInName, null, 'No fix must not invent a launch');
  const session = float(started.session, index, 5_000, T0, 20, 1);
  const view = viewSession(session, T0 + 20_000);
  assert.equal(view.status, 'live');
  assert.equal(view.fraction, 0);
  assert.equal(session.putIn?.id, 'akers', 'The plan remains available for comparison');
  assert.ok(session.recordedStart && Math.abs(session.recordedStart.riverMile - (20 + 5020 / MILE)) < 0.01);
  const recap = recapFloat(session, T0 + 20_000);
  assert.equal(recap.putInId, null);
  assert.equal(recap.putInName, null);
  assert.equal(recap.startNote, 'Recording started 3.1 mi below akers');
  assert.equal(recap.firstMile, session.startMile);
  const resumed = restoreSession(JSON.stringify(session));
  assert.ok(resumed);
  assert.deepEqual(resumed.recordedStart, session.recordedStart);
  const later = float(resumed, index, 5_030, T0 + 30_000, 30, 1);
  assert.deepEqual(later.recordedStart, session.recordedStart, 'Resume cannot move the recorded origin');
  assert.ok(viewSession(later, T0 + 60_000).fraction! > 0);
  assert.equal(recapFloat(later, T0 + 60_000).startNote, recap.startNote);
});

test('time left starts from the planner, and pace takes over as you move', () => {
  const { route, index } = prepared();
  const started = startSession({
    id: 's3', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', plannerMph: 2, now: T0,
  });
  assert.ok(started.ok);
  let session = float(started.session, index, 0, T0, 30, 1);
  assert.equal(viewSession(session, T0 + 30_000).estimate.basis, 'planner');
  session = float(session, index, 40, T0 + 40_000, 20 * 60, 1.34);
  assert.equal(viewSession(session, T0 + 20 * 60_000).estimate.basis, 'blended');
});

test('without a planner estimate, time left says it is learning', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'q2', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 60, 1);
  assert.deepEqual(viewSession(session, T0 + 60_000).estimate, { minutes: null, basis: 'learning', paused: false });
});

test('a position nobody has refreshed is shown as stale, not live', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's4', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 30, 1);
  assert.equal(viewSession(session, T0 + 30_000).status, 'live');
  assert.equal(viewSession(session, T0 + 10 * 60_000).status, 'stale');
});

test('arriving offers Finish; a quick start already past the take-out says so', () => {
  const { route, index } = prepared();
  const saved = startSession({ id: 's5', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(saved.ok);
  const there = float(saved.session, index, 5_950, T0, 30, 1);
  assert.equal(viewSession(there, T0 + 30_000).arrived, true);

  const quick = startSession({ id: 'q3', kind: 'quick', route, index, takeOutId: 'pulltite', now: T0 });
  assert.ok(quick.ok);
  const past = float(quick.session, index, 8_000, T0, 30, 1);
  const view = viewSession(past, T0 + 30_000);
  assert.equal(view.startedPastTakeOut, true);
  assert.equal(view.fraction, null);
});

test('a coarse fix updates raw sharing without changing tracking', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's6', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const blurry = { lngLat: at(100), accuracyMeters: 500, timestamp: T0 };
  const next = applyFix(started.session, index, blurry, T0);
  assert.deepEqual(next.lastFix, { lngLat: blurry.lngLat, at: T0, accuracyMeters: 500 });
  assert.deepEqual({ ...next, lastFix: null }, { ...started.session, lastFix: null });
});

test('a session survives being stored and restored, and junk does not restore', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's7', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 60, 1);
  const restored = restoreSession(JSON.stringify(session));
  // Progress survives; live status does not (see the relaunch test below).
  assert.deepEqual(restored?.route, session.route);
  assert.deepEqual(restored?.samples, session.samples);
  assert.equal(restored?.startMile, session.startMile);
  assert.equal(viewSession(restored!, T0 + 60_000).milesLeft, viewSession(session, T0 + 60_000).milesLeft);
  assert.equal(restoreSession(null), null);
  assert.equal(restoreSession('{not json'), null);
  assert.equal(restoreSession(JSON.stringify({ ...session, version: 999 })), null);
});

test('the stored history stays bounded on a long day', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's8', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 0, T0, 8 * 3600, 0.3);
  assert.ok(session.samples.length <= MAX_SAMPLES);
});

test('fixes every second keep one pace sample per ten seconds', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's9', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  let session = started.session;
  for (let s = 0; s <= 120; s += 1) {
    session = applyFix(session, index, fix(500 + s, T0 + s * 1000), T0 + s * 1000);
  }
  // Acquisition takes the first fixes; after that, about one per 10 s.
  assert.ok(session.samples.length >= 11 && session.samples.length <= 13, `kept ${session.samples.length}`);
  assert.equal(viewSession(session, T0 + 120_000).status, 'live');
});

test('nearby rivers are suggested nearest first, and rivers with no access points are left out', () => {
  const here = { lat: 37.0, lng: -91.4 };
  const rivers = [
    { slug: 'far', name: 'Far', floatAccessCoordinates: [{ lat: 37.5, lng: -91.4 }] },
    { slug: 'near', name: 'Near', floatAccessCoordinates: [{ lat: 37.2, lng: -91.4 }, { lat: 37.01, lng: -91.4 }] },
    { slug: 'unknown', name: 'Unknown' },
  ];
  const suggestions = suggestRivers(rivers, here);
  assert.deepEqual(suggestions.map((s) => s.slug), ['near', 'far']);
  assert.ok(suggestions[0].miles < 1, 'uses the nearest access point, not the first');
});

test('time left is worded honestly for each kind of estimate', () => {
  assert.equal(formatDuration(100), '1 hr 40 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(120), '2 hr');
  assert.equal(remainingCopy({ minutes: null, basis: 'learning', paused: false }).headline, 'Learning your pace');
  assert.match(remainingCopy({ minutes: 100, basis: 'observed', paused: false }).note, /recent pace/);
  assert.match(remainingCopy({ minutes: 100, basis: 'observed', paused: true }).note, /earlier pace/);
  assert.match(remainingCopy({ minutes: 100, basis: 'planner', paused: false }).note, /plan/);
  for (const basis of ['planner', 'blended', 'observed'] as const) {
    assert.doesNotMatch(remainingCopy({ minutes: 60, basis, paused: false }).note, /current pace/);
  }
});

test('the status line says when a position is not live', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's10', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  assert.match(statusCopy(viewSession(started.session, T0), T0), /Waiting for GPS/);
  const session = float(started.session, index, 1_000, T0, 30, 1);
  assert.equal(statusCopy(viewSession(session, T0 + 30_000), T0 + 30_000), 'Live');
  const later = T0 + 30_000 + 7 * 60_000;
  assert.match(statusCopy(viewSession(session, later), later), /Last position 7 min ago/);
});

test('every endpoint is usable; one calibration left out is measured where it sits', () => {
  // A middle access point whose published mile is wrong by miles (the
  // Niangua's Williams Ford) is left out of calibration. It is still a
  // put-in and a take-out; its distance comes from where it actually is, so
  // standing at it reads as arrived rather than "8 miles left".
  const access = [
    point('akers', 0, 20),
    point('bad', 5_000, 20 + 5_000 * MILES_PER_M + 8),
    point('round-spring', 10_000, 20 + 10_000 * MILES_PER_M),
  ];
  const result = routeFromRiver(RIVER, access, null);
  assert.ok(result.ok);
  assert.equal(result.index.excludedAnchors, 1);
  const offered = takeOutChoices(result.route, result.index, null).find((a) => a.id === 'bad');
  assert.ok(offered);
  // Listed at the mile the float will use, so the label matches the float.
  assert.ok(Math.abs(offered.mile - (20 + 5_000 * MILES_PER_M)) < 0.01, `listed at ${offered.mile}`);
  const asTakeOut = startSession({ id: 'b1', kind: 'saved', route: result.route, index: result.index, putInId: 'akers', takeOutId: 'bad', now: T0 });
  assert.ok(asTakeOut.ok);
  assert.ok(Math.abs(asTakeOut.session.takeOut.riverMile - (20 + 5_000 * MILES_PER_M)) < 0.01);
  const asPutIn = startSession({ id: 'b2', kind: 'saved', route: result.route, index: result.index, putInId: 'bad', takeOutId: 'round-spring', now: T0 });
  assert.ok(asPutIn.ok);
  assert.equal(asPutIn.session.startMile, null);
  assert.ok(Math.abs(asPutIn.session.putIn!.riverMile - (20 + 5_000 * MILES_PER_M)) < 0.01);
  // An end that calibrates keeps its own published mile exactly.
  assert.equal(asPutIn.session.takeOut.riverMile, 20 + 10_000 * MILES_PER_M);
});

test('a launch set back from the river is still an end', () => {
  // Buffalo City: the traditional Buffalo take-out, a kilometre off the line
  // on the White below the confluence.
  const access = [
    ...ACCESS,
    { ...point('buffalo-city', 6_000, 20 + 6_000 * MILES_PER_M), coordinates: { lng: at(6_000)[0], lat: at(6_000, 1_000)[1] } },
  ];
  const result = routeFromRiver(RIVER, access, null);
  assert.ok(result.ok);
  assert.ok(takeOutChoices(result.route, result.index, null).some((a) => a.id === 'buffalo-city'));
  assert.equal(startSession({ id: 'e1', kind: 'quick', route: result.route, index: result.index, takeOutId: 'buffalo-city', now: T0 }).ok, true);
});

test('reaching the river’s closest point to an off-river take-out is not arriving', () => {
  // The take-out sits 1 km off the line, level with x = 10 km (the line's
  // end). Floating to the end must not say "arrived" or 0 miles to it.
  const access = [
    point('akers', 0, 20),
    point('round-spring', 10_000, 20 + 10_000 * MILES_PER_M),
    { ...point('beyond', 10_000, 20 + 10_000 * MILES_PER_M), coordinates: { lng: at(10_000)[0], lat: at(10_000, 1_000)[1] } },
  ];
  const result = routeFromRiver(RIVER, access, null);
  assert.ok(result.ok);
  const off = startSession({ id: 'o1', kind: 'saved', route: result.route, index: result.index, putInId: 'akers', takeOutId: 'beyond', now: T0 });
  assert.ok(off.ok);
  assert.ok(off.session.takeOut.offLineMeters! > 900);
  const there = float(off.session, result.index, 9_700, T0, 200, 1.5);
  const view = viewSession(there, T0 + 200_000);
  assert.equal(view.arrived, false, 'the take-out is still a kilometre away');
  assert.equal(view.atRiverEnd, true);
  assert.match(statusCopy(view, T0 + 200_000), /closest point to beyond\. It’s about 0\.6 mi from here/);
  assert.equal(remainingCopy({ minutes: 0, basis: 'observed', paused: false }, true).headline, 'At the river’s closest point');
  // Recorded as the river's end, never as arriving: the recap must not say
  // the take-out was reached.
  assert.equal(there.arrivedAt ?? null, null);
  assert.ok(there.riverEndAt != null);

  // The same place on the line as an on-river take-out does arrive.
  const on = startSession({ id: 'o2', kind: 'saved', route: result.route, index: result.index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(on.ok);
  assert.equal(on.session.takeOut.offLineMeters, undefined);
  const arrived = viewSession(float(on.session, result.index, 9_700, T0, 200, 1.5), T0 + 200_000);
  assert.equal(arrived.arrived, true);
  assert.equal(arrived.atRiverEnd, false);
});

test('a relaunch restores the session exactly; only a real gap in fixes makes the tracker reacquire', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'r1', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const before = float(started.session, index, 1_000, T0, 60, 1);
  assert.equal(viewSession(before, T0 + 60_000).status, 'live');

  // Relaunched: progress and the tracker's state are kept, and the screen
  // says it is finding the spot again until the next confirmed fix.
  const restored = restoreSession(JSON.stringify(before))!;
  assert.deepEqual(restored.track, before.track);
  const view = viewSession(restored, T0 + 90_000);
  assert.equal(view.status, 'resuming');
  assert.ok(view.milesLeft != null, 'progress is kept, shown as where you were');
  assert.match(statusCopy(view, T0 + 90_000), /again/);

  // The next fix 40 s on is ordinary movement: the journal had no gap.
  const next = applyFix(restored, index, fix(1_100, T0 + 100_000), T0 + 100_000);
  assert.equal(viewSession(next, T0 + 100_000).status, 'live');

  // Ten minutes with no fixes (Eddy was not running) is a real gap: the
  // tracker confirms afresh, and the gap is a break in pace, not movement.
  let session = applyFix(restored, index, fix(1_600, T0 + 660_000), T0 + 660_000);
  assert.equal(viewSession(session, T0 + 660_000).status, 'resuming');
  session = applyFix(session, index, fix(1_610, T0 + 670_000), T0 + 670_000);
  session = applyFix(session, index, fix(1_620, T0 + 680_000), T0 + 680_000);
  assert.equal(viewSession(session, T0 + 680_000).status, 'live');
  const last = session.samples[session.samples.length - 1];
  assert.equal(last.continuous, false);
  // Both sides of the gap are confirmed, so the 560 m between them was
  // covered and counts toward tracked distance; its time is not moving time.
  assert.equal(last.reacquired, true);
  const gapMiles = session.totals!.distanceMiles - restored.totals!.distanceMiles;
  assert.ok(gapMiles > 560 / MILE && gapMiles < 600 / MILE, `gap distance ${gapMiles}`);
  assert.ok(session.totals!.movingMs - restored.totals!.movingMs < 60_000, 'the ten-minute gap is not moving time');

  // The same gap with a fix far from the river in it (off the water, driving
  // round to a bridge) counts nothing: that was not miles paddled.
  let drove = applyFix(restored, index, { ...fix(1_300, T0 + 300_000), lngLat: at(1_300, 3_000) }, T0 + 300_000);
  assert.equal(drove.leftRiver, true);
  drove = applyFix(drove, index, fix(1_600, T0 + 660_000), T0 + 660_000);
  drove = applyFix(drove, index, fix(1_610, T0 + 670_000), T0 + 670_000);
  drove = applyFix(drove, index, fix(1_620, T0 + 680_000), T0 + 680_000);
  assert.equal(viewSession(drove, T0 + 680_000).status, 'live');
  assert.equal(drove.samples[drove.samples.length - 1].reacquired, undefined);
  assert.equal(drove.leftRiver, false);
  assert.ok(drove.totals!.distanceMiles - restored.totals!.distanceMiles < 30 / MILE, 'no distance across a gap spent off the river');
});

// ── Off the river, arrival, hazards, the stretch, and daylight ──────────────

test('away from the river with GPS working says so and holds the last spot, however long', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'o1', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  let session = float(started.session, index, 1_000, T0, 60, 1);
  const held = session.position;
  const totals = session.totals;
  const samples = session.samples;
  // Ten minutes on a bank 400 m from the line, fixes every 20 s.
  let t = T0 + 60_000;
  for (let s = 0; s < 30; s += 1) {
    t += 20_000;
    session = applyFix(session, index, { lngLat: at(1_060, 400), accuracyMeters: 10, timestamp: t }, t);
  }
  const view = viewSession(session, t);
  assert.equal(view.status, 'off-route');
  assert.match(statusCopy(view, t), /away from the river/);
  assert.deepEqual(session.position, held);
  assert.deepEqual(session.gpsPosition?.lngLat, at(1_060, 400));
  assert.equal(floatDisplayPosition(session, t)?.dimmed, false);
  assert.equal(session.totals, totals, 'off-river display never advances recorded distance');
  assert.equal(session.samples, samples, 'off-river display never changes pace');
  assert.equal(view.lastFixAt, t);
  // Not "left the river": 400 m is a bank, not the road home.
  assert.equal(session.awaySince ?? null, null);
  // When fixes do stop, it is stale from the last fix, not the last river position.
  assert.match(statusCopy(viewSession(session, t + 3 * 60_000), t + 3 * 60_000), /Last position 3 min ago/);
});

test('going well away from the river is recorded once, and a river position clears it', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'o2', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  let session = float(started.session, index, 1_000, T0, 60, 1);
  const away = (s: FloatSession, t: number) => applyFix(s, index, { lngLat: at(1_060, 3_000), accuracyMeters: 10, timestamp: t }, t);
  session = away(session, T0 + 80_000);
  session = away(session, T0 + 100_000);
  assert.equal(session.awaySince, T0 + 80_000);
  session = float(session, index, 1_070, T0 + 120_000, 30, 1);
  assert.equal(session.awaySince, null);
});

test('arrival is recorded once from a confirmed position; a float that stays there ends there', async () => {
  const { recapFloat } = await import('../../../eddy-ios/src/lib/floatRecap');
  const { route, index } = prepared();
  const started = startSession({ id: 'a1', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(started.ok);
  let session = float(started.session, index, 0, T0, 6_000, 1);
  assert.ok(session.arrivedAt != null);
  const arrivedAt = session.arrivedAt!;
  const totalsAtArrival = session.arrivalTotals;
  assert.ok(totalsAtArrival);
  // Sit at the take-out for twenty minutes, then walk to the car.
  session = float(session, index, 6_000, T0 + 6_010_000, 1_200, 0);
  assert.equal(session.arrivedAt, arrivedAt);
  assert.deepEqual(session.arrivalTotals, totalsAtArrival, 'the accounting as it stood at arrival is kept');
  assert.notEqual(session.pastTakeOut, true);
  let t = T0 + 7_300_000;
  for (let s = 0; s < 10; s += 1) {
    t += 20_000;
    session = applyFix(session, index, { lngLat: at(6_000, 2_000), accuracyMeters: 10, timestamp: t }, t);
  }
  // Ending hours later, away from the river, still reached the take-out, and
  // the float ended when it arrived.
  const recap = recapFloat(session, t + 3 * 3_600_000);
  assert.equal(recap.reachedTakeOut, true);
  assert.equal(recap.endedAt, arrivedAt);
  assert.equal(recap.elapsedMs, arrivedAt - T0);
  assert.equal(recap.stoppedMs, 0, 'twenty minutes at the take-out is not part of the float');
});

test('a float that carries on past its take-out is counted to where it stopped, not back at arrival', async () => {
  const { recapFloat } = await import('../../../eddy-ios/src/lib/floatRecap');
  const { autoEndAt, CONTINUING_WINDOW_MS } = await import('../../../eddy-ios/src/lib/floatEnding');
  const { route, index } = prepared();
  const started = startSession({ id: 'a3', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(started.ok);
  // Pulltite is at x = 6 km; paddle on to x = 9.5 km, then stop on a bank.
  let session = float(started.session, index, 0, T0, 6_000, 1);
  const arrivedAt = session.arrivedAt!;
  session = float(session, index, 6_010, T0 + 6_010_000, 3_490, 1);
  assert.equal(session.pastTakeOut, true);
  const movedUntil = T0 + 9_500_000;
  let t = movedUntil;
  for (; t <= movedUntil + CONTINUING_WINDOW_MS + 60_000; t += 10_000) {
    session = applyFix(session, index, { lngLat: at(9_500, 5), accuracyMeters: 10, timestamp: t }, t);
  }
  const endAt = autoEndAt(session, t);
  assert.ok(endAt != null && endAt > arrivedAt + 50 * 60_000, 'ended where the movement stopped, not at the take-out');
  assert.ok(Math.abs(endAt - movedUntil) <= 20_000, `ended at ${endAt - movedUntil} ms from the last movement`);
  const recap = recapFloat(session, endAt);
  assert.equal(recap.reachedTakeOut, true, 'the take-out was still reached');
  assert.equal(recap.endedAt, endAt);
  assert.ok(recap.distanceMiles > 9_000 / 1609.344 * 0.95, `distance ${recap.distanceMiles}`);
  assert.ok(recap.stoppedMs < 60_000, 'the stop the float ended at is not part of it');
});

test('landing a little past the take-out and finishing later counts no time on the bank', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'a4', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(started.ok);
  // Pulltite is at x = 6 km. Drift 300 m past it (a long ramp, an eddy) and land.
  let session = float(started.session, index, 0, T0, 6_000, 1);
  session = float(session, index, 6_010, T0 + 6_010_000, 290, 1);
  assert.equal(session.pastTakeOut, true);
  const landed = T0 + 6_300_000;
  // Forty minutes loading on the bank, fixes still arriving at the landing.
  let t = landed;
  for (; t <= landed + 40 * 60_000; t += 10_000) {
    session = applyFix(session, index, { lngLat: at(6_300, 5), accuracyMeters: 10, timestamp: t }, t);
  }
  const recap = recapFloat(session, t);
  assert.ok(Math.abs(recap.endedAt - landed) <= 20_000, `ended ${recap.endedAt - landed} ms from the landing`);
  assert.ok(recap.stoppedMs < 60_000, 'the forty minutes loading are not part of the float');
  assert.equal(progressLine(session, t), progressLine(session, recap.endedAt), 'the panel rests there too');

  // The same landing, then a walk up to the car: no more river fixes at all.
  let walked = float(started.session, index, 0, T0, 6_000, 1);
  walked = float(walked, index, 6_010, T0 + 6_010_000, 290, 1);
  const quiet = recapFloat(walked, landed + 40 * 60_000);
  assert.ok(Math.abs(quiet.endedAt - landed) <= 20_000, 'it ended at the last confirmed position, not at Finish');
});

test('carrying on past the take-out keeps counting until Finish while still moving', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'a5', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(started.ok);
  let session = float(started.session, index, 0, T0, 6_000, 1);
  session = float(session, index, 6_010, T0 + 6_010_000, 3_000, 1);
  assert.equal(session.pastTakeOut, true);
  const now = T0 + 9_010_000;
  const recap = recapFloat(session, now);
  assert.equal(recap.endedAt, now, 'paddling on the river at Finish: it ends at Finish');
  assert.ok(recap.distanceMiles > 9_000 / MILE * 0.95);
});

test('a quick start already past its take-out never counts as arrived', () => {
  const { route, index } = prepared();
  const quick = startSession({ id: 'a2', kind: 'quick', route, index, takeOutId: 'pulltite', now: T0 });
  assert.ok(quick.ok);
  const past = float(quick.session, index, 8_000, T0, 60, 1);
  assert.equal(past.arrivedAt ?? null, null);
});

test('hazards are placed on the calibrated line in river order; one off the line is left out', () => {
  const hazard = (id: string, x: number, y = 0, severity: 'danger' | 'caution' = 'danger') => {
    const [lng, lat] = at(x, y);
    return {
      id,
      riverId: 'r',
      name: id,
      type: 'low_water_dam' as const,
      riverMile: 0,
      description: null,
      severity,
      portageRequired: true,
      portageSide: 'left' as const,
      seasonalNotes: null,
      coordinates: { lng, lat },
    };
  };
  const result = routeFromRiver(RIVER, ACCESS, null, [hazard('b', 7_000), hazard('a', 2_000, 0, 'caution'), hazard('far', 4_000, 2_000)]);
  assert.ok(result.ok);
  const placed = result.route.hazards ?? [];
  assert.deepEqual(placed.map((h) => h.id), ['a', 'b']);
  assert.ok(Math.abs(placed[0].riverMile - (20 + 2_000 * MILES_PER_M)) < 0.01);

  const started = startSession({ id: 'h1', kind: 'saved', route: result.route, index: result.index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  // Before any fix, a saved float already knows the first hazard ahead.
  assert.equal(viewSession(started.session, T0).nextHazard?.hazard.id, 'a');
  const past = float(started.session, result.index, 2_500, T0, 30, 1);
  const next = viewSession(past, T0 + 30_000).nextHazard;
  assert.equal(next?.hazard.id, 'b');
  assert.ok(next && Math.abs(next.milesAway - 4_470 * MILES_PER_M) < 0.05);

  // A route without hazards (an older trip download) takes them from elsewhere.
  const bare = routeFromRiver(RIVER, ACCESS, null);
  assert.ok(bare.ok);
  assert.equal(bare.route.hazards, undefined);
  assert.equal(withHazards(bare.route, bare.index, [hazard('b', 7_000)]).hazards?.length, 1);
});

test('the map frames the chosen stretch, with the access points along it', () => {
  const { route, index: idx } = prepared();
  const started = startSession({ id: 'm1', kind: 'saved', route, index: idx, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(started.ok);
  const features = mapFeatures(started.session, idx);
  assert.ok(features.section);
  const [first] = features.section!;
  const last = features.section![features.section!.length - 1];
  assert.ok(Math.abs(first[0] - at(0)[0]) < 1e-6);
  assert.ok(Math.abs(last[0] - at(6_000)[0]) < 1e-6);
  // Cave (not an endpoint, but an access point) sits between them, named so
  // the map can label it.
  assert.equal(features.stops.length, 1);
  assert.equal(features.stops[0].name, 'cave');
  assert.equal(markerDistance(features.stops[0].riverMile, 20.5), `${(features.stops[0].riverMile - 20.5).toFixed(1)} mi ahead`);
  assert.equal(markerDistance(21, 22), '1.0 mi behind');
  assert.equal(markerDistance(21, 21.05), 'Here');
  assert.equal(markerDistance(21.25, null), 'Mile 21.3');

  // A quick start shows the whole river until it knows where it began.
  const quick = startSession({ id: 'm2', kind: 'quick', route, index: idx, takeOutId: 'pulltite', now: T0 });
  assert.ok(quick.ok);
  assert.equal(mapFeatures(quick.session, idx).section, null);
});

test('readiness arrival labels follow calendar days, including month and year boundaries', () => {
  const now = new Date(2026, 9, 30, 20, 24).getTime();
  assert.equal(arrivalDayLabel(new Date(2026, 9, 30, 23, 30).getTime(), now), null);
  assert.equal(arrivalDayLabel(new Date(2026, 9, 31, 4, 38).getTime(), now), 'Tomorrow');
  assert.equal(arrivalDayLabel(new Date(2026, 10, 1, 8).getTime(), new Date(2026, 9, 31, 20).getTime()), 'Tomorrow');
  assert.equal(arrivalDayLabel(new Date(2026, 10, 1, 23).getTime(), new Date(2026, 9, 31, 23, 30).getTime()), 'Tomorrow',
    'the next calendar day remains Tomorrow when fall-back makes it more than 24 hours away');
  assert.equal(arrivalDayLabel(new Date(2027, 0, 1, 8).getTime(), new Date(2026, 11, 31, 20).getTime()), 'Tomorrow');
  const longer = new Date(2026, 10, 2, 8);
  assert.equal(arrivalDayLabel(longer.getTime(), now), longer.toLocaleDateString([], { month: 'short', day: 'numeric' }));
});

test('readiness separates arrival from concise daylight guidance at the take-out', () => {
  const takeOut = at(10_000);
  const noon = Date.parse('2026-07-04T17:00:00Z');
  const day = startTiming(60, noon, takeOut)!;
  assert.equal(day.arriveAt, noon + 60 * 60_000);
  assert.equal(day.daylight?.label, 'Sunset');
  assert.equal(day.daylight?.advisory, false);
  const evening = Date.parse('2026-07-05T00:30:00Z');
  assert.equal(startTiming(45, evening, takeOut)?.daylight?.label, 'Arrives near sunset');
  const after = startTiming(90, evening, takeOut)!;
  assert.equal(after.daylight?.label, 'Arrives after sunset');
  assert.equal(after.daylight?.advisory, true);
  assert.equal(after.daylight?.at, day.daylight?.at);
  assert.equal(startTiming(30, Date.parse('2026-07-05T02:00:00Z'), takeOut)?.daylight?.label, 'Starts after sunset');
  const dawn = startTiming(180, Date.parse('2026-07-05T09:00:00Z'), takeOut)!;
  assert.equal(dawn.daylight?.label, 'Starts before sunrise');
  assert.equal(dawn.daylight?.advisory, true);
  assert.ok(dawn.daylight!.at > Date.parse('2026-07-05T09:00:00Z'));
  assert.ok(dawn.daylight!.at < dawn.arriveAt, 'a start before sunrise still warns when arrival is in daylight');
  assert.equal(startTiming(24 * 60, noon, takeOut)?.daylight?.label, 'Continues after sunset');
});

test('readiness withholds an absent or invalid estimate and unavailable solar data', () => {
  const now = Date.parse('2026-07-04T17:00:00Z');
  for (const minutes of [null, 0, -1, NaN, Infinity]) assert.equal(startTiming(minutes, now, at(10_000)), null);
  assert.equal(startTiming(60, NaN, at(10_000)), null);
  assert.equal(startTiming(60, now, [0, 80])?.daylight, null);
});

test('arrival time is weighed against sunset at the take-out', () => {
  const takeOut = at(10_000);
  // July 4 in the Ozarks: sunset about 8:28 pm CDT (01:28 UTC).
  const noon = Date.parse('2026-07-04T17:00:00Z');
  assert.equal(arrivalOutlook(60, noon, takeOut)?.light, 'day');
  const evening = Date.parse('2026-07-05T00:30:00Z');
  assert.equal(arrivalOutlook(45, evening, takeOut)?.light, 'near');
  assert.equal(arrivalOutlook(90, evening, takeOut)?.light, 'after');
  assert.equal(arrivalOutlook(30, Date.parse('2026-07-05T02:00:00Z'), takeOut)?.light, 'set');
  assert.equal(arrivalOutlook(null, noon, takeOut), null);
  const copy = arrivalCopy(arrivalOutlook(90, evening, takeOut)!, (ms) => new Date(ms).toISOString().slice(11, 16));
  assert.equal(copy.line, 'Arrive around 02:00');
  assert.match(copy.warning ?? '', /after sunset \(01:2\d\)/);
  // On the water the estimate is paddling time only, and the line says so.
  const fmt = (ms: number) => new Date(ms).toISOString().slice(11, 16);
  assert.equal(arrivalCopy(arrivalOutlook(60, noon, takeOut)!, fmt, null, { paused: false }).line, 'Arrive around 18:00 if you keep paddling · sunset 01:28');
  assert.equal(arrivalCopy(arrivalOutlook(90, evening, takeOut)!, fmt, null, { paused: true }).line, 'Arrive around 02:00 if you push off now');
  assert.match(arrivalCopy(arrivalOutlook(90, evening, takeOut)!, fmt, null, { paused: true }).warning ?? '', /Get going soon/, 'no "pick up the pace" to someone sitting still');
  assert.match(arrivalCopy(arrivalOutlook(90, evening, takeOut)!, fmt, null, { paused: false }).warning ?? '', /Pick up the pace/);
  assert.doesNotMatch(arrivalCopy(arrivalOutlook(90, evening, takeOut)!, fmt, noon, { paused: false }).line, /paddling|push off/, 'a last-known estimate keeps its own wording');
});

test('an off-map take-out is not recorded as reached, however the float ends', async () => {
  const { recapFloat } = await import('../../../eddy-ios/src/lib/floatRecap');
  const { autoEndAt, autoEndCopy, AUTO_END_AFTER_ARRIVAL_MS } = await import('../../../eddy-ios/src/lib/floatEnding');
  const access = [
    point('akers', 0, 20),
    { ...point('beyond', 10_000, 20 + 10_000 * MILES_PER_M), coordinates: { lng: at(10_000)[0], lat: at(10_000, 1_000)[1] } },
  ];
  const result = routeFromRiver(RIVER, access, null);
  assert.ok(result.ok);
  const off = startSession({ id: 'r1', kind: 'saved', route: result.route, index: result.index, putInId: 'akers', takeOutId: 'beyond', now: T0 });
  assert.ok(off.ok);
  const there = float(off.session, result.index, 9_700, T0, 200, 1.5);
  const recap = recapFloat(there, T0 + 30 * 60_000);
  assert.equal(recap.reachedTakeOut, false);
  // Finished by hand half an hour later, it ends where measuring ended, the
  // river's end: the same moment as an automatic end and the panel's clock.
  assert.ok(there.riverEndAt != null);
  assert.equal(recap.endedAt, there.riverEndAt);
  assert.equal(progressLine(there, T0 + 30 * 60_000), progressLine(there, there.riverEndAt!), 'the panel rests at the river\'s end too');
  // Left running, it still ends, without claiming an arrival.
  const endAt = autoEndAt(there, there.riverEndAt! + AUTO_END_AFTER_ARRIVAL_MS);
  assert.equal(endAt, there.riverEndAt);
  assert.equal(recapFloat(there, endAt!).reachedTakeOut, false);
  const copy = autoEndCopy(there);
  assert.doesNotMatch(`${copy.title} ${copy.body}`, /finished|ended your float at/i);
  assert.match(copy.body, /closest point to beyond/);
});

// ── Before the first confirmed position, and arrival once it goes stale ─────

test('a quick start away from the river says so, instead of "finding your spot" forever', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'away1', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  let session = started.session;
  assert.match(statusCopy(viewSession(session, T0), T0), /Waiting for GPS/);
  // A parking lot 400 m from the river: GPS works, it just isn't the river.
  let t = T0;
  for (let s = 0; s < 6; s += 1) {
    t += 10_000;
    session = applyFix(session, index, { lngLat: at(2_000, 400), accuracyMeters: 10, timestamp: t }, t);
  }
  const near = viewSession(session, t);
  assert.equal(near.status, 'off-route');
  assert.equal(near.confirmed, false);
  assert.equal(near.milesLeft, null);
  assert.match(statusCopy(near, t), /not on the Current River yet \(about 0\.2 mi away\)/);
  // Then on the river: confirmed, and measured from there.
  for (let s = 0; s < 3; s += 1) {
    t += 10_000;
    session = applyFix(session, index, fix(2_000 + s * 10, t), t);
  }
  const on = viewSession(session, t);
  assert.equal(on.status, 'live');
  assert.equal(on.confirmed, true);
});

test('far from the chosen river before any position, Eddy reports off-route without discarding the session', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'away2', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  let session = started.session;
  let t = T0;
  for (let s = 0; s < 6; s += 1) {
    t += 10_000;
    session = applyFix(session, index, { lngLat: at(2_000, 5_000), accuracyMeters: 10, timestamp: t }, t);
  }
  const view = viewSession(session, t);
  assert.equal(view.status, 'off-route');
  // Once GPS goes quiet it says so, rather than still claiming where you are.
  const later = t + 5 * 60_000;
  assert.equal(viewSession(session, later).status, 'stale');
});

test('fixes still being confirmed read as finding your spot, not waiting for GPS', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'conf', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = applyFix(started.session, index, fix(2_000, T0), T0);
  const view = viewSession(session, T0);
  assert.equal(view.status, 'acquiring');
  assert.match(statusCopy(view, T0), /Finding your spot/);
});

test('arrival counts from now only while live; stale holds it at the last known spot', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'eta', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 600, 1);
  const liveAt = T0 + 600_000;
  const live = viewSession(session, liveAt);
  assert.equal(live.status, 'live');
  assert.deepEqual(arrivalAnchor(live, liveAt), { from: liveAt, asOf: null });

  const takeOut = at(10_000);
  const fmt = (ms: number) => new Date(ms).toISOString().slice(11, 16);
  const arrivalAt = (now: number) => {
    const view = viewSession(session, now);
    const anchor = arrivalAnchor(view, now)!;
    return { view, anchor, outlook: arrivalOutlook(view.estimate.minutes, anchor.from, takeOut)! };
  };
  // The bug: each tick after GPS stopped added the same minutes to a later
  // clock, so "Arrive around" kept moving and looked current.
  const a = arrivalAt(liveAt + 5 * 60_000);
  const b = arrivalAt(liveAt + 20 * 60_000);
  assert.equal(a.view.status, 'stale');
  assert.equal(a.outlook.arriveAt, b.outlook.arriveAt, 'the estimate holds while nothing new is known');
  assert.equal(a.anchor.asOf, a.view.positionAt);
  assert.match(arrivalCopy(a.outlook, fmt, a.anchor.asOf).line, /as of \d\d:\d\d, your last known spot/);
  assert.doesNotMatch(arrivalCopy(arrivalOutlook(30, liveAt, takeOut)!, fmt).line, /as of/);
});


test('editing a start or take-out detaches saved route identity and offline geometry', () => {
  const planned = { riverSlug: 'current', putInId: 'akers', takeOutId: 'pulltite', boatType: 'canoe' };
  assert.equal(sameFloatStretch(planned, { ...planned, boatType: 'kayak' }), true);
  for (const edited of [{ ...planned, putInId: undefined }, { ...planned, putInId: 'cedar' },
    { ...planned, takeOutId: 'two-rivers' }, { ...planned, riverSlug: 'jacks-fork' }]) {
    assert.equal(sameFloatStretch(planned, edited), false);
    assert.notEqual(floatSetupKey(planned), floatSetupKey(edited));
  }
  const here = { ...planned, putInId: undefined };
  assert.notEqual(floatSetupKey(here, [-91, 37]), floatSetupKey(here, [-91, 37.01]));
  assert.notEqual(floatSetupKey(here, [-91, 37]), floatSetupKey(here, null));
});

test('readiness never shows a withheld, typical, expired, or invalid moving speed', () => {
  const result = { estimateBasis: 'today', estimatedAt: new Date(T0).toISOString(), floatTime: { movingSpeedMph: 2.5 } };
  assert.equal(currentMovingSpeed(result, T0), 2.5);
  assert.equal(currentMovingSpeed(result, T0 + 300_000), null);
  assert.equal(currentMovingSpeed(result, T0 - 1), null);
  assert.equal(currentMovingSpeed({ ...result, estimateBasis: 'typical' }, T0), null);
  assert.equal(currentMovingSpeed({ ...result, floatTime: null }, T0), null);
  for (const speed of [0, -1, Infinity, NaN]) {
    assert.equal(currentMovingSpeed({ ...result, floatTime: { movingSpeedMph: speed } }, T0), null);
  }
});


test('recording at the planned launch retains its name, but an unverified nearby road does not', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'named', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const near = float(started.session, index, 0, T0, 20, 0);
  assert.equal(recapFloat(near, T0 + 20_000).putInId, 'akers');
  let road = started.session;
  for (let t = 0; t <= 20_000; t += 10_000) road = applyFix(road, index, { ...fix(0, T0 + t), lngLat: at(0, 100) }, T0 + t);
  assert.equal(recapFloat(road, T0 + 20_000).putInId, null);
});

test('old saved sessions keep their progress origin without fabricating a recorded GPS point', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'old', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  const legacy = { ...made.session, startMile: 20 };
  delete legacy.recordedStart;
  const restored = restoreSession(JSON.stringify(legacy));
  assert.ok(restored);
  const later = float(restored, index, 5000, T0, 20, 0);
  assert.equal(later.startMile, 20);
  assert.equal(later.recordedStart, undefined);
  assert.equal(recapFloat(later, T0 + 20_000).putInId, null);
});

test('a named plan begun beyond its take-out does not claim arrival', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'past', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(made.ok);
  const session = float(made.session, index, 7000, T0, 20, 0);
  assert.equal(viewSession(session, T0 + 20_000).startedPastTakeOut, true);
  assert.equal(viewSession(session, T0 + 20_000).fraction, null);
  assert.equal(recapFloat(session, T0 + 20_000).reachedTakeOut, false);
});

test('readiness distinguishes proximity, above/below, accuracy, and being off the chosen river', () => {
  const { route, index } = prepared();
  const putIn = { name: 'Pulltite', mile: 20 + 6000 / MILE, lngLat: at(6000) };
  const fix = { point: at(6000, 5), accuracy: 10, timestamp: T0 };
  assert.deepEqual(putInLocation(index, fix, T0, putIn), { label: 'Near Pulltite', canSwitch: false });
  assert.equal(putInLocation(index, { ...fix, point: at(3000) }, T0, putIn)?.label, '1.9 mi above Pulltite');
  assert.equal(putInLocation(index, { ...fix, point: at(9000) }, T0, putIn)?.label, '1.9 mi below Pulltite');
  for (const inaccurate of [{ ...fix, accuracy: 80 }, { ...fix, point: at(6000, 100) }]) {
    assert.equal(putInLocation(index, inaccurate, T0, putIn)?.canSwitch, true);
    assert.match(putInLocation(index, inaccurate, T0, putIn)!.label, /check your launch/);
  }
  assert.equal(putInLocation(index, { ...fix, point: at(6000, 500) }, T0, putIn), null);
  assert.equal(putInLocation(index, fix, T0 + START_FIX_MAX_AGE_MS, putIn), null);
  assert.equal(estimateStartId(route, undefined, 19.95), 'akers', 'Small calibration drift still requests an estimate');
  assert.equal(estimateStartId(route, undefined, 19.5), null);
});

test('downloaded setup reuse requires the same route and launch, including after restoring its package', () => {
  const { route } = prepared();
  const pkg: TripPackage = { version: TRIP_PACKAGE_VERSION, tripKey: 'downloaded-start', route,
    fromId: '', fromLngLat: at(3000), toId: 'round-spring', styleURL: 'fixture', chunkNames: [], savedAt: '2026-07-04' };
  const restored: TripPackage = JSON.parse(JSON.stringify(pkg));
  const draft = { riverSlug: 'current', takeOutId: 'round-spring' };
  assert.equal(matchesSetupDownload(restored, draft, at(3010)), true);
  assert.equal(matchesSetupDownload(restored, draft, at(3100)), false);
  assert.equal(matchesSetupDownload(restored, draft, null), false, 'Saved GPS is never treated as a fresh fix');
  assert.equal(matchesSetupDownload(restored, { ...draft, takeOutId: 'pulltite' }, at(3000)), false);
  assert.equal(matchesSetupDownload(restored, { ...draft, putInId: 'akers' }, at(3000)), false);
  assert.equal(matchesSetupDownload(restored, { ...draft, riverSlug: 'meramec' }, at(3000)), false);
});


test('unfinished setup restores from its own package without a river cache or preview GPS', async () => {
  const { route, index } = prepared();
  const pkg: TripPackage = { version: TRIP_PACKAGE_VERSION, tripKey: 'offline-draft', route,
    fromId: '', fromLngLat: at(3000), toId: 'round-spring', styleURL: 'fixture', chunkNames: [], savedAt: '2026-07-04' };
  const raw = JSON.stringify({ tripKey: pkg.tripKey, boatType: 'canoe' });
  const restored = await restoreSetupDownload(raw, async key => key === pkg.tripKey ? pkg : null);
  assert.ok(restored);
  assert.equal(restored.boatType, 'canoe');
  const first = startSession({ id: 'new-recording', kind: 'quick', route: restored.pkg.route, index,
    takeOutId: restored.pkg.toId, downloadKey: restored.pkg.tripKey, now: T0 });
  assert.ok(first.ok);
  assert.equal(first.session.startMile, null);
  assert.equal(first.session.position, null);
  assert.equal(first.session.recordedStart, null);
  assert.equal(first.session.downloadKey, 'offline-draft');
  assert.notEqual(first.session.id, first.session.downloadKey);
  assert.equal(await restoreSetupDownload(raw, async () => null), null, 'Deleted downloads cannot restore');
  assert.equal(await restoreSetupDownload(raw, async () => { throw new Error('unreadable'); }), null);
  assert.equal(await restoreSetupDownload('{invalid', async () => pkg), null);
});

test('reversed geometry keeps downstream-increasing miles and records the actual origin', () => {
  const reversed = routeFromRiver({ ...RIVER, geometry: { ...RIVER.geometry, coordinates: [...RIVER.geometry.coordinates].reverse() } }, ACCESS, null);
  assert.ok(reversed.ok);
  const made = startSession({ id: 'reversed-line', kind: 'saved', route: reversed.route, index: reversed.index,
    putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  const started = float(made.session, reversed.index, 5000, T0, 20, 1);
  assert.equal(viewSession(started, T0 + 20_000).fraction, 0);
  assert.ok(started.startMile! > made.session.putIn!.riverMile);
  assert.match(recapFloat(started, T0 + 20_000).startNote!, /below akers/);
});

function offMapLaunch() {
  const location = at(6000, 1200);
  const result = routeFromRiver(RIVER, [ACCESS[0],
    point('buffalo-city', 6000, 20 + 6000 / MILE, { name: 'Buffalo City', coordinates: { lng: location[0], lat: location[1] } }),
    ACCESS[3]], null);
  assert.ok(result.ok);
  const made = startSession({ id: 'off-map-launch', kind: 'saved', route: result.route, index: result.index,
    putInId: 'buffalo-city', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  return { ...result, session: made.session, location };
}

test('an actual off-map launch is recognized without starting progress until the river is confirmed', () => {
  const { session, index, location } = offMapLaunch();
  assert.ok(session.putIn!.offLineMeters! > 1000);
  const preview = { point: location, accuracy: 10, timestamp: T0 };
  const guidance = putInLocation(index, preview, T0, { name: 'Buffalo City', lngLat: location, mile: session.putIn!.riverMile });
  assert.equal(guidance?.label, 'Near Buffalo City');
  assert.equal(guidance?.canSwitch, false);
  assert.match(guidance?.note ?? '', /outside Eddy’s mapped river/);
  assert.equal(session.observedLaunch, undefined, 'Preview is never recorded launch evidence');
  let launched = session;
  for (let t = 0; t <= 20_000; t += 10_000) {
    launched = applyFix(launched, index, { lngLat: location, accuracyMeters: 10, timestamp: T0 + t }, T0 + t);
  }
  assert.equal(launched.observedLaunch?.id, 'buffalo-city');
  assert.equal(launched.recordedStart, null);
  assert.equal(launched.startMile, null);
  assert.equal(viewSession(launched, T0 + 20_000).fraction, null);
  assert.equal(launched.awaySince, null, 'Waiting at the launch must not start automatic-away ending');
  assert.equal(recapFloat(launched, T0 + 20_000).putInName, 'Buffalo City');
  const restored = restoreSession(JSON.stringify(launched));
  assert.ok(restored);
  assert.deepEqual(restored.observedLaunch, launched.observedLaunch);
  const onRiver = float(restored, index, 6000, T0 + 600_000, 20, 0);
  assert.equal(viewSession(onRiver, T0 + 620_000).fraction, 0);
  assert.ok(onRiver.recordedStart?.atPutIn);
  const recap = recapFloat(onRiver, T0 + 620_000);
  assert.equal(recap.putInId, 'buffalo-city');
  assert.equal(recap.putInName, 'Buffalo City');
  assert.equal(recap.startNote, 'Distance tracking began on Eddy’s mapped river.');
  assert.equal(recap.firstMile, onRiver.startMile);
  assert.equal(recap.distanceMiles, 0, 'The missing off-map distance must not be invented');
});

test('passing the river point nearest an off-map access does not claim that launch', () => {
  const { session, index, location } = offMapLaunch();
  const guidance = putInLocation(index, { point: at(6000), accuracy: 10, timestamp: T0 }, T0,
    { name: 'Buffalo City', lngLat: location, mile: session.putIn!.riverMile });
  assert.match(guidance!.label, /check your launch/);
  assert.equal(guidance!.canSwitch, true);
  const passing = float(session, index, 6000, T0, 20, 0);
  const recap = recapFloat(passing, T0 + 20_000);
  assert.equal(recap.putInId, null);
  assert.equal(recap.putInName, null);
  assert.equal(recap.startNote, 'On-river start near Buffalo City');
  assert.equal(passing.recordedStart?.atPutIn, false);
});

test('launch evidence needs repeated accurate post-Start fixes and closes at the first river origin', () => {
  const { session, index, location } = offMapLaunch();
  const launchFix = { lngLat: location, accuracyMeters: 10, timestamp: T0 };
  for (const invalid of [{ ...launchFix, timestamp: T0 - 1 }, { ...launchFix, timestamp: T0 + 1 },
    { ...launchFix, accuracyMeters: 80 }]) {
    assert.equal(applyFix(session, index, invalid, T0).observedLaunch, undefined);
  }
  const one = applyFix(session, index, launchFix, T0);
  assert.equal(one.observedLaunch, undefined);
  const interrupted = restoreSession(JSON.stringify(one));
  assert.ok(interrupted);
  const afterGap = applyFix(interrupted, index, { ...launchFix, timestamp: T0 + 60_000 }, T0 + 60_000);
  assert.equal(afterGap.observedLaunch, undefined, 'Old support cannot turn one fresh fix into a launch');
  const onRiver = float(afterGap, index, 6000, T0 + 120_000, 20, 0);
  let later = onRiver;
  for (let t = 600_000; t <= 620_000; t += 10_000) {
    later = applyFix(later, index, { ...launchFix, timestamp: T0 + t }, T0 + t);
  }
  assert.equal(later.observedLaunch, undefined, 'Visiting the planned access later cannot rename the launch');
  assert.equal(recapFloat(later, T0 + 620_000).putInId, null);
});


test('normal one-second GPS updates confirm the named launch before freezing the recorded origin', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'foreground', kind: 'saved', route, index,
    putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  let session = made.session;
  for (let t = 0; t <= 2000; t += 1000) session = applyFix(session, index, fix(0, T0 + t), T0 + t);
  assert.ok(session.recordedStart?.atPutIn);
  assert.equal(recapFloat(session, T0 + 2000).putInName, 'akers');
});


test('a named on-river launch remains recognizable when accuracy improves during acquisition', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'improving-gps', kind: 'saved', route, index,
    putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  let session = made.session;
  for (let t = 0; t <= 2000; t += 1000) {
    session = applyFix(session, index, { ...fix(0, T0 + t), accuracyMeters: t === 2000 ? 10 : 50 }, T0 + t);
  }
  assert.equal(session.observedLaunch, undefined, 'There were not three precise access fixes');
  assert.ok(session.recordedStart?.atPutIn, 'The confirmed river position is now precise and at the actual access');
  assert.equal(recapFloat(session, T0 + 2000).putInId, 'akers');
});


test('Take-out opens rivers directly when needed and continues to access selection in the same picker', () => {
  const ready = { boatType: 'kayak' };
  const opened = openStartPicker('to', ready);
  assert.equal(opened.page, 'rivers');
  const withRiver = chooseStartRiver(opened, 'current');
  assert.equal(withRiver.page, 'access');
  assert.equal(withRiver.field, 'to');
  assert.deepEqual(ready, { boatType: 'kayak' }, 'A river chosen inside the picker is not yet committed to Ready');
  assert.deepEqual(chooseStartAccess(withRiver, 'pulltite', null, null),
    { riverSlug: 'current', putInId: undefined, takeOutId: 'pulltite', boatType: 'kayak' });
});

test('editing a known take-out goes directly to accesses and changing river clears only the picker draft', () => {
  const ready = { riverSlug: 'current', putInId: 'akers', takeOutId: 'pulltite' };
  const opened = openStartPicker('to', ready);
  assert.equal(opened.page, 'access');
  assert.deepEqual(chooseStartRiver(opened, 'current').draft, ready, 'Same river preserves the selected endpoints');
  const changed = chooseStartRiver(opened, 'jacks-fork');
  assert.equal(changed.page, 'access');
  assert.equal(changed.field, 'to');
  assert.equal(changed.draft.putInId, undefined);
  assert.equal(changed.draft.takeOutId, undefined);
  assert.deepEqual(ready, { riverSlug: 'current', putInId: 'akers', takeOutId: 'pulltite' }, 'Closing the sheet preserves the plan and download identity');
  assert.equal(chooseStartAccess(changed, 'alley', null, null).takeOutId, 'alley');
});

test('a river choice without a take-out continues to take-outs; a put-in choice closes the sheet', () => {
  const river = openStartPicker('river', {});
  const chosen = chooseStartRiver(river, 'current').draft;
  assert.deepEqual(continueToTakeOut(river, chosen), { field: 'to', draft: chosen, page: 'access' });
  assert.equal(continueToTakeOut(river, { riverSlug: 'current', takeOutId: 'pulltite' }), null);
  const from = openStartPicker('from', { riverSlug: 'current', takeOutId: 'pulltite' });
  assert.equal(continueToTakeOut(from, chooseStartAccess(from, 'round-spring', 30, 20)), null,
    'Ready lists the next take-outs inline after a put-in');
  const to = openStartPicker('to', { riverSlug: 'current' });
  assert.equal(continueToTakeOut(to, { riverSlug: 'current' }), null, 'The take-out sheet never reopens itself');
});

test('GPS river detection loads only nearby rivers and prefers the closest line at a confluence', () => {
  assert.deepEqual(gpsRiverCandidates([
    { slug: 'far', miles: 12 }, { slug: 'jacks-fork', miles: 1.2 }, { slug: 'current', miles: 0.4 },
    { slug: 'eleven-point', miles: 2.9 }, { slug: 'black', miles: 2.95 },
  ]), ['current', 'jacks-fork', 'eleven-point'], 'Nearest first, within reach, at most three');
  assert.deepEqual(gpsRiverCandidates([{ slug: 'far', miles: 3.1 }]), []);
  assert.equal(gpsRiver([{ slug: 'current', offsetMeters: 90 }, { slug: 'jacks-fork', offsetMeters: 20 }]), 'jacks-fork');
  assert.equal(gpsRiver([]), null, 'Not on a mapped river: the river stays a choice');
});

test('next take-outs are the nearest downstream of a known start, with a count for See All', () => {
  const choices = [{ id: 'e', mile: 40 }, { id: 'a', mile: 5 }, { id: 'b', mile: 12 }, { id: 'c', mile: 18 }, { id: 'd', mile: 25 }];
  assert.deepEqual(nextTakeOuts(choices, 10), { next: [choices[2], choices[3], choices[4]], more: 1 });
  assert.deepEqual(nextTakeOuts(choices, 12).next.map(point => point.id), ['c', 'd', 'e'], 'The put-in itself is not a take-out');
  assert.deepEqual(nextTakeOuts(choices, 30), { next: [choices[0]], more: 0 });
  assert.deepEqual(nextTakeOuts(choices, null), { next: [], more: 0 }, 'No start: nothing is "next"');
});

test('changing a starting point preserves a downstream take-out and clears one behind the new start', () => {
  const picker = openStartPicker('from', { riverSlug: 'current', putInId: 'akers', takeOutId: 'pulltite' });
  assert.equal(picker.page, 'access');
  assert.deepEqual(chooseStartAccess(picker, undefined, 10, 20),
    { riverSlug: 'current', putInId: undefined, takeOutId: 'pulltite' });
  assert.equal(chooseStartAccess(picker, 'round-spring', 30, 20).takeOutId, undefined);
  assert.equal(chooseStartAccess(picker, undefined, null, 20).takeOutId, 'pulltite', 'Unknown GPS must not guess at an upstream take-out');
});


test('usable off-river GPS appears before river acquisition; rejected fixes cannot replace the dot', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'display', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const good = { lngLat: at(1_000, 400), accuracyMeters: 10, timestamp: T0 + 10_000 };
  const session = applyFix(started.session, index, good, good.timestamp);
  assert.equal(session.position, null);
  assert.deepEqual(floatDisplayPosition(session, good.timestamp)?.lngLat, good.lngLat);
  for (const bad of [
    { ...good, timestamp: T0 },
    { ...good, timestamp: T0 + 20_000, accuracyMeters: null },
    { ...good, timestamp: T0 + 20_000, accuracyMeters: 1000 },
    { ...good, timestamp: T0 + 40_000 },
  ]) {
    const next = applyFix(session, index, bad, T0 + 30_000);
    assert.equal(next.gpsPosition, session.gpsPosition);
    assert.equal(next.track, session.track);
    assert.equal(next.position, session.position);
  }
  assert.equal(floatDisplayPosition(session, T0 + 600_000)?.dimmed, true);
  const restored = restoreSession(JSON.stringify(session))!;
  assert.equal(floatDisplayPosition(restored, good.timestamp)?.dimmed, true);
  const resumed = applyFix(restored, index, { ...good, timestamp: T0 + 20_000 }, T0 + 20_000);
  assert.equal(floatDisplayPosition(resumed, T0 + 20_000)?.dimmed, false, 'fresh off-river GPS recovers the dot without inventing river progress');
  assert.equal(resumed.position, null);
  assert.ok(!('gpsPosition' in recapFloat(resumed, T0 + 30_000)));
});

test('route framing includes actual off-line landings and overview keeps a usable scale at arrival', () => {
  assert.deepEqual(floatRouteBounds([[-91, 37], [-90.9, 37.1]], [-91.01, 36.99], [-90.88, 37.12]), [-91.01, 36.99, -90.88, 37.12]);
  assert.equal(floatRouteBounds([], null, null), null);
  const box = floatOverviewBounds([-91, 37], [-91, 37]);
  assert.ok(box[2] - box[0] >= 0.0059);
  assert.ok(box[3] - box[1] >= 0.0059);
  const distant = floatOverviewBounds([-92, 38], [-91, 37]);
  assert.ok(distant[0] <= -92 && distant[2] >= -91);
  assert.ok(distant[1] <= 37 && distant[3] >= 38);
});

test('GPS age and Live Activity status distinguish waiting, fresh, delayed, disabled and unsupported', () => {
  assert.equal(fixAgeLabel(null, T0), 'Finding GPS…');
  assert.equal(fixAgeLabel(T0, T0 + 1000), 'Updated just now');
  assert.equal(fixAgeLabel(T0, T0 + 15_000), 'Updated 15s ago');
  assert.equal(fixAgeLabel(T0, T0 + 120_000), 'Updated 2 min ago');
  assert.equal(activityLabel('active'), 'Progress on your Lock Screen');
  assert.equal(activityLabel('disabled'), 'Lock Screen progress is off');
  assert.equal(activityLabel('expired'), 'Lock Screen progress ended · show it again');
  assert.equal(activityLabel('unavailable'), null);
});

test('coarse GPS is reported as weak accuracy, not as waiting for GPS, and the course rides with the fix', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'q', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  let session = float(made.session, index, 1_000, T0, 60, 1.5);
  assert.equal(gpsQualityNote(session, T0 + 61_000), null, 'accurate fixes: nothing to explain');
  // Under the bluff: fixes keep coming at 120 m, which the tracker rejects.
  const coarse = { ...fix(1_100, T0 + 70_000), accuracyMeters: 120, course: 92 };
  session = applyFix(session, index, coarse, T0 + 70_000);
  assert.deepEqual(gpsQualityNote(session, T0 + 75_000), { accuracyMeters: 120 });
  assert.equal(gpsQualityNote(session, T0 + 70_000 + 3 * 60_000), null, 'an old coarse fix explains nothing');
  // A good fix after it clears the note, and carries its course for the map.
  session = applyFix(session, index, { ...fix(1_120, T0 + 80_000), course: 91.5 }, T0 + 80_000);
  assert.equal(gpsQualityNote(session, T0 + 81_000), null);
  assert.equal(session.gpsPosition?.course, 91.5);
  assert.equal(applyFix(session, index, { ...fix(1_130, T0 + 90_000), course: -1 }, T0 + 90_000).gpsPosition?.course, null, 'an invalid course is unknown');
  // Restored, the restored raw fix never raises the note.
  const restored = restoreSession(JSON.stringify({ ...session, lastFix: { lngLat: at(1_100), at: T0 + 85_000, accuracyMeters: 300 } }));
  assert.equal(gpsQualityNote(restored!, T0 + 86_000), null);
});

test('the progress line counts time on the water to arrival and miles from the recorded start', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'p', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  assert.equal(progressLine(made.session, T0 + 20_000), 'Just started');
  assert.equal(progressLine(made.session, T0 + 5 * 60_000), '5 min on the water');
  const moving = float(made.session, index, 0, T0, 1_800, 1.5);
  assert.equal(progressLine(moving, T0 + 1_800_000), '30 min on the water · 1.7 mi from start');
  const arrived = { ...moving, arrivedAt: T0 + 1_800_000 };
  assert.equal(progressLine(arrived, T0 + 3 * 3_600_000), '30 min on the water · 1.7 mi from start', 'time stops at the take-out');
});

test('the pace line shows moving time and speeds; a break lowers only overall, which agrees with the line above', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'v', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(made.ok);
  assert.equal(paceLine(made.session, T0 + 60_000), null, 'nothing before there is movement');
  assert.equal(paceLine(float(made.session, index, 0, T0, 120, 1.5), T0 + 120_000), '2 min moving', 'speeds wait for five minutes of movement');
  // Thirty minutes at 1.5 m/s is about 3.4 mph.
  const moving = float(made.session, index, 0, T0, 1_800, 1.5);
  assert.equal(paceLine(moving, T0 + 1_800_000), '30 min moving at 3.4 mph · 3.3 mph overall');
  // Twenty minutes stopped: moving time and speed hold; overall sinks rather
  // than reading zero, and is exactly the line above divided out (1.7 mi in 50 min).
  const rested = float(moving, index, 1.5 * 1_800, T0 + 1_810_000, 1_200, 0);
  assert.equal(progressLine(rested, T0 + 3_010_000), '50 min on the water · 1.7 mi from start');
  assert.equal(paceLine(rested, T0 + 3_010_000), '30 min moving at 3.4 mph · 2.0 mph overall');
  // Time stops at the take-out, like the progress line.
  assert.equal(paceLine({ ...moving, arrivedAt: T0 + 1_800_000 }, T0 + 3 * 3_600_000), '30 min moving at 3.4 mph · 3.3 mph overall');
  // Never more moving time than time on the water, nor overall faster than moving.
  assert.equal(paceLine({ ...moving, totals: { ...moving.totals!, movingMs: 40 * 60_000 } }, T0 + 1_800_000), '30 min moving at 2.5 mph · 2.5 mph overall');
  // VoiceOver hears words, not symbols.
  assert.equal(spokenStats('30 min moving at 3.4 mph · 2.0 mph overall'), '30 min moving at 3.4 miles per hour, 2.0 miles per hour overall');
  assert.equal(spokenStats('50 min on the water · 1.7 mi from start'), '50 min on the water, 1.7 miles from start');
});

test('the River Mode note drops what the arrival line already says; the Lock Screen keeps it', () => {
  const copy = (estimate: Parameters<typeof remainingCopy>[0]) => remainingCopy(estimate);
  assert.deepEqual(copy({ minutes: 60, basis: 'observed', paused: false }), {
    headline: 'About 1 hr', note: 'At your recent pace. Stops not included.', shortNote: 'At your recent pace.',
  });
  assert.equal(copy({ minutes: 60, basis: 'planner', paused: false }).shortNote, 'From the plan’s estimate, until Eddy learns your pace.');
  assert.equal(copy({ minutes: 60, basis: 'observed', paused: true }).shortNote, 'At your earlier pace. You look stopped.');
  assert.equal(copy({ minutes: null, basis: 'learning', paused: false }).shortNote, '');
});

test('recap backup reflects this row and actual sync state, independently of a subscription', () => {
  assert.deepEqual(recapBackupStatus('guest', { dirty: true }, false, null), { label: 'Saved on this phone', retry: false });
  assert.equal(recapBackupStatus('account', { dirty: false }, false, 'Another row failed').label, 'Backed up to your account');
  assert.equal(recapBackupStatus('account', { dirty: true }, true, null).label, 'Backing up…');
  assert.equal(recapBackupStatus('account', { dirty: true }, false, null).label, 'Saved on this phone · Not backed up yet');
  assert.equal(recapBackupStatus('account', { dirty: true }, false, 'Offline').retry, true);
  assert.equal(recapBackupStatus('account', { dirty: false, backupError: 'Rejected' }, true, null).retry, true);
});

test('Ready hands named selections and vessel to planning, including an unfinished route', () => {
  assert.deepEqual(startPlannerParams({ riverSlug: 'current', putInId: 'akers', takeOutId: 'pulltite' }, 'kayak'), {
    focusRiver: 'current', planPutIn: 'akers', planTakeOut: 'pulltite', planBoatType: 'kayak',
  });
  assert.deepEqual(startPlannerParams({ riverSlug: 'current', takeOutId: 'pulltite' }, 'tube'), {
    focusRiver: 'current', planPutIn: undefined, planTakeOut: 'pulltite', planBoatType: 'tube',
  });
});

test('river detection retries a newer fix without overlapping or accepting a cancelled answer', async () => {
  const fix = { point: at(0), accuracy: 80, timestamp: T0 };
  const calls: number[] = [];
  let finishFirst!: (value: string) => void;
  let firstSignal!: AbortSignal;
  const lookup = createGpsRiverLookup(async (reading, signal) => {
    calls.push(reading.timestamp);
    if (calls.length === 1) {
      firstSignal = signal;
      return new Promise<string>(resolve => { finishFirst = resolve; });
    }
    return 'current';
  });
  const first = lookup.run(fix);
  await Promise.resolve();
  const skipped = lookup.run({ ...fix, timestamp: T0 + 1 });
  const latest = lookup.run({ ...fix, accuracy: 10, timestamp: T0 + 2 });
  assert.equal(firstSignal.aborted, true);
  assert.deepEqual(calls, [T0], 'The latest request waits for the old cache/native read to settle');
  finishFirst('wrong-river');
  assert.equal(await first, null);
  assert.equal(await skipped, null);
  assert.equal(await latest, 'current');
  assert.deepEqual(calls, [T0, T0 + 2]);
});

test('a superseded lookup or failed request does not prevent a retry', async () => {
  const fix = { point: at(0), accuracy: 10, timestamp: T0 };
  let finish!: (value: string) => void;
  let attempt = 0;
  const lookup = createGpsRiverLookup(async () => {
    attempt++;
    if (attempt === 1) throw new Error('offline');
    if (attempt === 2) return new Promise<string>(resolve => { finish = resolve; });
    return 'current';
  });
  await assert.rejects(lookup.run(fix), /offline/);
  const pending = lookup.run(fix);
  await Promise.resolve();
  lookup.cancel();
  finish('detected-after-cancel');
  assert.equal(await pending, null);
  assert.equal(await lookup.run(fix), 'current', 'A cancelled request can retry with a better fix');
});

test('river detection retries a miss but its first match survives later GPS fixes', async () => {
  const fix = { point: at(0), accuracy: 80, timestamp: T0 };
  let calls = 0;
  const lookup = createGpsRiverLookup(async () => [null, 'current', 'jacks-fork'][calls++] ?? null);
  assert.equal(await lookup.run(fix), null);
  assert.equal(await lookup.run({ ...fix, accuracy: 10 }), 'current');
  assert.equal(await lookup.run({ ...fix, timestamp: T0 + 30_000 }), null);
  assert.equal(calls, 2, 'No later lookup may switch a matched river or clear its endpoints');
});

test('typing or choosing a river permanently stops detection, including a late answer', async () => {
  const fix = { point: at(0), accuracy: 10, timestamp: T0 };
  let finish!: (value: string) => void;
  let calls = 0;
  const lookup = createGpsRiverLookup(async () => {
    calls++;
    return new Promise<string>(resolve => { finish = resolve; });
  });
  const pending = lookup.run(fix);
  await Promise.resolve();
  lookup.stop();
  finish('current');
  assert.equal(await pending, null, 'A search must not disappear when a native/cache answer arrives');
  assert.equal(await lookup.run({ ...fix, timestamp: T0 + 30_000 }), null);
  assert.equal(calls, 1, 'Clearing search or cancelling the picker must not restart detection');
});


test('Essentials shares a recent coarse fix instead of the old accepted fix, without moving progress', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'raw', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const good = float(started.session, index, 1000, T0, 30, 1);
  const now = T0 + 30 * 60_000;
  const raw = { lngLat: at(2000, 150), timestamp: now, accuracyMeters: 150 };
  const coarse = applyFix(good, index, raw, now);
  assert.equal(coarse.track, good.track);
  assert.equal(coarse.samples, good.samples);
  assert.equal(coarse.arrivedAt, good.arrivedAt);
  assert.equal(coarse.position, good.position);
  assert.deepEqual(essentialsPosition(coarse, now)?.lngLat, raw.lngLat);
  assert.equal(essentialsPosition(coarse, now)?.stale, false);
  const message = locationMessage(coarse, now, () => 'July 4, 2:30 PM CDT');
  assert.match(message!, /Current location/);
  assert.match(message!, /±150 m/);
  assert.match(message!, /July 4, 2:30 PM CDT/);
  assert.match(locationMessage(coarse, now + 10 * 60_000, () => '2:30 PM')!, /Last known/);
  for (const bad of [
    { ...raw, timestamp: now - 1000 }, { ...raw, timestamp: now + 1 },
    { ...raw, timestamp: NaN }, { ...raw, lngLat: [NaN, 37] as LngLat },
    { ...raw, lngLat: [-91, 91] as LngLat },
  ]) assert.equal(applyFix(coarse, index, bad, now).lastFix, coarse.lastFix);
  assert.equal(essentialsPosition(restoreSession(JSON.stringify(coarse))!, now)?.stale, true);
  assert.ok(!('lastFix' in recapFloat(coarse, now)), 'Raw fixes must not enter synced recaps');
});

test('older sessions load without accuracy and never share a snapped position', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'legacy', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const rawPoint = at(1000, 100);
  const saved = { ...started.session, gpsPosition: { lngLat: rawPoint, at: T0 }, position: { lngLat: at(1000), at: T0 } };
  const restored = restoreSession(JSON.stringify(saved))!;
  assert.deepEqual(essentialsPosition(restored, T0)?.lngLat, rawPoint);
  assert.equal(essentialsPosition(restored, T0)?.accuracyMeters, null);
  assert.equal(essentialsPosition(restored, T0)?.stale, true);
  const snappedOnly = restoreSession(JSON.stringify({ ...saved, gpsPosition: null }))!;
  assert.ok(snappedOnly);
  assert.equal(essentialsPosition(snappedOnly, T0), null);
  assert.equal(locationMessage(snappedOnly, T0, () => ''), null);
});

test('sharing prefers a recent precise raw fix to a much coarser one, then expires that preference', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'coarse-sharing', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const precise = { lngLat: at(100), accuracyMeters: 10, timestamp: T0 };
  const good = applyFix(started.session, index, precise, T0);
  const now = T0 + 60_000;
  const coarse = applyFix(good, index, { lngLat: at(3000), accuracyMeters: 3000, timestamp: now }, now);
  assert.equal(coarse.lastFix?.at, now, 'The recorder must still retain the latest raw fix');
  assert.deepEqual(essentialsPosition(coarse, now)?.lngLat, precise.lngLat);
  assert.equal(essentialsPosition(coarse, now)?.accuracyMeters, 10);
  assert.equal(essentialsPosition(coarse, now)?.at, T0, 'Do not make the preferred fix look newer');
  assert.match(locationMessage(coarse, now, at => String(at))!, /Last known location/);
  assert.equal(essentialsPosition(coarse, T0 + 120_001)?.accuracyMeters, 3000, 'After two minutes, use the newest raw fix');
  assert.equal(essentialsPosition({ ...coarse, gpsPosition: { ...good.gpsPosition!, accuracyMeters: undefined } }, now)?.accuracyMeters, 3000,
    'Legacy accuracy is unknown, never assumed precise');
  const usable = applyFix(good, index, { lngLat: at(200), accuracyMeters: 150, timestamp: now }, now);
  assert.equal(essentialsPosition(usable, now)?.accuracyMeters, 150, 'An ordinary coarse fix remains useful');
  assert.equal(essentialsPosition(restoreSession(JSON.stringify(coarse))!, now)?.stale, true);
});

test('Ahead keeps a dated river-position basis and separates refused or unpositioned reports', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'ahead', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1000, T0, 30, 1);
  const report = { id: 'mine', riverSlug: session.route.riverSlug, riverMile: session.samples.at(-1)!.riverMile + 0.2,
    latitude: at(1200)[1], longitude: at(1200)[0], kind: 'debris', note: '', status: 'waiting', capturedAt: new Date(T0).toISOString() } as HazardReport;
  const reports: HazardReport[] = [report, { ...report, id: 'refused', status: 'refused' }, { ...report, id: 'unplaced', riverMile: null },
    { ...report, id: 'old', capturedAt: new Date(T0 - 30 * 24 * 60 * 60_000).toISOString() },
    { ...report, id: 'old-unplaced', riverMile: null, capturedAt: new Date(T0 - 1).toISOString() },
    { ...report, id: 'invalid-time', capturedAt: 'invalid' }];
  const ahead = aheadItems(session, reports, T0 + 20 * 60_000);
  assert.equal(ahead.basis?.stale, true);
  assert.equal(ahead.basis?.at, session.samples.at(-1)!.timestamp);
  assert.ok(ahead.items.some(row => row.id === 'report:mine' && row.detail.includes('Your report')));
  assert.ok(!ahead.items.some(row => /refused|unplaced|old|invalid-time/.test(row.id)));
  assert.deepEqual(currentFloatReports(session, reports).filter(r => r.riverMile == null).map(r => r.id), ['unplaced']);
  assert.ok(ahead.items.every((row, i) => i === 0 || row.mile >= ahead.items[i - 1].mile));
  // Each row says what it is, so Float tools can show its photo or mark.
  const mine = ahead.items.find(row => row.id === 'report:mine')!;
  assert.equal(mine.kind, 'report');
  assert.equal(mine.sourceId, 'mine');
  assert.equal(aheadSymbol(mine), 'hazard');
  const access = ahead.items.find(row => row.kind === 'access');
  assert.ok(access, 'a mapped access ahead');
  assert.equal(access.id, `access:${access.sourceId}`);
  assert.equal(aheadSymbol(access), null, 'an access shows its own photo or place mark');
  assert.equal(aheadSymbol({ kind: 'hazard', hazardType: 'low_water_dam' }), 'dam');
  assert.equal(aheadSymbol({ kind: 'hazard', hazardType: 'strainer' }), 'hazard');
});

test('Float tools reads a fix newer than its display tick as current, never as missing', () => {
  // The bug: fixes land every second, the display clock ticks every five, so
  // the newest fix was usually "in the future" at the last tick; Share
  // location greyed out and the coordinates vanished until the next tick.
  const { route, index } = prepared();
  const started = startSession({ id: 'tools-clock', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const tick = T0 + 10_000;
  const session = applyFix(started.session, index, { lngLat: at(100), accuracyMeters: 8, timestamp: tick + 3_000 }, tick + 3_000);
  assert.equal(essentialsPosition(session, tick), null, 'read at the tick alone, the fix is rejected');
  const clock = essentialsClock(session, tick);
  assert.equal(clock, tick + 3_000);
  assert.equal(essentialsPosition(session, clock)?.stale, false);
  assert.ok(locationMessage(session, clock, () => ''), 'Share location stays available');
  assert.equal(essentialsClock(session, tick + 60_000), tick + 60_000, 'a later tick still wins');
  assert.equal(essentialsClock(started.session, tick), tick, 'no fix: the tick');
});

test('the shared location’s age changes at most once a minute', () => {
  assert.equal(locationAgeLabel(T0, T0 + 4_000), 'Updated just now');
  assert.equal(locationAgeLabel(T0, T0 + 29_000), 'Updated just now');
  assert.equal(locationAgeLabel(T0, T0 + 31_000), 'Updated 1 min ago');
  assert.equal(locationAgeLabel(T0, T0 + 150_000), 'Updated 3 min ago');
  assert.equal(locationAgeLabel(T0, T0 + 95 * 60_000), 'Updated 1 hr 35 min ago');
  assert.equal(locationAgeLabel(T0 + 1_000, T0), 'Updated just now', 'a fix a moment ahead of the clock is not negative');
});

test('Your Float promises tracking only with a healthy recorder and a fresh usable fix', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'entry', kind: 'quick', route, index, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 2_000, T0, 60, 1);
  const now = T0 + 60_000;
  const tracker = { ...IDLE_TRACKER, status: 'recording' as const };
  assert.equal(activeFloatStatus(session, tracker, now).label, 'Tracking on the Current River');
  assert.equal(activeFloatStatus(session, tracker, now).healthy, true);
  for (const extra of [{ denied: true }, { preciseOff: true }, { servicesOff: true }, { notInUse: true }, { status: 'failed' as const }, { status: 'unavailable' as const }]) {
    const status = activeFloatStatus(session, { ...tracker, ...extra }, now);
    assert.equal(status.healthy, false);
    assert.match(status.label, /needs attention/);
  }
  assert.match(activeFloatStatus(started.session, { ...tracker, status: 'starting' }, now).label, /Finding GPS/);
  const delayed = activeFloatStatus(session, tracker, now + 5 * 60_000);
  assert.equal(delayed.healthy, false);
  assert.match(delayed.label, /Location delayed/);
  const restored: FloatSession = { ...session, awaitingFix: true, gpsPosition: session.gpsPosition ? { ...session.gpsPosition, restored: true } : undefined };
  assert.equal(activeFloatStatus(restored, tracker, now).healthy, false);
  const weak = { ...session, lastFix: { lngLat: at(2_000), at: now + 10_000, accuracyMeters: 500 } };
  assert.match(activeFloatStatus(weak, tracker, now + 10_000).label, /Finding you/);
  assert.equal(activeFloatStatus(weak, tracker, now + 10_000).healthy, false);
  // Stop tracking: whatever the recorder last reported (even a "recording"
  // report not yet replaced by its idle event), the button says so.
  const stopped: FloatSession = { ...session, trackingStoppedAt: now };
  assert.equal(activeFloatStatus(stopped, tracker, now).label, 'Tracking stopped · Current River');
  assert.equal(activeFloatStatus(stopped, tracker, now).healthy, false);
  assert.equal(activeFloatStatus(stopped, { ...tracker, status: 'idle' }, now).label, 'Tracking stopped · Current River');
});

test('a float saves the take-out photo and those along the stretch for offline, take-out first', async () => {
  const { stretchPhotoUris } = await import('../../../eddy-ios/src/lib/floatPhotos');
  const photo = (id: string, mile: number, url?: string): MapAccessPoint => ({ ...point(id, 0, mile), ...(url ? { imageUrls: [url, `${url}-2`] } : {}) });
  const points = [
    photo('above', 18, 'https://images.unsplash.com/above'),
    photo('akers', 20, 'https://images.unsplash.com/akers'),
    photo('cave', 22, 'https://images.unsplash.com/cave'),
    photo('no-photo', 23),
    photo('pulltite', 24, 'https://images.unsplash.com/pulltite'),
    photo('below', 26, 'https://images.unsplash.com/below'),
  ];
  assert.deepEqual(stretchPhotoUris(points, 'pulltite', 'akers'), [
    'https://images.unsplash.com/pulltite', 'https://images.unsplash.com/akers', 'https://images.unsplash.com/cave',
  ], 'one photo each, nothing above the start or below the take-out');
  assert.deepEqual(stretchPhotoUris(points, 'pulltite', null, 21.8), [
    'https://images.unsplash.com/pulltite', 'https://images.unsplash.com/cave',
  ], 'a GPS start uses its mile');
  assert.equal(stretchPhotoUris(points, 'pulltite').length, 4, 'no known start: everything upstream of the take-out');
  assert.deepEqual(stretchPhotoUris(points, 'missing', 'akers'), []);
});

const START_CONDITION: StartCondition = {
  code: 'dangerous', gaugeName: 'Van Buren', usgsSiteId: '07067000', heightFt: 12, dischargeCfs: null,
  observedAt: '2026-07-04T13:45:00Z', accuracyWarning: false,
};

test('start condition: its own freshness rule, kept when float time is withheld', () => {
  const estimate = { estimateBasis: 'today', estimatedAt: new Date(T0).toISOString(), floatTime: null, condition: START_CONDITION };
  assert.equal(currentMovingSpeed(estimate, T0), null, 'Flood withholds the speed');
  assert.deepEqual(currentStartCondition(estimate, T0), START_CONDITION, 'but not the condition');
  assert.equal(currentStartCondition(estimate, T0 + 300_000), null, 'an estimate five minutes old is stale');
  assert.equal(currentStartCondition(estimate, T0 - 1000), null, 'or future-dated');
  assert.equal(currentStartCondition({ ...estimate, estimateBasis: 'typical' }, T0), null);
  const usace = { ...START_CONDITION, usgsSiteId: null };
  assert.deepEqual(currentStartCondition({ ...estimate, condition: usace }, T0), usace, 'a station USGS does not run');
  assert.equal(currentStartCondition({ ...estimate, condition: undefined }, T0), null, 'an older server');
  assert.equal(currentStartCondition({ ...estimate, condition: { ...START_CONDITION, code: 'unknown' as StartCondition['code'] } }, T0), null);
});

test('start snapshots the condition and the calibrated span; the recap keeps them with the credited river', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'f', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'round-spring', startCondition: START_CONDITION, now: T0 });
  assert.ok(made.ok);
  assert.deepEqual(made.session.riverSpan, {
    firstMile: 20, lastMile: 20 + 10_000 * MILES_PER_M, firstName: 'akers', lastName: 'round-spring',
    calibration: spanCalibration(route.anchors),
  });
  assert.deepEqual(made.session.startCondition, START_CONDITION);
  const tailwater = { ...START_CONDITION, usgsSiteId: null };
  assert.deepEqual(currentStartCondition({ estimateBasis: 'today', estimatedAt: new Date(T0).toISOString(), condition: tailwater }, T0), tailwater, 'a gauge with no USGS id still sets the condition');
  const moved = float(made.session, index, 0, T0, 1200, 1.5);
  const trip = recapFloat(moved, T0 + 1_200_000);
  assert.deepEqual(trip.startCondition, START_CONDITION);
  assert.deepEqual(trip.riverSpan, made.session.riverSpan);
  assert.ok(trip.coveredMiles && trip.coveredMiles.length === 1, 'one continuous stretch');
  const [low, high] = trip.coveredMiles[0];
  assert.ok(low >= 20 && high > low && high - low <= trip.distanceMiles + 0.01, 'covered is never more than credited distance');
  assert.equal(trip.startWeather, undefined);
  assert.deepEqual(trip.routeSnapshot, {
    startMile: 20, takeOutMile: 20 + 10_000 * MILES_PER_M,
    startName: 'akers', calibration: spanCalibration(route.anchors),
    mapAnchors: route.anchors.map(({ id, riverMile }) => ({ id, riverMile })),
  });

  const legacy = { ...moved, totals: { ...moved.totals! } };
  delete legacy.totals.coveredMiles;
  delete legacy.startCondition;
  delete legacy.riverSpan;
  const old = recapFloat(legacy, T0 + 1_200_000);
  for (const field of ['coveredMiles', 'startCondition', 'riverSpan', 'startWeather']) assert.ok(!(field in old), field);
});

test('recap route snapshots distinguish the plan, an on-water start and a missing start', () => {
  const { route, index } = prepared();
  for (const kind of ['quick', 'saved'] as const) {
    const made = startSession({ id: 'route-snapshot-' + kind, kind, route, index,
      putInId: kind === 'saved' ? 'akers' : undefined, takeOutId: 'pulltite', now: T0 });
    assert.ok(made.ok);
    const unplaced = recapFloat(made.session, T0 + 120_000);
    assert.equal(unplaced.putInName, null, 'a planned launch is not a confirmed launch');
    if (kind === 'saved') {
      assert.equal(unplaced.routeSnapshot?.startName, 'akers');
      assert.equal(unplaced.routeSnapshot?.startMile, 20);
    } else assert.equal(unplaced.routeSnapshot, undefined, 'no invented start for an unplaced quick float');
    const moved = float(made.session, index, 1_600, T0, 600, 1);
    const recap = recapFloat(moved, T0 + 600_000);
    assert.equal(recap.putInName, null);
    assert.equal(recap.routeSnapshot?.startName, kind === 'saved' ? '1.0 mi below akers' : 'Recorded start');
    assert.equal(recap.routeSnapshot?.startMile, moved.startMile);
    assert.ok(recap.routeSnapshot!.startMile > 20);
    assert.equal(recap.routeSnapshot?.takeOutMile, made.session.takeOut.riverMile);
  }
});

test('recap names a nearby on-water start without claiming launch at the access', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'near-launch', kind: 'saved', route, index,
    putInId: 'akers', takeOutId: 'pulltite', downloadKey: 'original-package', now: T0 });
  assert.ok(made.ok);
  // Beyond the 75 m launch-confirmation radius, within 0.1 river mile.
  const moved = float(made.session, index, 100, T0, 120, 1);
  const recap = recapFloat(moved, T0 + 120_000);
  assert.equal(recap.putInId, null);
  assert.equal(recap.routeSnapshot?.startName, 'On-river start near akers');
  assert.equal(recap.routeSnapshot?.downloadKey, 'original-package');
  assert.ok(recap.routeSnapshot?.mapAnchors?.length);
});

test('river span is lowest to highest mile, whichever way the miles run along the line', () => {
  const reversed = ACCESS.map((p) => ({ ...p, riverMile: 60 - p.riverMile }));
  const result = routeFromRiver(RIVER, reversed, null);
  assert.ok(result.ok);
  const span = riverSpanOf(result.route, result.index);
  assert.equal(span?.firstName, 'round-spring');
  assert.equal(span?.lastName, 'akers');
  assert.ok(span && span.lastMile > span.firstMile);
});

test('start weather: asked at the put-in, else the first confirmed position within the window', () => {
  const { route, index } = prepared();
  const saved = startSession({ id: 'f', kind: 'saved', route, index, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(saved.ok);
  const [lng, lat] = at(0);
  assert.deepEqual(startWeatherPoint(saved.session, T0), { lng, lat });
  const quick = startSession({ id: 'q', kind: 'quick', route, index, takeOutId: 'pulltite', now: T0 });
  assert.ok(quick.ok);
  assert.equal(startWeatherPoint(quick.session, T0 + 60_000), 'wait');
  assert.equal(startWeatherPoint(quick.session, T0 + START_WEATHER_WINDOW_MS + 1), null);
  const placed = { ...quick.session, recordedStart: { riverMile: 21, lngLat: at(1_600), at: T0 + 120_000, atPutIn: false } };
  assert.deepEqual(startWeatherPoint(placed, T0 + 130_000), { lng: at(1_600)[0], lat: at(1_600)[1] });
  const late = { ...placed, recordedStart: { ...placed.recordedStart, at: T0 + START_WEATHER_WINDOW_MS + 1 } };
  assert.equal(startWeatherPoint(late, T0 + START_WEATHER_WINDOW_MS + 2), null);
});

test('start weather keeps only the current observation, dated when it was observed', () => {
  const current = {
    temp: 48, condition: 'Rain', conditionIcon: '10d', windSpeed: 4, humidity: 90, rain1hInches: 0.12,
    // The server fetched it at 13:30 from a cache filled with a 12:10 observation.
    fetchedAt: '2026-07-04T13:30:00Z', observedAt: '2026-07-04T12:10:00Z',
  };
  assert.deepEqual(startWeatherFrom({ city: 'Eminence', days: [], current }), { tempF: 48, precipIn1h: 0.12, observedAt: '2026-07-04T12:10:00.000Z', conditionIcon: '10d' });
  assert.equal(startWeatherFrom({ city: 'Eminence', days: [], current: { ...current, conditionIcon: 'unknown' } })?.conditionIcon, undefined);
  assert.equal(startWeatherFrom({ city: 'Eminence', days: [], current: { ...current, observedAt: undefined } }), null, 'a fetch time is not an observation time');
  assert.equal(startWeatherFrom({ city: 'Eminence', days: [], current: { ...current, observedAt: 'yesterday' } }), null);
  assert.equal(startWeatherFrom({ city: 'Eminence', days: [], current: null, periods: [{ timestamp: 'x', localHour: 9, temp: 40, conditionIcon: '10d', precipitation: 3 }] }), null);
  assert.equal(startWeatherFrom({ city: 'Eminence', days: [], current: { ...current, rain1hInches: undefined } }), null, 'an older server without rain');
  assert.equal(startWeatherFrom(null), null);
});

test('the weather route carries the provider observation time, not just its own fetch time', async () => {
  const original = globalThis.fetch;
  const body = (dt?: number) => ({
    ...(dt == null ? {} : { dt }), name: 'Eminence', main: { temp: 47.6, humidity: 90 },
    weather: [{ main: 'Rain', icon: '10d' }], wind: { speed: 3, deg: 180 }, rain: { '1h': 2.5 },
  });
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify(body(1783167000)))) as typeof fetch;
    const observed = await fetchWeather(37.15, -91.35, 'key');
    assert.equal(observed.observedAt, new Date(1783167000 * 1000).toISOString());
    assert.equal(observed.rain1hInches, 0.1);
    globalThis.fetch = (async () => new Response(JSON.stringify(body()))) as typeof fetch;
    assert.equal((await fetchWeather(37.15, -91.35, 'key')).observedAt, undefined, 'no dt, no invented time');
  } finally {
    globalThis.fetch = original;
  }
});

test('new quick and planned recordings always carry a vessel, with Kayak as the default', () => {
  const { route, index } = prepared();
  for (const kind of ['quick', 'saved'] as const) {
    for (const boatType of [undefined, null, '', 'unknown', 'canoe', 'kayak', 'raft', 'tube']) {
      const started = startSession({ id: 'vessel-default', kind, route, index,
        putInId: kind === 'saved' ? 'akers' : undefined, takeOutId: 'pulltite', boatType, now: T0 });
      assert.ok(started.ok);
      const expected = ['canoe', 'kayak', 'raft', 'tube'].includes(boatType ?? '') ? boatType : 'kayak';
      assert.equal(started.session.boatType, expected);
      assert.equal(recapFloat(started.session, T0 + 120_000).boatType, expected, 'the recap records the selected vessel');
    }
  }
});


test('restoring an older float does not relabel its unknown vessel as Kayak', () => {
  const { route, index } = prepared();
  const made = startSession({ id: 'older-float', kind: 'quick', route, index, takeOutId: 'pulltite', now: T0 });
  assert.ok(made.ok);
  const restored = restoreSession(JSON.stringify({ ...made.session, boatType: null }));
  assert.ok(restored);
  assert.equal(restored.boatType, null);
  assert.equal(recapFloat(restored, T0 + 120_000).boatType, null);
});
