import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as freshness from '../../../eddy-ios/src/lib/locationFreshness';
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


type HookFix = { coords: { latitude: number; longitude: number }; timestamp: number };
function locationHook(os: {
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getLastKnownPositionAsync: () => Promise<HookFix | null>;
  getCurrentPositionAsync: () => Promise<HookFix>;
}) {
  const slots: unknown[] = [];
  const effects: Array<() => unknown> = [];
  let cursor = 0;
  let mounted = false;
  type Value = { coords: { lat: number; lng: number } | null; status: string; request: (options?: { force: boolean }) => Promise<unknown> };
  const exports: { useLocation?: (options: { refreshGranted: boolean }) => Value } = {};
  const source = readFileSync(new URL('../../../eddy-ios/src/hooks/useLocation.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports, Date,
    require: (name: string) => {
      if (name === 'react') return {
        useState: (initial: unknown) => {
          const index = cursor++;
          if (index === slots.length) slots.push(initial);
          return [slots[index], (next: unknown) => { slots[index] = next; }];
        },
        useRef: (initial: unknown) => {
          const index = cursor++;
          if (index === slots.length) slots.push({ current: initial });
          return slots[index];
        },
        useCallback: (callback: unknown) => callback,
        useEffect: (effect: () => unknown) => { if (!mounted) effects.push(effect); },
      };
      if (name === 'expo-location') return { ...os, PermissionStatus: { GRANTED: 'granted' }, Accuracy: { Balanced: 3 } };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {} };
      if (name === '@/lib/locationFreshness') return freshness;
      if (name === '@/lib/foreground') return { onForeground: () => () => {} };
      if (name === '@/lib/monitoring') return { warn: () => {} };
      if (name === '@eddy/geo') return {};
      throw new Error(`Unexpected location dependency: ${name}`);
    },
  });
  const render = () => {
    cursor = 0;
    const value = exports.useLocation!({ refreshGranted: true });
    if (!mounted) { mounted = true; effects.forEach(effect => effect()); }
    return value;
  };
  return { render };
}
const flushLocation = () => new Promise<void>(resolve => setImmediate(resolve));

test('finder refreshes an existing location grant without asking for permission', async () => {
  let prompts = 0;
  let fresh = 0;
  const hook = locationHook({
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestForegroundPermissionsAsync: async () => { prompts++; return { status: 'granted' }; },
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: async () => { fresh++; return { coords: { latitude: 37, longitude: -91 }, timestamp: Date.now() }; },
  });
  hook.render();
  await flushLocation();
  assert.equal(hook.render().status, 'ready');
  assert.equal(hook.render().coords?.lat, 37);
  assert.equal(fresh, 1);
  assert.equal(prompts, 0);
});

test('a delayed startup GPS fix cannot overwrite an explicit newer location request', async () => {
  let deliver!: (fix: HookFix) => void;
  const initial = new Promise<HookFix>(resolve => { deliver = resolve; });
  let acquisitions = 0;
  const hook = locationHook({
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: () => ++acquisitions === 1 ? initial : Promise.resolve({ coords: { latitude: 38, longitude: -92 }, timestamp: Date.now() }),
  });
  hook.render();
  await flushLocation();
  await hook.render().request({ force: true });
  assert.equal(hook.render().coords?.lat, 38);
  deliver({ coords: { latitude: 37, longitude: -91 }, timestamp: Date.now() - 1000 });
  await flushLocation();
  assert.equal(hook.render().coords?.lat, 38);
  assert.equal(hook.render().status, 'ready');
});

test('finder never acquires GPS or prompts automatically without an existing grant', async () => {
  let accesses = 0;
  const hook = locationHook({
    getForegroundPermissionsAsync: async () => ({ status: 'undetermined' }),
    requestForegroundPermissionsAsync: async () => { accesses++; return { status: 'granted' }; },
    getLastKnownPositionAsync: async () => { accesses++; return null; },
    getCurrentPositionAsync: async () => { accesses++; return { coords: { latitude: 37, longitude: -91 }, timestamp: Date.now() }; },
  });
  hook.render();
  await flushLocation();
  assert.equal(hook.render().status, 'idle');
  assert.equal(accesses, 0);
});

