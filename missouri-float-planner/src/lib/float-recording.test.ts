// missouri-float-planner/src/lib/float-recording.test.ts
//
// Covers eddy-ios/src/lib/floatRecording.ts and the journal side of
// floatSessionStoreCore.ts (ADR 0014): the native recorder's journal is the
// record, the session is a checkpoint derived from it, and replaying the
// journal after any interruption ends where an uninterrupted float would.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '@eddy/types';
import type { LngLat } from '@eddy/geo';
import { STALE_FIX_MS } from '@eddy/geo';
import { routeFromRiver, startSession, type FloatSession } from '../../../eddy-ios/src/lib/floatSession';
import { STORAGE_KEY, createFloatSessionStore, type SessionStorage } from '../../../eddy-ios/src/lib/floatSessionStoreCore';
import {
  IDLE_TRACKER,
  planIngest,
  toPositionFix,
  trackerState,
  type RecordedFix,
  type RecorderStatus,
} from '../../../eddy-ios/src/lib/floatRecording';

const MILE = 1609.344;
const COS = Math.cos((37 * Math.PI) / 180);
const T0 = Date.parse('2026-07-04T14:00:00Z');
const at = (x: number): LngLat => [-91.4 + x / (COS * 111_320), 37];

function point(id: string, x: number): MapAccessPoint {
  const [lng, lat] = at(x);
  return { id, name: id, riverMile: 20 + x / MILE, type: 'access', isPublic: true, coordinates: { lng, lat } };
}

