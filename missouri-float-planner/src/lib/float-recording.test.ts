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
  type TrackerState,
} from '../../../eddy-ios/src/lib/floatRecording';
import { createFloatRecorderSync, failedReport, type RecorderBridge } from '../../../eddy-ios/src/lib/floatRecorderSync';
import { autoEndAt } from '../../../eddy-ios/src/lib/floatEnding';
import { trackingLine } from '../../../eddy-ios/src/lib/floatTrackerStatus';

const MILE = 1609.344;
const COS = Math.cos((37 * Math.PI) / 180);
const T0 = Date.parse('2026-07-04T14:00:00Z');
const at = (x: number): LngLat => [-91.4 + x / (COS * 111_320), 37];

function point(id: string, x: number): MapAccessPoint {
  const [lng, lat] = at(x);
  return { id, name: id, riverMile: 20 + x / MILE, type: 'access', isPublic: true, coordinates: { lng, lat } };
}

function newSession(id = 'rec', takeOutId = 'round-spring'): FloatSession {
  const prepared = routeFromRiver(
    { slug: 'current', name: 'Current River', geometry: { type: 'LineString', coordinates: Array.from({ length: 101 }, (_, i) => at(i * 100)) } },
    [point('akers', 0), point('pulltite', 5_000), point('round-spring', 10_000)],
    null,
  );
  assert.ok(prepared.ok);
  const started = startSession({ id, kind: 'saved', route: prepared.route, index: prepared.index, putInId: 'akers', takeOutId, now: T0 });
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
  assert.equal(
    trackerState(report({ state: 'failed', notInForeground: true }), 'a', true).status,
    'starting',
    'a start refused in the background is retried from the foreground, not shown as a failure',
  );
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

// ── The recorder sync, against the real store and a mocked native bridge ────

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** A native bridge over a fake journal, reading `perPage` lines at a time. */
function mockBridge(journal: ReturnType<typeof fakeJournal>, perPage = 5) {
  const calls: string[] = [];
  let gate: Promise<void> | null = null;
  const bridge: RecorderBridge & { calls: string[]; holdReads(p: Promise<void>): void; startError: Error | null; state: RecorderStatus['state'] } = {
    calls,
    startError: null,
    state: 'idle',
    holdReads(p) { gate = p; },
    async start(sessionId) {
      calls.push(`start:${sessionId}`);
      if (bridge.startError) throw bridge.startError;
      bridge.state = 'recording';
      return { state: 'recording', sessionId, update: {}, session: {} };
    },
    async stop(sessionId) {
      calls.push(`stop:${sessionId}`);
      bridge.state = 'idle';
      return { state: 'idle', update: {}, session: {} };
    },
    async status() {
      return { state: bridge.state, update: {}, session: {} };
    },
    async read(_sessionId, from) {
      if (gate) await gate;
      const all = journal.read(from);
      const fixes = all.fixes.slice(0, perPage);
      const next = from + fixes.reduce((n, fix) => n + Buffer.byteLength(`${JSON.stringify(fix)}\n`), 0);
      return { fixes, next, end: all.next };
    },
  };
  return bridge;
}

async function syncedStore(journal: ReturnType<typeof fakeJournal>, recaps: FloatSession[] = []) {
  const { disk } = memoryDisk();
  const store = createFloatSessionStore(disk, () => {}, async () => [], async (session) => { recaps.push(session); });
  await store.begin(newSession());
  const bridge = mockBridge(journal);
  const trackers: TrackerState[] = [];
  const sync = createFloatRecorderSync({
    recorder: bridge,
    getSession: () => store.get(),
    ensureLoaded: () => store.ensureLoaded(),
    loadFailed: () => store.loadFailed(),
    record: (fixes, now, journalTo) => {
      store.record(fixes, now, journalTo);
      return null;
    },
    isForeground: () => true,
    setTracker: (state) => trackers.push(state),
    warn: () => {},
  });
  return { store, bridge, sync, trackers };
}

test('ending while the journal is still being replayed keeps every recorded fix in the recap', async () => {
  // Uninterrupted reference.
  const steady = createFloatSessionStore(memoryDisk().disk, () => {});
  await steady.begin(newSession());
  const reference = fakeJournal();
  for (let i = 0; i < 40; i += 1) {
    const batch = reference.append(paddle(i));
    steady.record(batch.fixes.map(toPositionFix), paddle(i).t, batch.to);
  }

  // Reopened after a relaunch: 40 fixes in the journal, none applied yet.
  const journal = fakeJournal();
  for (let i = 0; i < 40; i += 1) journal.append(paddle(i));
  const recaps: FloatSession[] = [];
  const { store, bridge, sync } = await syncedStore(journal, recaps);
  const hold = deferred();
  bridge.holdReads(hold.promise);
  const replaying = sync.catchUp();

  // The paddler taps Finish while that replay is still reading.
  const id = store.get()!.id;
  const finishing = sync.finish(id).then((drained) => {
    assert.equal(drained, true);
    return store.end(null, T0 + 3_600_000);
  });
  hold.resolve();
  await Promise.all([replaying, finishing]);

  assert.equal(bridge.calls[0], `stop:${id}`, 'recording stops before the drain, so nothing is appended after it');
  assert.equal(recaps.length, 1);
  assert.equal(recaps[0].journalTo, journal.read(0).next, 'the recap covers the journal through its last offset');
  assert.deepEqual(recaps[0].samples, steady.get()!.samples);
  assert.deepEqual(recaps[0].totals, steady.get()!.totals);
});

test('a first start that fails is a failure for this float, with Retry, not "Starting…" forever', async () => {
  const { store, bridge, sync, trackers } = await syncedStore(fakeJournal());
  bridge.startError = new Error('kCLErrorDenied');
  await sync.ensureRecording();
  const failed = trackers[trackers.length - 1];
  assert.equal(failed.status, 'failed');
  assert.equal(trackingLine(failed)!.action, 'retry');
  assert.deepEqual(failedReport(store.get()!.id, null), { state: 'failed', sessionId: store.get()!.id, update: {}, session: {} });

  // Retry succeeds.
  bridge.startError = null;
  await sync.ensureRecording();
  assert.equal(trackers[trackers.length - 1].status, 'recording');
});

test('a recorder left running with no float is stopped; one whose float could not be read is left alone', async () => {
  const journal = fakeJournal();
  const { store, bridge, sync } = await syncedStore(journal);
  bridge.state = 'recording';
  await store.end(null, T0 + 1_000);
  await sync.ensureRecording();
  assert.ok(bridge.calls.includes('stop:null'));

  const unreadable = createFloatRecorderSync({
    recorder: mockBridge(journal),
    getSession: () => null,
    ensureLoaded: async () => {},
    loadFailed: () => true,
    record: () => null,
    isForeground: () => true,
    setTracker: () => {},
    warn: () => {},
  });
  const before = bridge.calls.length;
  await unreadable.ensureRecording();
  assert.equal(bridge.calls.length, before);
});

test('a journal that cannot be read at Finish leaves the float active and recording, not saved short', async () => {
  const journal = fakeJournal();
  for (let i = 0; i < 10; i += 1) journal.append(paddle(i));
  const recaps: FloatSession[] = [];
  const { store, bridge, sync, trackers } = await syncedStore(journal, recaps);
  const id = store.get()!.id;
  bridge.read = async () => {
    throw new Error('EIO');
  };
  assert.equal(await sync.finish(id), false, 'Finish is told the track is incomplete');
  // endFloat stops here: nothing is archived and the session stays.
  assert.equal(store.get()?.id, id);
  assert.deepEqual(recaps, []);
  assert.deepEqual(bridge.calls, [`stop:${id}`, `start:${id}`], 'recording starts again so nothing is missed meanwhile');
  assert.equal(trackers[trackers.length - 1].status, 'recording');
});

test('recovery judges the automatic end on the whole journal, not on its first pages', async () => {
  // Planned to Pulltite (x = 5 km), but paddled on past it for over an hour.
  // The early pages hold an arrival more than an hour before "now"; only the
  // later ones show the paddler still moving downstream.
  const journal = fakeJournal();
  const fixes = Array.from({ length: 840 }, (_, i) => paddle(i));
  for (const fix of fixes) journal.append(fix);
  const now = fixes[fixes.length - 1].t + 10_000;

  const { disk } = memoryDisk();
  const store = createFloatSessionStore(disk, () => {});
  await store.begin(newSession('rec', 'pulltite'));
  const judged: Array<{ settle: boolean; end: number | null }> = [];
  const sync = createFloatRecorderSync({
    recorder: mockBridge(journal, 50),
    getSession: () => store.get(),
    ensureLoaded: () => store.ensureLoaded(),
    loadFailed: () => store.loadFailed(),
    record: (batch, at, journalTo, settle) => {
      store.record(batch, at, journalTo);
      judged.push({ settle, end: autoEndAt(store.get(), at) });
      return null;
    },
    isForeground: () => true,
    setTracker: () => {},
    warn: () => {},
    now: () => now,
  });
  await sync.catchUp();

  assert.equal(store.get()!.journalTo, journal.read(0).next, 'the whole journal was read');
  assert.ok(store.get()!.arrivedAt != null, 'the planned take-out was reached');
  assert.ok(judged.some((j) => !j.settle && j.end != null), 'an early page alone looks like an ending');
  const settled = judged.filter((j) => j.settle);
  assert.equal(settled.length, 1, 'judged once, after the last page');
  assert.equal(settled[0].end, null, 'the whole journal shows the paddler carrying on');
});
