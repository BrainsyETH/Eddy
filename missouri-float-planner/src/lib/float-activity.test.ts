import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFloatActivityController, createFloatActivityLifecycle, floatActivitySnapshot,
  type ActivityAvailability, type FloatActivitySnapshot,
} from '../../../eddy-ios/src/lib/floatActivity';
import {
  applyFix, restoreSession, routeFromRiver, startSession, STALE_POSITION_MS, viewSession, remainingCopy,
  type FloatSession,
} from '../../../eddy-ios/src/lib/floatSession';
import type { LngLat, RouteIndex } from '@eddy/geo';
import { createFloatSessionStore, STORAGE_KEY, type SessionStorage } from '../../../eddy-ios/src/lib/floatSessionStoreCore';

const T0 = Date.parse('2026-10-11T14:00:00Z');
function at(meters: number): LngLat { return [-91 + meters / (111_320 * Math.cos(37 * Math.PI / 180)), 37]; }
function prepared() {
  const access = [0, 10_000].map((x, i) => ({ id: String(i), name: i ? 'Take-out' : 'Put-in', type: 'access', isPublic: true, riverMile: x / 1609.344, coordinates: { lng: at(x)[0], lat: 37 } }));
  const result = routeFromRiver({ slug: 'river', name: 'Current River', geometry: { type: 'LineString', coordinates: Array.from({ length: 101 }, (_, i) => at(i * 100)) } }, access, null);
  assert.ok(result.ok);
  const started = startSession({ id: 'float-1', kind: 'saved', route: result.route, index: result.index, putInId: '0', takeOutId: '1', now: T0 });
  assert.ok(started.ok);
  return { session: started.session, index: result.index };
}
function travel(session: FloatSession, index: RouteIndex, start: number, seconds: number, from: number, speed: number) {
  for (let s = 0; s <= seconds; s += 10) {
    const now = from + s * 1_000;
    session = applyFix(session, index, { lngLat: at(start + s * speed), timestamp: now, accuracyMeters: 8 }, now);
  }
  return session;
}
function snapshot(): FloatActivitySnapshot {
  const { session, index } = prepared();
  return floatActivitySnapshot(travel(session, index, 1000, 60, T0, 1), T0 + 60_000);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('activity uses the screen model for distance, progress, and moving time', () => {
  const { session, index } = prepared();
  const moving = travel(session, index, 1000, 1200, T0, 1);
  const view = viewSession(moving, T0 + 1_200_000);
  const card = floatActivitySnapshot(moving, T0 + 1_200_000).state;
  assert.equal(card.milesText, view.milesLeft!.toFixed(1));
  assert.equal(card.estimateText, remainingCopy(view.estimate).headline);
  assert.equal(card.staleAt, card.lastFixAt! + STALE_POSITION_MS);
  assert.equal(card.status, 'live');
  assert.ok(card.progress! > 0);
});

test('no fix means no invented distance or progress', () => {
  const card = floatActivitySnapshot(prepared().session, T0).state;
  assert.equal(card.milesText, '—');
  assert.equal(card.progress, null);
  assert.equal(card.lastFixAt, null);
  assert.equal(card.status, 'acquiring');
  assert.equal(card.estimateText, 'Learning your pace');
});

test('a random stop holds moving time; slow movement follows the existing estimator', () => {
  const { session, index } = prepared();
  const moving = travel(session, index, 1000, 1200, T0, 1);
  const stopped = travel(moving, index, 2200, 1200, T0 + 1_200_000, 0);
  const stopCard = floatActivitySnapshot(stopped, T0 + 2_400_000).state;
  assert.equal(stopCard.paused, true);
  assert.match(stopCard.estimateNote, /earlier pace/);
  assert.equal(stopCard.estimateText, remainingCopy(viewSession(moving, T0 + 1_200_000).estimate).headline);
  const drifting = travel(moving, index, 2200, 1200, T0 + 1_200_000, 0.3);
  const driftView = viewSession(drifting, T0 + 2_400_000);
  const driftCard = floatActivitySnapshot(drifting, T0 + 2_400_000).state;
  assert.equal(driftCard.paused, false);
  assert.equal(driftCard.estimateText, remainingCopy(driftView.estimate).headline);
});

test('uncertain and off-route fixes cannot refresh the last reliable date', () => {
  const { session, index } = prepared();
  const live = travel(session, index, 1000, 60, T0, 1);
  const before = floatActivitySnapshot(live, T0 + 60_000).state;
  const jump = applyFix(live, index, { lngLat: at(6000), timestamp: T0 + 70_000, accuracyMeters: 8 }, T0 + 70_000);
  const uncertain = floatActivitySnapshot(jump, T0 + 70_000).state;
  assert.equal(uncertain.status, 'uncertain');
  assert.equal(uncertain.staleAt, before.staleAt);
  assert.equal(uncertain.lastFixAt, before.lastFixAt);
  const off = applyFix(live, index, { lngLat: [at(1060)[0], 37.02], timestamp: T0 + 70_000, accuracyMeters: 8 }, T0 + 70_000);
  const offCard = floatActivitySnapshot(off, T0 + 70_000).state;
  assert.equal(offCard.status, 'off-route');
  assert.equal(offCard.staleAt, before.staleAt);
  assert.equal(floatActivitySnapshot(live, T0 + 600_000).state.status, 'stale');
});

test('restoring preserves progress but does not claim a live position', () => {
  const { session, index } = prepared();
  const live = travel(session, index, 1000, 60, T0, 1);
  const restored = restoreSession(JSON.stringify(live))!;
  const card = floatActivitySnapshot(restored, T0 + 70_000).state;
  assert.equal(card.status, 'resuming');
  assert.equal(card.lastFixAt, floatActivitySnapshot(live, T0 + 60_000).state.lastFixAt);
});

test('off-river destination and actual arrival remain different states', () => {
  const { session, index } = prepared();
  const arrived = travel(session, index, 9950, 40, T0, 1);
  const onRiver = floatActivitySnapshot(arrived, T0 + 40_000).state;
  assert.equal(onRiver.arrived, true);
  assert.equal(onRiver.atRiverEnd, false);
  const off = floatActivitySnapshot({ ...arrived, takeOut: { ...arrived.takeOut, offLineMeters: 1000 } }, T0 + 40_000).state;
  assert.equal(off.arrived, false);
  assert.equal(off.atRiverEnd, true);
  assert.match(off.beyondText, /1.0 km off the mapped river/);
  assert.equal(floatActivitySnapshot(arrived, T0 + 600_000).state.status, 'stale');
});

test('worst-case Unicode names leave room below ActivityKit’s 4 KB limit', () => {
  const { session } = prepared();
  session.route.riverName = '🌊'.repeat(1000);
  session.takeOut.name = '🛶'.repeat(1000);
  session.takeOut.offLineMeters = 1500;
  const card = floatActivitySnapshot(session, T0);
  assert.ok(Buffer.byteLength(JSON.stringify(card)) < 3800);
  assert.equal(Array.from(card.state.riverName).length, 80);
  assert.ok(!JSON.stringify(card).includes('coordinates'));
});

test('secondly fixes are coalesced, but displayed changes and heartbeat arrive', async () => {
  let now = T0;
  const calls: (FloatActivitySnapshot | null)[] = [];
  const c = createFloatActivityController({ sync: async (s) => { calls.push(s); return 'active'; } }, () => {}, () => now);
  const first = snapshot();
  await c.sync(first, { start: true });
  now += 1000;
  const newer = structuredClone(first); newer.state.lastFixAt! += 1000; newer.state.staleAt! += 1000; newer.state.progress! += 0.01;
  await c.sync(newer);
  assert.equal(calls.length, 1);
  const changed = structuredClone(newer); changed.state.milesText = '4.9';
  await c.sync(changed);
  assert.equal(calls.length, 2);
  now += 60_000;
  await c.sync(changed);
  assert.equal(calls.length, 3);
  changed.state.status = 'uncertain';
  await c.sync(changed);
  assert.equal(calls.length, 4, 'status is immediate');
});

test('end supersedes queued fixes and waits behind the one already in flight', async () => {
  const first = deferred<ActivityAvailability>();
  const calls: (FloatActivitySnapshot | null)[] = [];
  const c = createFloatActivityController({ sync: async (s) => { calls.push(s); return calls.length === 1 ? first.promise : 'idle'; } }, () => {});
  const start = c.sync(snapshot(), { start: true });
  await Promise.resolve();
  const changed = snapshot(); changed.state.milesText = '1.0';
  void c.sync(changed);
  const end = c.sync(null, { force: true });
  first.resolve('active');
  await Promise.all([start, end, c.settled()]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], null);
});

