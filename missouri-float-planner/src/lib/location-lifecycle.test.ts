import { readStartPreview, shouldRefreshStartFix } from '../../../eddy-ios/src/lib/floatStartLocation';
import { START_FIX_MAX_AGE_MS, type StartFix } from '../../../eddy-ios/src/lib/floatStart';
// missouri-float-planner/src/lib/location-lifecycle.test.ts
//
// Covers eddy-ios/src/lib/locationFreshness.ts (when a held fix may answer a
// location request, and the fresh-fix deadline) and eddy-ios/src/lib/
// serialQueue.ts (the ordering that keeps background GPS from outliving End).
// eddy-ios has no test runner; see float-session.test.ts for the arrangement.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReuseFix,
  DEADLINE_EXCEEDED,
  FORCED_LAST_KNOWN_MAX_AGE_MS,
  LAST_KNOWN_MAX_AGE_MS,
  LIVE_FIX_REUSE_MS,
  lastKnownMaxAge,
  withDeadline,
} from '../../../eddy-ios/src/lib/locationFreshness';
import { createSerialQueue } from '../../../eddy-ios/src/lib/serialQueue';

const NOW = 1_700_000_000_000;

test('a recent live fix answers an ordinary request', () => {
  assert.equal(canReuseFix({ at: NOW - 60_000 }, NOW, false), true);
});

test('an hour-old fix is not reused, so Locate does not recentre on where the drive began', () => {
  assert.equal(canReuseFix({ at: NOW - 60 * 60_000 }, NOW, false), false);
  assert.equal(canReuseFix({ at: NOW - LIVE_FIX_REUSE_MS - 1 }, NOW, false), false);
});

test('an explicit Locate never reuses a held fix, however recent', () => {
  assert.equal(canReuseFix({ at: NOW - 1_000 }, NOW, true), false);
  assert.equal(lastKnownMaxAge(true), FORCED_LAST_KNOWN_MAX_AGE_MS);
  assert.equal(lastKnownMaxAge(false), LAST_KNOWN_MAX_AGE_MS);
  assert.ok(FORCED_LAST_KNOWN_MAX_AGE_MS < LAST_KNOWN_MAX_AGE_MS);
});

test('no fix, or one stamped in the future (clock change), is never reused', () => {
  assert.equal(canReuseFix(null, NOW, false), false);
  assert.equal(canReuseFix({ at: NOW + 60_000 }, NOW, false), false);
});

/** A manual clock for withDeadline. */
function manualTimer() {
  let pending: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      pending = fn;
      return () => { pending = null; };
    },
    fire: () => pending?.(),
    get armed() { return pending != null; },
  };
}

test('a fix inside the deadline is returned and the timer is cleared', async () => {
  const timer = manualTimer();
  const result = await withDeadline(Promise.resolve('fix'), 15_000, timer.schedule);
  assert.equal(result, 'fix');
  assert.equal(timer.armed, false);
});

test('a fix that misses the deadline is dropped, not applied late', async () => {
  const timer = manualTimer();
  let deliver!: (value: string) => void;
  const slow = new Promise<string>((resolve) => { deliver = resolve; });
  const raced = withDeadline(slow, 15_000, timer.schedule);
  timer.fire();
  assert.equal(await raced, DEADLINE_EXCEEDED);
  deliver('late fix');
  assert.equal(await raced, DEADLINE_EXCEEDED);
});

test('a GPS error inside the deadline is still an error', async () => {
  const timer = manualTimer();
  await assert.rejects(withDeadline(Promise.reject(new Error('no fix')), 15_000, timer.schedule), /no fix/);
});

test('End during a pending start leaves tracking stopped', async () => {
  // The ordering serialQueue guarantees: a start with several native awaits, and a
  // stop issued (by ending the float) before that start has finished.
  const queue = createSerialQueue();
  let running = false;
  let floatActive = true;
  let releaseStart!: () => void;
  const nativeStart = new Promise<void>((resolve) => { releaseStart = resolve; });

  const start = queue(async () => {
    if (!floatActive) return false;
    await nativeStart;
    running = true;
    return true;
  });
  floatActive = false; // the paddler taps End
  const stop = queue(async () => { running = false; });

  releaseStart();
  await Promise.all([start, stop]);
  assert.equal(running, false);
});

