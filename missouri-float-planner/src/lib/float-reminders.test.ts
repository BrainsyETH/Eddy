// missouri-float-planner/src/lib/float-reminders.test.ts
//
// Covers eddy-ios/src/lib/floatReminders.ts (#1448 Phase 5) and how the store
// sends them: along-river distance, only on a live position, only while
// approaching, and once per float, across a relaunch included.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import type { LngLat, PositionFix, RouteIndex } from '@eddy/geo';
import {
  applyFix,
  indexRoute,
  restoreSession,
  routeFromRiver,
  startSession,
  type FloatSession,
} from '../../../eddy-ios/src/lib/floatSession';
import {
  STOP_LEAD_MILES,
  TAKE_OUT_LEAD_MILES,
  dueReminders,
  markPending,
  settleDelivery,
  reminderCopy,
  reminderStops,
} from '../../../eddy-ios/src/lib/floatReminders';
import { createFloatSessionStore, type SessionStorage } from '../../../eddy-ios/src/lib/floatSessionStoreCore';

const MILE = 1609.344;
const COS = Math.cos((37 * Math.PI) / 180);
const T0 = Date.parse('2026-07-04T14:00:00Z');
const at = (x: number, y = 0): LngLat => [-91.4 + x / (COS * 111_320), 37 + y / 111_320];

/** A straight 10 km river, miles 20.0 to 26.2, downstream eastward. */
const STRAIGHT = Array.from({ length: 101 }, (_, i) => at(i * 100));

function point(id: string, x: number, y = 0): MapAccessPoint {
  const [lng, lat] = at(x, y);
  return { id, name: id, riverMile: 20 + x / MILE, type: 'access', isPublic: true, coordinates: { lng, lat } };
}

function started(line: LngLat[], access: MapAccessPoint[], putInId: string, takeOutId: string) {
  const prepared = routeFromRiver({ slug: 'current', name: 'Current River', geometry: { type: 'LineString', coordinates: line } }, access, null);
  assert.ok(prepared.ok);
  const result = startSession({ id: 'f1', kind: 'saved', route: prepared.route, index: prepared.index, putInId, takeOutId, now: T0 });
  assert.ok(result.ok);
  return { session: result.session, index: prepared.index };
}

const fix = (lngLat: LngLat, timestamp: number): PositionFix => ({ lngLat, accuracyMeters: 10, timestamp });

/** Fixes every 10 s along the straight river from x0 to x1 at `mps`. */
function paddle(session: FloatSession, index: RouteIndex, x0: number, x1: number, t0: number, mps = 1.5) {
  let t = t0;
  const step = Math.sign(x1 - x0) * mps * 10;
  for (let x = x0; step > 0 ? x <= x1 : x >= x1; x += step) {
    session = applyFix(session, index, fix(at(x, 5), t), t);
    t += 10_000;
  }
  return { session, t };
}

const ACCESS = [point('akers', 0), point('cave', 4_000), point('pulltite', 6_000), point('round-spring', 10_000)];

test('the take-out reminder comes about half a mile out, along the river, and once', () => {
  const { session: s0, index } = started(STRAIGHT, ACCESS, 'akers', 'round-spring');
  // Well upstream: nothing due.
  let { session, t } = paddle(s0, index, 0, 8_000, T0);
  assert.deepEqual(dueReminders(session, index, t), []);
  // Inside the heads-up distance.
  ({ session, t } = paddle(session, index, 8_000, 9_400, t));
  const due = dueReminders(session, index, t - 10_000);
  assert.deepEqual(due.map((r) => r.id), ['take-out']);
  assert.ok(due[0].milesAway > 0 && due[0].milesAway <= TAKE_OUT_LEAD_MILES);
  // Sent once: recorded, it is never due again on this float.
  session = settleDelivery(markPending(session, ['take-out']), ['take-out'], ['take-out']);
  ({ session, t } = paddle(session, index, 9_400, 9_800, t));
  assert.deepEqual(dueReminders(session, index, t - 10_000), []);
});

