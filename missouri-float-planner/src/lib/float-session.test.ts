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
  formatDuration,
  remainingCopy,
  statusCopy,
  restoreSession,
  routeFromRiver,
  startSession,
  suggestRivers,
  takeOutChoices,
  viewSession,
  type FloatSession,
} from '../../../eddy-ios/src/lib/floatSession';
import type { LngLat, PositionFix, RouteIndex } from '@eddy/geo';

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
  const { route } = prepared();
  const fromHere = takeOutChoices(route, 21);
  assert.deepEqual(fromHere.map((a) => a.id), ['pulltite', 'round-spring']);
  // Cave is on the river and calibrates it, but cannot end a float.
  assert.ok(route.anchors.some((a) => a.id === 'cave'));
  assert.ok(!takeOutChoices(route, null).some((a) => a.id === 'cave'));
});

test('a saved float must run downstream to a known take-out', () => {
  const { route } = prepared();
  const base = { id: 's1', kind: 'saved' as const, route, now: T0 };
  assert.deepEqual(startSession({ ...base, putInId: 'pulltite', takeOutId: 'akers' }), { ok: false, reason: 'take-out-upstream' });
  assert.deepEqual(startSession({ ...base, putInId: 'akers', takeOutId: 'nowhere' }), { ok: false, reason: 'no-take-out' });
  assert.equal(startSession({ ...base, putInId: 'akers', takeOutId: 'pulltite' }).ok, true);
});

test('a quick start waits for a confirmed position, then measures from it', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'q1', kind: 'quick', route, takeOutId: 'round-spring', now: T0 });
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

test('a saved float started partway down already reads as partly done', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's2', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 5_000, T0, 30, 1);
  const view = viewSession(session, T0 + 30_000);
  assert.equal(view.status, 'live');
  assert.ok(Math.abs(view.fraction! - 0.5) < 0.01);
});

test('time left starts from the planner, and pace takes over as you move', () => {
  const { route, index } = prepared();
  const started = startSession({
    id: 's3', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', plannerMph: 2, now: T0,
  });
  assert.ok(started.ok);
  let session = float(started.session, index, 0, T0, 30, 1);
  assert.equal(viewSession(session, T0 + 30_000).estimate.basis, 'planner');
  session = float(session, index, 40, T0 + 40_000, 20 * 60, 1.34);
  assert.equal(viewSession(session, T0 + 20 * 60_000).estimate.basis, 'blended');
});

test('without a planner estimate, time left says it is learning', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 'q2', kind: 'quick', route, takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 60, 1);
  assert.deepEqual(viewSession(session, T0 + 60_000).estimate, { minutes: null, basis: 'learning', paused: false });
});

test('a position nobody has refreshed is shown as stale, not live', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's4', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 30, 1);
  assert.equal(viewSession(session, T0 + 30_000).status, 'live');
  assert.equal(viewSession(session, T0 + 10 * 60_000).status, 'stale');
});

test('arriving offers Finish; a quick start already past the take-out says so', () => {
  const { route, index } = prepared();
  const saved = startSession({ id: 's5', kind: 'saved', route, putInId: 'akers', takeOutId: 'pulltite', now: T0 });
  assert.ok(saved.ok);
  const there = float(saved.session, index, 5_950, T0, 30, 1);
  assert.equal(viewSession(there, T0 + 30_000).arrived, true);

  const quick = startSession({ id: 'q3', kind: 'quick', route, takeOutId: 'pulltite', now: T0 });
  assert.ok(quick.ok);
  const past = float(quick.session, index, 8_000, T0, 30, 1);
  const view = viewSession(past, T0 + 30_000);
  assert.equal(view.startedPastTakeOut, true);
  assert.equal(view.fraction, null);
});

test('a rejected fix changes nothing', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's6', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const blurry = { lngLat: at(100), accuracyMeters: 500, timestamp: T0 };
  assert.equal(applyFix(started.session, index, blurry, T0), started.session);
});

test('a session survives being stored and restored, and junk does not restore', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's7', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 1_000, T0, 60, 1);
  const restored = restoreSession(JSON.stringify(session));
  assert.deepEqual(restored, session);
  assert.deepEqual(viewSession(restored!, T0 + 60_000), viewSession(session, T0 + 60_000));
  assert.equal(restoreSession(null), null);
  assert.equal(restoreSession('{not json'), null);
  assert.equal(restoreSession(JSON.stringify({ ...session, version: 999 })), null);
});

test('the stored history stays bounded on a long day', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's8', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  const session = float(started.session, index, 0, T0, 8 * 3600, 0.3);
  assert.ok(session.samples.length <= MAX_SAMPLES);
});

test('fixes every second keep one pace sample per ten seconds', () => {
  const { route, index } = prepared();
  const started = startSession({ id: 's9', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
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
  const started = startSession({ id: 's10', kind: 'saved', route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  assert.match(statusCopy(viewSession(started.session, T0), T0), /Finding/);
  const session = float(started.session, index, 1_000, T0, 30, 1);
  assert.equal(statusCopy(viewSession(session, T0 + 30_000), T0 + 30_000), 'Live');
  const later = T0 + 30_000 + 7 * 60_000;
  assert.match(statusCopy(viewSession(session, later), later), /Last position 7 min ago/);
});