function newSession(id = 'rec'): FloatSession {
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

function memoryDisk() {
  const data = new Map<string, string>();
  const disk: SessionStorage = {
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
  return { data, disk };
}

/** The native journal, as FloatJournal.swift writes it: NDJSON with byte offsets. */
function fakeJournal() {
  let bytes = '';
  return {
    append(fix: RecordedFix) {
      const from = Buffer.byteLength(bytes);
      bytes += `${JSON.stringify(fix)}\n`;
      return { from, to: Buffer.byteLength(bytes), fixes: [fix] };
    },
    /** Complete lines from `from`, as read(sessionId, from, maxBytes) returns them. */
    read(from: number) {
      const tail = Buffer.from(bytes).subarray(from).toString();
      const end = tail.lastIndexOf('\n');
      if (end < 0) return { fixes: [] as RecordedFix[], next: from };
      const complete = tail.slice(0, end + 1);
      return {
        fixes: complete.split('\n').filter(Boolean).map((line) => JSON.parse(line) as RecordedFix),
        next: from + Buffer.byteLength(complete),
      };
    },
    /** A write cut short by termination: no newline. */
    tear(partial: string) {
      bytes += partial;
    },
  };
}

/** One fix every 10 s, paddling east at 1 m/s from x = 1000. */
const paddle = (i: number): RecordedFix => ({ t: T0 + i * 10_000, lng: at(1_000 + i * 10)[0], lat: 37, acc: 8 });

test('a recorded fix becomes the tracker’s fix unchanged', () => {
  assert.deepEqual(toPositionFix({ t: 5, lng: -91, lat: 37, acc: 7, spd: 1.2 }), { lngLat: [-91, 37], accuracyMeters: 7, timestamp: 5 });
});

test('a batch is applied only where the session left off', () => {
  assert.equal(planIngest(0, { from: 0, to: 80 }), 'apply');
  assert.equal(planIngest(80, { from: 80, to: 160 }), 'apply');
  assert.equal(planIngest(160, { from: 80, to: 160 }), 'skip', 'already replayed');
  assert.equal(planIngest(80, { from: 160, to: 240 }), 'catch-up', 'an event in between was missed');
});

test('the tracker state is the recorder’s report for THIS float, flags and all', () => {
  const report = (extra: Partial<RecorderStatus> = {}): RecorderStatus => ({ state: 'recording', sessionId: 'a', update: {}, session: {}, ...extra });
  assert.deepEqual(trackerState(report(), null, true), IDLE_TRACKER);
  assert.equal(trackerState(report(), 'a', false).status, 'unavailable');
  assert.equal(trackerState(null, 'a', true).status, 'starting');
  assert.equal(trackerState(report({ sessionId: 'old' }), 'a', true).status, 'starting', 'another float’s report says nothing about this one');
  assert.equal(trackerState(report(), 'a', true).status, 'recording');
  assert.equal(trackerState(report({ state: 'failed' }), 'a', true).status, 'failed');
  assert.equal(trackerState(report({ journalError: true }), 'a', true).status, 'failed', 'a fix that could not be written is a failure');
  const flagged = trackerState(
    report({ update: { authorizationDeniedGlobally: true, accuracyLimited: true }, session: { insufficientlyInUse: true } }),
    'a',
    true,
  );
  assert.deepEqual([flagged.servicesOff, flagged.preciseOff, flagged.notInUse], [true, true, true]);
  assert.equal(trackerState(report({ session: { fullAccuracyDenied: true } }), 'a', true).preciseOff, true);
  // While iOS is showing its prompt, nothing is denied yet.
  assert.equal(trackerState(report({ session: { authorizationDenied: true, authorizationRequestInProgress: true } }), 'a', true).denied, false);
  assert.equal(trackerState(report({ update: { authorizationRestricted: true } }), 'a', true).denied, true);
});

test('the journal offset is saved with the progress it produced, even when no fix changed anything', async () => {
  const { data, disk } = memoryDisk();
  const store = createFloatSessionStore(disk, () => {});
  await store.begin(newSession());
  const journal = fakeJournal();
  // Inaccurate: rejected, but its offset still counts as applied.
  const rejected = journal.append({ t: T0 + 1_000, lng: at(1_000)[0], lat: 37, acc: 500 });
  store.record(rejected.fixes.map(toPositionFix), T0 + 1_000, rejected.to);
  assert.equal(store.get()?.journalTo, rejected.to);
  await store.flush();
  assert.equal((JSON.parse(data.get(STORAGE_KEY)!) as FloatSession).journalTo, rejected.to);
});

test('replayed journal fixes are judged as of their own time, not rejected as stale', async () => {
  const store = createFloatSessionStore(memoryDisk().disk, () => {});
  await store.begin(newSession());
  const journal = fakeJournal();
  for (let i = 0; i < 12; i += 1) journal.append(paddle(i));
  const page = journal.read(0);
  // Read an hour later, as after a relaunch.
  const later = T0 + 60 * 60_000;
  assert.ok(later - page.fixes[0].t > STALE_FIX_MS);
  store.record(page.fixes.map(toPositionFix), later, page.next);
  assert.ok(store.get()!.samples.length > 0, 'the recorded path was applied');
  assert.equal(store.get()!.journalTo, page.next);

  // The same fixes fed live, an hour late, are what the stale rule is for.
  const live = createFloatSessionStore(memoryDisk().disk, () => {});
  await live.begin(newSession('live'));
  live.record(page.fixes.map(toPositionFix), later);
  assert.equal(live.get()!.samples.length, 0);
});

test('a float interrupted anywhere ends exactly where an uninterrupted one does', async () => {
  const fixes = Array.from({ length: 60 }, (_, i) => paddle(i));

  // Uninterrupted: every fix applied live as it was recorded.
  const steady = createFloatSessionStore(memoryDisk().disk, () => {});
  await steady.begin(newSession());
  const steadyJournal = fakeJournal();
  for (const fix of fixes) {
    const batch = steadyJournal.append(fix);
    steady.record(batch.fixes.map(toPositionFix), fix.t, batch.to);
  }

  for (const killAt of [0, 7, 31, 59]) {
    const { disk } = memoryDisk();
    const journal = fakeJournal();
    const first = createFloatSessionStore(disk, () => {});
    await first.begin(newSession());
    // Live until the kill, with the checkpoint written somewhere before it.
    for (const [i, fix] of fixes.entries()) {
      const batch = journal.append(fix);
      if (i < killAt) first.record(batch.fixes.map(toPositionFix), fix.t, batch.to);
      if (i === Math.floor(killAt / 2)) await first.flush();
    }
    // The last write was cut short by the termination.
    journal.tear('{"t":');

    // Relaunch: load the checkpoint, replay everything past it.
    const relaunched = createFloatSessionStore(disk, () => {});
    await relaunched.ensureLoaded();
    const cursor = relaunched.get()!.journalTo ?? 0;
    const page = journal.read(cursor);
    relaunched.record(page.fixes.map(toPositionFix), T0 + 24 * 60 * 60_000, page.next);

    const a = relaunched.get()!;
    const b = steady.get()!;
    assert.deepEqual(a.samples, b.samples, `samples after a kill at ${killAt}`);
    assert.deepEqual(a.totals, b.totals, `totals after a kill at ${killAt}`);
    assert.equal(a.journalTo, b.journalTo, 'the torn line is not counted');
  }
});