test('a take-out across a bend is not "close"', () => {
  // The river runs 3 km east, 300 m north, then 3 km back west: the take-out
  // is 300 m from the put-in in a straight line and 6.3 km away on the water.
  const line: LngLat[] = [
    ...Array.from({ length: 31 }, (_, i) => at(i * 100, 0)),
    ...Array.from({ length: 3 }, (_, i) => at(3_000, (i + 1) * 100)),
    ...Array.from({ length: 30 }, (_, i) => at(2_900 - i * 100, 300)),
  ];
  const lineMiles = (3_000 + 300 + 3_000) / MILE;
  const access: MapAccessPoint[] = [
    { ...point('top', 0), riverMile: 20 },
    { ...point('bottom', 0, 300), riverMile: 20 + lineMiles },
  ];
  const { session: s0, index } = started(line, access, 'top', 'bottom');
  let session = s0;
  let t = T0;
  for (let x = 0; x <= 200; x += 15) {
    session = applyFix(session, index, fix(at(x, 5), t), t);
    t += 10_000;
  }
  assert.deepEqual(dueReminders(session, index, t - 10_000), []);
});

test('no reminder from a position that is not live and confirmed', () => {
  const { session: s0, index } = started(STRAIGHT, ACCESS, 'akers', 'round-spring');
  const { session, t } = paddle(s0, index, 8_000, 9_400, T0);
  // Stale: the last confirmed position is minutes old.
  assert.deepEqual(dueReminders(session, index, t + 5 * 60_000), []);
  // Restored after a relaunch and not yet re-found.
  const restored = restoreSession(JSON.stringify(session));
  assert.ok(restored);
  assert.deepEqual(dueReminders(restored, index, t), []);
  // Off the river: a fix 400 m from the line.
  const off = applyFix(session, index, fix(at(9_400, 400), t), t);
  assert.deepEqual(dueReminders(off, index, t), []);
});

test('paddling upstream, away from the take-out, sends nothing', () => {
  const { session: s0, index } = started(STRAIGHT, ACCESS, 'akers', 'round-spring');
  // Inside the heads-up distance but heading back up the river.
  const { session, t } = paddle(s0, index, 9_600, 9_300, T0, 1);
  assert.deepEqual(dueReminders(session, index, t - 10_000), []);
  // The same place heading downstream is due.
  const { session: down, t: t2 } = paddle(s0, index, 9_300, 9_600, T0, 1);
  assert.deepEqual(dueReminders(down, index, t2 - 10_000).map((r) => r.id), ['take-out']);
});

test('a chosen stop gets its own reminder; others along the way do not', () => {
  const { session: s0, index } = started(STRAIGHT, ACCESS, 'akers', 'round-spring');
  assert.deepEqual(reminderStops(s0, index).map(({ anchor }) => anchor.id), ['cave', 'pulltite']);
  const chosen: FloatSession = { ...s0, reminders: { takeOut: false, stops: ['pulltite'], fired: [] } };
  let { session, t } = paddle(chosen, index, 0, 3_800, T0);
  // Passing cave (not chosen) is silent.
  ({ session, t } = paddle(session, index, 3_800, 4_200, t));
  assert.deepEqual(dueReminders(session, index, t - 10_000), []);
  // A quarter mile before pulltite.
  ({ session, t } = paddle(session, index, 4_200, 5_700, t));
  const due = dueReminders(session, index, t - 10_000);
  assert.deepEqual(due.map((r) => r.id), ['pulltite']);
  assert.ok(due[0].milesAway <= STOP_LEAD_MILES);
  assert.equal(reminderCopy(due[0]).title, 'pulltite coming up');
});

