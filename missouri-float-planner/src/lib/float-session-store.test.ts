// missouri-float-planner/src/lib/float-session-store.test.ts
//
// Covers eddy-ios/src/lib/floatSessionStoreCore.ts, the store that owns the
// one active float, with a fake disk that can be made to fail.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import type { LngLat } from '@eddy/geo';
import { routeFromRiver, startSession, type FloatSession } from '../../../eddy-ios/src/lib/floatSession';
import { ENDED_KEY, FUTURE_FIX_SKEW_MS, STORAGE_KEY, createFloatSessionStore, type SessionStorage } from '../../../eddy-ios/src/lib/floatSessionStoreCore';
import { initialFloatReminders } from '../../../eddy-ios/src/lib/floatReminders';

const MILE = 1609.344;
const COS = Math.cos((37 * Math.PI) / 180);
const T0 = Date.parse('2026-07-04T14:00:00Z');
const at = (x: number): LngLat => [-91.4 + x / (COS * 111_320), 37];

function point(id: string, x: number): MapAccessPoint {
  const [lng, lat] = at(x);
  return { id, name: id, riverMile: 20 + x / MILE, type: 'access', isPublic: true, coordinates: { lng, lat } };
}

function newSession(id = 's1'): FloatSession {
  const prepared = routeFromRiver(
    { slug: 'current', name: 'Current River', geometry: { type: 'LineString', coordinates: Array.from({ length: 101 }, (_, i) => at(i * 100)) } },
    [point('akers', 0), point('round-spring', 10_000)],
    null,
  );
  assert.ok(prepared.ok);
  const started = startSession({ id, kind: 'saved', route: prepared.route, index: prepared.index, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  return started.session;
}

function fakeDisk() {
  const data = new Map<string, string>();
  const disk: SessionStorage & { failWrites: boolean; failRemoves: boolean; data: Map<string, string> } = {
    data,
    failWrites: false,
    failRemoves: false,
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (disk.failWrites) throw new Error('disk full');
      data.set(key, value);
    },
    async removeItem(key) {
      if (disk.failWrites || disk.failRemoves) throw new Error('disk full');
      data.delete(key);
    },
  };
  return disk;
}

const quiet = () => {};

test('a float started after an empty launch is visible to every reader, the recorder wiring included', async () => {
  // The bug: the launch-time load found nothing, and a reader that used that
  // load's result concluded there was no float and stopped tracking.
  const store = createFloatSessionStore(fakeDisk(), quiet);
  await store.ensureLoaded();
  assert.equal(store.get(), null);
  assert.equal(await store.begin(newSession()), 'started');
  await store.ensureLoaded();
  assert.equal(store.get()?.id, 's1');
});

test('a float is not active until it is safely on disk', async () => {
  const disk = fakeDisk();
  disk.failWrites = true;
  const store = createFloatSessionStore(disk, quiet);
  assert.equal(await store.begin(newSession()), 'storage-failed');
  assert.equal(store.get(), null, 'a float that could not be saved must not look started');
  disk.failWrites = false;
  assert.equal(await store.begin(newSession()), 'started');
  assert.ok(disk.data.has(STORAGE_KEY));
});

test('only one float at a time', async () => {
  const store = createFloatSessionStore(fakeDisk(), quiet);
  assert.equal(await store.begin(newSession('a')), 'started');
  assert.equal(await store.begin(newSession('b')), 'already-active');
  assert.equal(store.get()?.id, 'a');
});

test('start weather lands on the float it was asked for, once, and survives a relaunch', async () => {
  const disk = fakeDisk();
  const store = createFloatSessionStore(disk, quiet);
  await store.begin(newSession('a'));
  const weather = { tempF: 48, precipIn1h: 0.1, observedAt: '2026-07-04T13:30:00.000Z' };
  store.setStartWeather('other', weather);
  assert.equal(store.get()?.startWeather, undefined, 'a reply for another float is dropped');
  store.setStartWeather('a', weather);
  store.setStartWeather('a', { ...weather, tempF: 90 });
  assert.deepEqual(store.get()?.startWeather, weather, 'only the first reply counts');
  await store.flush();
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.deepEqual(relaunched.get()?.startWeather, weather);
  await relaunched.end();
  relaunched.setStartWeather('a', weather);
  assert.equal(relaunched.get(), null, 'a reply after the float ended is dropped');
});

test('a relaunch finds the float that was saved, and ending removes it', async () => {
  const disk = fakeDisk();
  const first = createFloatSessionStore(disk, quiet);
  await first.begin(newSession());
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.equal(relaunched.get()?.id, 's1');
  assert.equal(await relaunched.end(), true);
  assert.equal(disk.data.has(STORAGE_KEY), false);
  const again = createFloatSessionStore(disk, quiet);
  await again.ensureLoaded();
  assert.equal(again.get(), null);
});

test('a failed background save is retried, not forgotten', async () => {
  const disk = fakeDisk();
  const store = createFloatSessionStore(disk, quiet);
  await store.begin(newSession());
  store.record([{ lngLat: at(100), accuracyMeters: 10, timestamp: T0 + 1_000 }], T0 + 1_000);
  disk.failWrites = true;
  await store.flush();
  disk.failWrites = false;
  await store.flush();
  const saved = JSON.parse(disk.data.get(STORAGE_KEY)!) as FloatSession;
  assert.ok(saved.last != null, 'the change made before the failed write reached disk on retry');
});

test('two starts at once cannot both win', async () => {
  // Both used to pass the "nothing active" check while awaiting the disk,
  // and the second replaced the first.
  const disk = fakeDisk();
  const store = createFloatSessionStore(disk, quiet);
  const [first, second] = await Promise.all([store.begin(newSession('a')), store.begin(newSession('b'))]);
  assert.deepEqual([first, second].sort(), ['already-active', 'started']);
  const winner = first === 'started' ? 'a' : 'b';
  assert.equal(store.get()?.id, winner);
  assert.equal((JSON.parse(disk.data.get(STORAGE_KEY)!) as FloatSession).id, winner, 'disk and memory agree');
});

test('a float whose stored copy could not be removed stays ended, and removal is retried', async () => {
  const disk = fakeDisk();
  const store = createFloatSessionStore(disk, quiet);
  await store.begin(newSession());
  disk.failRemoves = true;
  assert.equal(await store.end(), false, 'the failure is reported, not hidden');
  assert.equal(store.get(), null, 'tracking stops regardless');
  assert.equal(JSON.parse(disk.data.get(ENDED_KEY)!).session.id, 's1', 'journaled as ended');
  disk.failRemoves = false;
  assert.equal(await store.retryPendingEnd(), true);
  assert.equal(disk.data.has(STORAGE_KEY), false);
  assert.equal(disk.data.has(ENDED_KEY), false);
});

test('an ended float does not come back after a relaunch, even if removal never succeeded', async () => {
  const disk = fakeDisk();
  const store = createFloatSessionStore(disk, quiet);
  await store.begin(newSession());
  disk.failRemoves = true;
  await store.end();
  disk.failRemoves = false;
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.equal(relaunched.get(), null);
  assert.equal(disk.data.has(STORAGE_KEY), false, 'the leftover copy is cleared on the way');
  // A different float started later is not mistaken for the ended one.
  assert.equal(await relaunched.begin(newSession('s2')), 'started');
  const again = createFloatSessionStore(disk, quiet);
  await again.ensureLoaded();
  assert.equal(again.get()?.id, 's2');
  // A retry left over from the ended float must not delete the new one.
  await store.retryPendingEnd();
  assert.equal((JSON.parse(disk.data.get(STORAGE_KEY)!) as FloatSession).id, 's2');
});

test('an automatic end records the moment the float finished, not when it was noticed', async () => {
  const ended: number[] = [];
  const store = createFloatSessionStore(fakeDisk(), quiet, async () => [], async (_session, endedAt) => {
    ended.push(endedAt);
  });
  assert.equal(await store.begin(newSession('auto')), 'started');
  assert.equal(await store.end(null, T0 + 3_600_000), true);
  assert.deepEqual(ended, [T0 + 3_600_000]);
  assert.equal(store.get(), null);
});

function flakyReads(disk: ReturnType<typeof fakeDisk>, failures: number) {
  const getItem = disk.getItem;
  let left = failures;
  disk.getItem = async (key) => {
    if (left > 0) {
      left -= 1;
      throw new Error('storage busy');
    }
    return getItem(key);
  };
}

test('a failed read is not "no float": starts are refused and the next load reads again', async () => {
  const disk = fakeDisk();
  await createFloatSessionStore(disk, quiet).begin(newSession('saved'));
  flakyReads(disk, 1);
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.equal(relaunched.get(), null);
  assert.equal(relaunched.loadFailed(), true, 'the failure is visible, not mistaken for an empty disk');
  // The start itself reads again, and now finds the saved float.
  assert.equal(await relaunched.begin(newSession('replacement')), 'already-active');
  assert.equal(relaunched.loadFailed(), false);
  assert.equal(relaunched.get()?.id, 'saved');
  assert.equal((JSON.parse(disk.data.get(STORAGE_KEY)!) as FloatSession).id, 'saved', 'the saved float was not overwritten');
});

test('a start is refused while the stored float still cannot be read', async () => {
  const disk = fakeDisk();
  await createFloatSessionStore(disk, quiet).begin(newSession('saved'));
  flakyReads(disk, 2);
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.equal(await relaunched.begin(newSession('replacement')), 'unreadable');
  assert.equal((JSON.parse(disk.data.get(STORAGE_KEY)!) as FloatSession).id, 'saved');
  await relaunched.ensureLoaded();
  assert.equal(relaunched.get()?.id, 'saved', 'a later read restores it');
  assert.equal(relaunched.loadFailed(), false);
});

test('subscribers hear when a failed read is recovered', async () => {
  const disk = fakeDisk();
  await createFloatSessionStore(disk, quiet).begin(newSession('saved'));
  flakyReads(disk, 1);
  const relaunched = createFloatSessionStore(disk, quiet);
  const seen: boolean[] = [];
  relaunched.subscribe(() => seen.push(relaunched.loadFailed()));
  await relaunched.ensureLoaded();
  await relaunched.ensureLoaded();
  assert.deepEqual(seen, [true, false], 'failed, then recovered with the float in one notification');
});

test('a corrupt ended-float journal does not block every later start', async () => {
  const disk = fakeDisk();
  await createFloatSessionStore(disk, quiet).begin(newSession('old'));
  disk.data.set(ENDED_KEY, '{not json');
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.equal(relaunched.loadFailed(), false);
  assert.equal(relaunched.get(), null, 'the ended float is not resumed');
  assert.equal(await relaunched.begin(newSession('new')), 'started');
});

test('a float cancelled before it measured anything saves no recap and does not come back', async () => {
  const disk = fakeDisk();
  const recaps: string[] = [];
  const store = createFloatSessionStore(disk, quiet, async () => [], async (session) => {
    recaps.push(session.id);
  });
  await store.begin(newSession('wrong-river'));
  disk.failRemoves = true;
  assert.equal(await store.end(null, T0, false), false);
  assert.equal(store.get(), null);
  assert.equal(disk.data.get(ENDED_KEY), 'wrong-river', 'journalled by id, with no recap to replay');
  const relaunched = createFloatSessionStore(disk, quiet, async () => [], async (session) => {
    recaps.push(session.id);
  });
  disk.failRemoves = false;
  await relaunched.ensureLoaded();
  assert.equal(relaunched.get(), null, 'the cancelled float is not resumed');
  assert.equal(disk.data.has(STORAGE_KEY), false);
  assert.deepEqual(recaps, []);
});

test('readiness reminder opt-outs are in the first durable session and survive relaunch', async () => {
  const disk = fakeDisk();
  const store = createFloatSessionStore(disk, quiet);
  const reminders = initialFloatReminders({ takeOut: false, hazards: false, stops: [] });
  assert.equal(await store.begin({ ...newSession(), reminders }), 'started');
  assert.deepEqual(JSON.parse(disk.data.get(STORAGE_KEY)!).reminders, reminders);
  const relaunched = createFloatSessionStore(disk, quiet);
  await relaunched.ensureLoaded();
  assert.deepEqual(relaunched.get()?.reminders, { ...reminders, pending: [] });
});

test('a recorded fix stamped ahead of the phone clock is refused, so nothing reading the newest fix runs ahead', async () => {
  const store = createFloatSessionStore(fakeDisk(), quiet);
  assert.equal(await store.begin(newSession('clock')), 'started');
  const now = T0 + 60_000;
  // Delivery jitter: a fix a moment ahead of JavaScript's clock is fine.
  store.record([{ lngLat: at(100), accuracyMeters: 8, timestamp: now + FUTURE_FIX_SKEW_MS - 1 }], now, 100);
  assert.equal(store.get()?.lastFix?.at, now + FUTURE_FIX_SKEW_MS - 1);
  // A clock set back mid-float: the fix is a minute "in the future". Refused,
  // and its journal offset still advances so it is not read again.
  store.record([{ lngLat: at(200), accuracyMeters: 8, timestamp: now + 60_000 }], now, 200);
  assert.equal(store.get()?.lastFix?.at, now + FUTURE_FIX_SKEW_MS - 1, 'the future-stamped fix is not the newest fix');
  assert.equal(store.get()?.journalTo, 200);
  // A replayed past fix is still judged at its own time.
  store.record([{ lngLat: at(300), accuracyMeters: 8, timestamp: now + 10_000 }], now + 20 * 60_000, 300);
  assert.equal(store.get()?.lastFix?.at, now + 10_000);
});
