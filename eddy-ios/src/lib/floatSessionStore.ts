// eddy-ios/src/lib/floatSessionStore.ts
// The one active float, held outside React.
//
// ── Why a module and not a context ──────────────────────────────────────────
// Locked-screen tracking (#1448 Phase 4) delivers fixes to a background task
// that runs with no screen mounted. That task and the Float Mode screen must
// feed and read the SAME session, so it lives here, in plain module state, and
// React subscribes to it (useFloatSession). Nothing about a float depends on a
// component staying mounted: switching tabs or opening another screen leaves
// it exactly as it was.
//
// ── One float at a time ─────────────────────────────────────────────────────
// beginFloat refuses while another is active, so repeated taps cannot make
// two sessions. Ending is explicit; nothing here ends a float on its own.
// The logic, and the rules it is tested against, are in floatSessionStoreCore.ts.
//
// ── Storage ─────────────────────────────────────────────────────────────────
// Its own key, outside the cache prefix: clearing cached river data must not
// end a float in progress. Writes are throttled (a fix can arrive every
// second) and flushed when the app goes to the background, where iOS may end
// it without warning. Precise positions stay on the phone, like everything
// else location-related in Eddy.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PositionFix } from '@eddy/geo';
import type { FloatSession } from './floatSession';
import { createFloatSessionStore, type BeginResult } from './floatSessionStoreCore';
import { warn } from './monitoring';

const store = createFloatSessionStore(AsyncStorage, (message, detail) => warn('float', message, detail));

/** Read the stored float once per process. Then read it with getFloatSession(). */
export function ensureFloatSessionLoaded(): Promise<void> {
  return store.ensureLoaded();
}

/** The current session: always this, never a value remembered from a load. */
export function getFloatSession(): FloatSession | null {
  return store.get();
}

export function subscribeFloatSession(listener: () => void): () => void {
  return store.subscribe(listener);
}

/** Start a float. Not active until it is safely on disk. */
export function beginFloat(next: FloatSession): Promise<BeginResult> {
  return store.begin(next);
}

/** Feed GPS fixes, in time order, from the screen or a background task. */
export function recordFixes(fixes: readonly PositionFix[], now = Date.now()): void {
  store.record(fixes, now);
}

/** Write any pending change now; call when the app is leaving the foreground. */
export function flushFloatSession(): Promise<void> {
  return store.flush();
}

/** Write pending changes if the last write is older than `minIntervalMs`. */
export function flushFloatSessionIfStale(minIntervalMs: number): Promise<void> {
  return store.flushIfStale(minIntervalMs);
}

/** End the float and forget it. Tracking stops because nothing is active. */
export function endFloat(): Promise<boolean> {
  return store.end();
}
