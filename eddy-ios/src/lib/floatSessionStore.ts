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
//
// ── Storage ─────────────────────────────────────────────────────────────────
// Its own key, outside the cache prefix: clearing cached river data must not
// end a float in progress. Writes are throttled (a fix can arrive every
// second) and flushed when the app goes to the background, where iOS may end
// it without warning. Precise positions stay on the phone, like everything
// else location-related in Eddy.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PositionFix, RouteIndex } from '@eddy/geo';
import { applyFix, indexRoute, restoreSession, type FloatSession } from './floatSession';
import { warn } from './monitoring';

const STORAGE_KEY = 'eddy.floatSession.v1';
const WRITE_THROTTLE_MS = 15_000;

let session: FloatSession | null = null;
let index: RouteIndex | null = null;
let loaded: Promise<FloatSession | null> | null = null;
let dirty = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function set(next: FloatSession | null) {
  session = next;
  if (!next) index = null;
  else if (!index) {
    const built = indexRoute(next.route);
    index = built.ok ? built.index : null;
  }
  notify();
}

async function write(): Promise<void> {
  dirty = false;
  try {
    if (session) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    warn('float', 'could not save the float session', error);
  }
}

function scheduleWrite() {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (dirty) void write();
  }, WRITE_THROTTLE_MS);
}

/** Read the stored float once per launch. Safe to call repeatedly. */
export function loadFloatSession(): Promise<FloatSession | null> {
  loaded ??= (async () => {
    try {
      const restored = restoreSession(await AsyncStorage.getItem(STORAGE_KEY));
      // A session whose route no longer indexes (corrupt, or calibration rules
      // changed between versions) cannot show honest progress; drop it.
      if (restored && !indexRoute(restored.route).ok) {
        warn('float', 'stored float session no longer indexes; discarded');
        await AsyncStorage.removeItem(STORAGE_KEY);
        return null;
      }
      if (restored && !session) set(restored);
    } catch (error) {
      warn('float', 'could not read the float session', error);
    }
    return session;
  })();
  return loaded;
}

export function getFloatSession(): FloatSession | null {
  return session;
}

export function subscribeFloatSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Start a float. False when one is already active: resume or end it first. */
export async function beginFloat(next: FloatSession): Promise<boolean> {
  await loadFloatSession();
  if (session) return false;
  index = null;
  set(next);
  await write();
  return true;
}

/** Feed GPS fixes, in time order, from the screen or a background task. */
export function recordFixes(fixes: readonly PositionFix[], now = Date.now()): void {
  if (!session || !index || fixes.length === 0) return;
  let next = session;
  for (const fix of fixes) next = applyFix(next, index, fix, now);
  if (next === session) return;
  session = next;
  notify();
  scheduleWrite();
}

/** Write any pending change now; call when the app is leaving the foreground. */
export async function flushFloatSession(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (dirty) await write();
}

/** End the float and forget it. Tracking stops because nothing is active. */
export async function endFloat(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  set(null);
  await write();
}