/** Exercise the real display hook with a manual clock and native app events. */
function floatDisplayClock(initialAppState = 'active') {
  let now = NOW;
  let value: number | undefined;
  let dependencies: readonly unknown[] | undefined;
  let cleanup: (() => void) | void;
  let pending: (() => (() => void) | void) | undefined;
  let nextTimer = 0;
  const timers = new Map<number, { fire: () => void; every: number; next: number }>();
  const listeners = new Set<(state: string) => void>();
  const appState = {
    currentState: initialAppState,
    addEventListener: (_event: string, listener: (state: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const exports: { useFloatDisplayClock?: (enabled: boolean) => number } = {};
  const source = readFileSync(new URL('../../../eddy-ios/src/hooks/useFloatDisplayClock.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    Date: { now: () => now },
    setInterval: (fire: () => void, every: number) => {
      const id = ++nextTimer;
      timers.set(id, { fire, every, next: now + every });
      return id;
    },
    clearInterval: (id: number) => timers.delete(id),
    require: (name: string) => {
      if (name === 'react') return {
        useState: (initial: () => number) => {
          value ??= initial();
          return [value, (next: number) => { value = next; }];
        },
        useEffect: (effect: () => (() => void) | void, next: readonly unknown[]) => {
          if (!dependencies || next.some((item, i) => !Object.is(item, dependencies![i]))) {
            dependencies = next;
            pending = effect;
          }
        },
      };
      if (name === 'react-native') return { AppState: appState };
      throw new Error(`Unexpected display clock dependency: ${name}`);
    },
  });
  return {
    get value() { return value; },
    get timerCount() { return timers.size; },
    get listenerCount() { return listeners.size; },
    render(enabled: boolean) {
      exports.useFloatDisplayClock!(enabled);
      if (pending) {
        cleanup?.();
        cleanup = pending();
        pending = undefined;
      }
    },
    appState(state: string) {
      appState.currentState = state;
      for (const listener of listeners) listener(state);
    },
    advance(ms: number) {
      const until = now + ms;
      while (true) {
        const timer = [...timers.values()].sort((a, b) => a.next - b.next)[0];
        if (!timer || timer.next > until) break;
        now = timer.next;
        timer.next += timer.every;
        timer.fire();
      }
      now = until;
    },
    unmount() { cleanup?.(); },
  };
}

test('Float display clock ticks only while visible and refreshes immediately on returning', () => {
  const clock = floatDisplayClock();
  clock.render(true);
  clock.advance(5_000);
  assert.equal(clock.value, NOW + 5_000);
  clock.render(true); // A GPS render must not add or restart a timer.
  clock.advance(2_000);
  clock.render(false); // Options, another screen, or no active float.
  assert.equal(clock.timerCount, 0);
  assert.equal(clock.listenerCount, 0);
  clock.advance(60_000);
  assert.equal(clock.value, NOW + 5_000, 'Hidden screen does not tick');
  clock.render(true);
  assert.equal(clock.value, NOW + 67_000, 'Focus refreshes without waiting five seconds');
  assert.equal(clock.timerCount, 1);
  clock.unmount();
  assert.equal(clock.timerCount, 0);
  assert.equal(clock.listenerCount, 0);
});

test('Float display clock stops on inactive/background and refreshes on foreground', () => {
  const clock = floatDisplayClock();
  clock.render(true);
  clock.advance(1_000);
  clock.appState('inactive');
  assert.equal(clock.timerCount, 0);
  clock.appState('background');
  clock.advance(60_000);
  assert.equal(clock.value, NOW);
  clock.appState('active');
  assert.equal(clock.value, NOW + 61_000);
  clock.appState('active');
  assert.equal(clock.timerCount, 1, 'Duplicate foreground events do not multiply timers');
  clock.advance(5_000);
  assert.equal(clock.value, NOW + 66_000);
  clock.render(false);
  clock.appState('background');
  clock.appState('active');
  assert.equal(clock.timerCount, 0, 'Foreground cannot restart a hidden screen');
  clock.unmount();
});

test('Float display clock waits for both an enabled screen and an active app', () => {
  const clock = floatDisplayClock('background');
  clock.render(false);
  assert.equal(clock.timerCount, 0);
  assert.equal(clock.listenerCount, 0);
  clock.render(true);
  assert.equal(clock.timerCount, 0);
  clock.advance(60_000);
  clock.appState('active');
  assert.equal(clock.value, NOW + 60_000);
  assert.equal(clock.timerCount, 1);
  clock.unmount();
  clock.appState('active');
  assert.equal(clock.timerCount, 0, 'Unmount releases the native event listener');
});