test('restore, dismissal, expiry and background fixes never authorize a new card', async () => {
  const starts: boolean[] = [];
  const states: ActivityAvailability[] = [];
  const c = createFloatActivityController({ sync: async (_s, start) => { starts.push(start); return start ? 'active' : 'dismissed'; } }, (s) => states.push(s));
  await c.sync(snapshot(), { force: true });
  await c.sync(snapshot(), { force: true });
  await c.sync(snapshot(), { start: true });
  c.observeAvailability('dismissed');
  await c.sync(snapshot(), { force: true });
  assert.deepEqual(starts, [false, false, true, false]);
  assert.deepEqual(states, ['dismissed', 'active', 'dismissed']);
});

test('an initial bridge failure cools down even with no successful delivery', async () => {
  let now = T0, calls = 0;
  const c = createFloatActivityController({ sync: async () => { calls++; throw new Error('unavailable'); } }, () => {}, () => now);
  await c.sync(snapshot(), { start: true });
  now += 1000;
  const change = snapshot(); change.state.milesText = '2.0';
  await c.sync(change);
  assert.equal(calls, 1);
  now += 60_000;
  await c.sync(change);
  assert.equal(calls, 2);
  await c.sync(null, { force: true });
  assert.equal(calls, 3, 'ending is never delayed by update cooldown');
});