test('the store sends a reminder once and remembers it on disk, through a relaunch', async () => {
  const data = new Map<string, string>();
  const disk: SessionStorage = {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  };
  const sent: string[] = [];
  const store = createFloatSessionStore(disk, () => {}, async (due) => { sent.push(...due.map((r) => r.id)); return due.map((r) => r.id); });
  const { session } = started(STRAIGHT, ACCESS, 'akers', 'round-spring');
  assert.equal(await store.begin(session), 'started');

  let t = T0;
  for (let x = 8_000; x <= 9_800; x += 15) {
    store.record([fix(at(x, 5), t)], t);
    t += 10_000;
  }
  await store.remindersSettled();
  assert.deepEqual(sent, ['take-out']);
  await store.flush();
  const stored = JSON.parse(data.get('eddy.floatSession.v1')!) as FloatSession;
  assert.deepEqual(stored.reminders?.fired, ['take-out']);

  // Relaunch: a new store reads the same disk; approaching again sends nothing.
  const sentAfter: string[] = [];
  const relaunched = createFloatSessionStore(disk, () => {}, async (due) => { sentAfter.push(...due.map((r) => r.id)); return due.map((r) => r.id); });
  await relaunched.ensureLoaded();
  for (let x = 9_000; x <= 9_800; x += 15) {
    relaunched.record([fix(at(x, 5), t)], t);
    t += 10_000;
  }
  await relaunched.remindersSettled();
  assert.deepEqual(sentAfter, []);
  // Turning the take-out reminder off and on again does not re-arm it.
  relaunched.setReminders((current) => ({ ...current, takeOut: false }));
  relaunched.setReminders((current) => ({ ...current, takeOut: true }));
  assert.deepEqual(relaunched.get()?.reminders?.fired, ['take-out']);
  await relaunched.end();
  await store.end();
  assert.ok(indexRoute(session.route).ok);
});

test('a reminder the phone did not accept is not "sent", and is tried again', async () => {
  const data = new Map<string, string>();
  const disk: SessionStorage = {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  };
  let accept = false;
  const offered: string[] = [];
  const pendingOnDiskWhenOffered: string[][] = [];
  const store = createFloatSessionStore(disk, () => {}, async (due) => {
    offered.push(...due.map((r) => r.id));
    // The handover is on disk before the notifier sees it.
    pendingOnDiskWhenOffered.push((JSON.parse(data.get('eddy.floatSession.v1')!) as FloatSession).reminders?.pending ?? []);
    if (!accept) throw new Error('notifications unavailable');
    return due.map((r) => r.id);
  });
  const { session } = started(STRAIGHT, ACCESS, 'akers', 'round-spring');
  assert.equal(await store.begin(session), 'started');

  let t = T0;
  for (let x = 8_000; x <= 9_300; x += 15) {
    store.record([fix(at(x, 5), t)], t);
    t += 10_000;
  }
  await store.remindersSettled();
  assert.deepEqual(offered, ['take-out']);
  assert.deepEqual(pendingOnDiskWhenOffered, [['take-out']]);
  // Refused: not sent, not stuck pending.
  assert.deepEqual(store.get()?.reminders?.fired, []);
  assert.deepEqual(store.get()?.reminders?.pending, []);

  // Tried again after a minute, and this time accepted.
  accept = true;
  for (let x = 9_300; x <= 9_500; x += 15) {
    store.record([fix(at(x, 5), t)], t);
    t += 10_000;
  }
  await store.remindersSettled();
  assert.deepEqual(offered, ['take-out', 'take-out']);
  assert.deepEqual(store.get()?.reminders?.fired, ['take-out']);
  await store.end();
});

test('a stop is reminded where it actually is, not at a published mile calibration left out', () => {
  // "lunch" sits at x = 5,000 m (mile 23.11 on this river) but its published
  // mile says 25.5. Calibration leaves that mile out; the reminder must come
  // a quarter mile before where the stop really is.
  const access = [...ACCESS.filter((a) => a.id !== 'pulltite'), { ...point('lunch', 5_000), riverMile: 25.5 }];
  const { session: s0, index } = started(STRAIGHT, access, 'akers', 'round-spring');
  const stops = reminderStops(s0, index);
  const lunch = stops.find(({ anchor }) => anchor.id === 'lunch')!;
  assert.ok(Math.abs(lunch.mile - (20 + 5_000 / MILE)) < 0.01, `measured at ${lunch.mile}`);
  const chosen: FloatSession = { ...s0, reminders: { takeOut: false, stops: ['lunch'], fired: [] } };
  const { session, t } = paddle(chosen, index, 0, 4_700, T0);
  assert.deepEqual(dueReminders(session, index, t - 10_000).map((r) => r.id), ['lunch']);
});

test('the take-out reminder for an off-river take-out says where it really is', () => {
  const copy = reminderCopy({ id: 'take-out', name: 'Buffalo City', kind: 'take-out', milesAway: 0.4, beyondMeters: 1_001 });
  assert.match(copy.body, /closest point to Buffalo City is about 0\.4 mi ahead\. The take-out is about 1\.0 km beyond it/);
});
