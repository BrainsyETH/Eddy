// missouri-float-planner/src/lib/float-session-store.test.ts
//
// Covers eddy-ios/src/lib/floatSessionStoreCore.ts, the store that owns the
// one active float, with a fake disk that can be made to fail.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import type { LngLat } from '@eddy/geo';
import { routeFromRiver, startSession, type FloatSession } from '../../../eddy-ios/src/lib/floatSession';
import { STORAGE_KEY, createFloatSessionStore, type SessionStorage } from '../../../eddy-ios/src/lib/floatSessionStoreCore';

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
  const started = startSession({ id, kind: 'saved', route: prepared.route, putInId: 'akers', takeOutId: 'round-spring', now: T0 });
  assert.ok(started.ok);
  return started.session;
}

function fakeDisk() {
  const data = new Map<string, string>();
  const disk: SessionStorage & { failWrites: boolean; data: Map<string, string> } = {
    data,
    failWrites: false,
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (disk.failWrites) throw new Error('disk full');
      data.set(key, value);
    },
    async removeItem(key) {
      if (disk.failWrites) throw new Error('disk full');
      data.delete(key);
    },
  };
  return disk;
}

const quiet = () => {};

test('a float started after an empty launch is visible to every reader, the background task included', async () => {
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