test('disabled and old binaries are nonfatal, and explicit retry can recover', async () => {
  let result: ActivityAvailability = 'unavailable';
  const states: ActivityAvailability[] = [];
  const c = createFloatActivityController({ sync: async () => result }, (s) => states.push(s));
  await c.sync(snapshot(), { start: true });
  result = 'disabled';
  await c.sync(snapshot(), { force: true });
  result = 'active';
  await c.sync(snapshot(), { start: true });
  assert.deepEqual(states, ['unavailable', 'disabled', 'active']);
});

test('held estimates do not get a newer as-of date on each paused heartbeat', async () => {
  let now = T0;
  const calls: FloatActivitySnapshot[] = [];
  const c = createFloatActivityController({ sync: async (s) => { if (s) calls.push(structuredClone(s)); return 'active'; } }, () => {}, () => now);
  const paused = snapshot(); paused.state.paused = true;
  await c.sync(paused);
  now += 60_000;
  const next = structuredClone(paused); next.state.estimateAsOf! += 60_000; next.state.lastFixAt! += 60_000; next.state.staleAt! += 60_000;
  await c.sync(next);
  assert.equal(calls[1].state.estimateAsOf, calls[0].state.estimateAsOf);
  assert.notEqual(calls[1].state.lastFixAt, calls[0].state.lastFixAt);
});

function memoryDisk() {
  const data = new Map<string, string>();
  const disk: SessionStorage = {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  };
  return { data, disk };
}