test('a start queued behind End sees the float is over and does nothing', async () => {
  const queue = createSerialQueue();
  let floatActive = true;
  let started = false;
  const stop = queue(async () => { floatActive = false; });
  const start = queue(async () => {
    if (!floatActive) return false;
    started = true;
    return true;
  });
  await stop;
  assert.equal(await start, false);
  assert.equal(started, false);
});

test('a failed operation does not block the ones behind it', async () => {
  const queue = createSerialQueue();
  const failed = queue(async () => { throw new Error('native error'); });
  const next = queue(async () => 'ran');
  await assert.rejects(failed, /native error/);
  assert.equal(await next, 'ran');
});


const startFix = (timestamp = NOW): StartFix => ({ point: [-91, 37], accuracy: 10, timestamp });

test('Ready automatically uses a recent OS location once permission is granted', async () => {
  let currentCalls = 0;
  const cached = startFix(NOW - 1000);
  assert.equal(await readStartPreview({ state: 'ready', previous: null, force: false, now: () => NOW,
    lastKnown: async () => cached, current: async () => { currentCalls++; return startFix(); } }), cached);
  assert.equal(currentCalls, 0, 'A valid cached GPS fix avoids an unnecessary wait');
});

test('Ready never reads location before permission and services are ready', async () => {
  for (const state of ['checking', 'request', 'settings', 'services', 'precise'] as const) {
    const unexpected = async () => { throw new Error('Location must not be requested'); };
    assert.equal(await readStartPreview({ state, previous: startFix(), force: false, now: () => NOW,
      lastKnown: unexpected, current: unexpected }), null);
  }
});

test('stale or imprecise OS locations trigger a fresh preview automatically; cache failure also recovers', async () => {
  const fresh = startFix();
  const invalid = [null, startFix(NOW - START_FIX_MAX_AGE_MS), startFix(NOW + 1), { ...startFix(), accuracy: 500 }];
  for (const cached of invalid) {
    let currentCalls = 0;
    assert.equal(await readStartPreview({ state: 'ready', previous: startFix(NOW - START_FIX_MAX_AGE_MS),
      force: false, now: () => NOW, lastKnown: async () => cached,
      current: async () => { currentCalls++; return fresh; } }), fresh);
    assert.equal(currentCalls, 1);
  }
  assert.equal(await readStartPreview({ state: 'ready', previous: null, force: false, now: () => NOW,
    lastKnown: async () => { throw new Error('OS cache unavailable'); }, current: async () => fresh }), fresh);
});

test('an explicit GPS retry fetches a new fix and never accepts a stale answer', async () => {
  const fresh = startFix();
  const inputs = { state: 'ready' as const, previous: startFix(NOW - 1000), force: true, now: () => NOW,
    lastKnown: async () => { throw new Error('Explicit retry bypasses cache'); }, current: async () => fresh };
  assert.equal(await readStartPreview(inputs), fresh);
  await assert.rejects(readStartPreview({ ...inputs, current: async () => startFix(NOW - START_FIX_MAX_AGE_MS) }), /not precise/);
});

test('Ready refreshes expired GPS without another tap and bounds retry frequency after a failure', () => {
  const old = startFix(NOW - START_FIX_MAX_AGE_MS);
  assert.equal(shouldRefreshStartFix('ready', false, old, NOW, NOW - 60_000), true);
  assert.equal(shouldRefreshStartFix('ready', false, null, NOW, NOW - 30_000), true);
  assert.equal(shouldRefreshStartFix('ready', false, null, NOW, NOW - 10_000), false);
  assert.equal(shouldRefreshStartFix('ready', false, startFix(), NOW, NOW - 60_000), false);
  assert.equal(shouldRefreshStartFix('ready', true, old, NOW, NOW - 60_000), false);
  for (const state of ['checking', 'request', 'settings', 'services', 'precise'] as const)
    assert.equal(shouldRefreshStartFix(state, false, old, NOW, NOW - 60_000), false);
});