test('a stalled restored card cannot block loading, recording, or persisting fixes', { timeout: 1000 }, async () => {
  const { session } = prepared();
  const { data, disk } = memoryDisk();
  data.set(STORAGE_KEY, JSON.stringify(session));
  const native = deferred<void>();
  const store = createFloatSessionStore(disk, () => {});
  const life = createFloatActivityLifecycle(store, () => native.promise);
  await life.ensureLoaded();
  assert.equal(store.get()?.id, session.id);
  for (let s = 0; s <= 60; s += 10) {
    const now = T0 + s * 1000;
    store.record([{ lngLat: at(1000 + s), timestamp: now, accuracyMeters: 8 }], now);
  }
  await store.flush();
  assert.ok(JSON.parse(data.get(STORAGE_KEY)!).samples.length > 0);
  assert.equal(await life.end(), true);
  assert.equal(store.get(), null);
  native.resolve();
});

test('start waits for disk, never for the previous card, and cannot start twice', { timeout: 1000 }, async () => {
  const { disk } = memoryDisk();
  const write = deferred<void>();
  const native = deferred<void>();
  const setItem = disk.setItem;
  disk.setItem = async (key, value) => { await write.promise; await setItem(key, value); };
  const store = createFloatSessionStore(disk, () => {});
  const starts: boolean[] = [];
  const life = createFloatActivityLifecycle(store, (_s, options) => { starts.push(options.start === true); return native.promise; });
  await life.ensureLoaded();
  const starting = life.begin(prepared().session);
  await Promise.resolve();
  assert.equal(store.get(), null, 'persistence still gates session creation');
  assert.deepEqual(starts, [false], 'no card start before persistence');
  write.resolve();
  assert.equal(await starting, 'started');
  assert.equal(await life.begin(prepared().session), 'already-active');
  assert.deepEqual(starts, [false, true]);
  await life.end();
  native.resolve();
});

test('failed disk cleanup returns false promptly even when ending the card stalls', { timeout: 1000 }, async () => {
  const { disk } = memoryDisk();
  const native = deferred<void>();
  const store = createFloatSessionStore(disk, () => {});
  const life = createFloatActivityLifecycle(store, () => native.promise);
  assert.equal(await life.begin(prepared().session), 'started');
  const removeItem = disk.removeItem;
  disk.removeItem = async () => { throw new Error('disk unavailable'); };
  try {
    assert.equal(await life.end(), false);
    assert.equal(store.get(), null, 'tracking has stopped despite both failures');
  } finally {
    disk.removeItem = removeItem;
    await store.retryPendingEnd();
    native.resolve();
  }
});

test('presentation exceptions and rejections never reject the session lifecycle', async () => {
  for (const sync of [() => Promise.reject(new Error('bridge failed')), () => { throw new Error('bridge threw'); }]) {
    const { disk } = memoryDisk();
    const store = createFloatSessionStore(disk, () => {});
    const life = createFloatActivityLifecycle(store, sync);
    await life.ensureLoaded();
    assert.equal(await life.begin(prepared().session), 'started');
    assert.equal(await life.end(), true);
  }
});

test('handover timeout releases the caller while keeping a pending End serialized', async () => {
  const native = deferred<ActivityAvailability>();
  const calls: (FloatActivitySnapshot | null)[] = [];
  const states: ActivityAvailability[] = [];
  const controller = createFloatActivityController({ sync: async (s) => {
    calls.push(s);
    return calls.length === 1 ? native.promise : 'idle';
  } }, (state) => states.push(state));
  void controller.sync(snapshot(), { start: true });
  await Promise.resolve();
  const changed = snapshot(); changed.state.milesText = '1.0';
  void controller.sync(changed);
  const ended = controller.sync(null, { force: true });
  assert.equal(await controller.settled(1), false);
  assert.deepEqual(states, ['error']);
  assert.equal(calls.length, 1, 'timeout must not unlock the native queue');
  native.resolve('active');
  await ended;
  assert.equal(await controller.settled(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], null, 'queued progress is superseded by End');
  assert.equal(states.at(-1), 'idle');
});
