// eddy-ios/src/hooks/useFloatSession.ts
// The active float, for screens. The session itself lives in
// src/lib/floatSessionStore.ts; this only subscribes to it.

import { useEffect, useSyncExternalStore } from 'react';
import type { FloatSession } from '@/lib/floatSession';
import {
  ensureFloatSessionLoaded,
  floatSessionLoadFailed,
  floatSessionLoaded,
  getFloatSession,
  subscribeFloatSession,
} from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';

export function useFloatSession(): FloatSession | null {
  useEffect(() => {
    void ensureFloatSessionLoaded();
  }, []);
  return useSyncExternalStore(subscribeFloatSession, getFloatSession, getFloatSession);
}

const hasFloat = () => getFloatSession() != null || floatSessionLoadFailed();
const floatActive = () => getFloatSession() != null;

/** Keep the large map independent of every GPS fix; the button subscribes to details. */
export function useHasFloatSession(): boolean {
  useEffect(() => { void ensureFloatSessionLoaded(); }, []);
  return useSyncExternalStore(subscribeFloatSession, hasFloat, hasFloat);
}

/**
 * A float is active, without the session itself: re-renders when one starts
 * or ends, not on every GPS fix (a fix replaces the session object).
 */
export function useFloatActive(): boolean {
  useEffect(() => { void ensureFloatSessionLoaded(); }, []);
  return useSyncExternalStore(subscribeFloatSession, floatActive, floatActive);
}

/**
 * False until the stored float has been read once. A screen reached cold
 * (a Live Activity tap, the arrival notification) renders before that read
 * lands; until it does, a null session means nothing, and "No float in
 * progress" or an automatic Back would be answering a question not yet asked.
 */
export function useFloatSessionLoaded(): boolean {
  useEffect(() => {
    void ensureFloatSessionLoaded();
  }, []);
  return useSyncExternalStore(subscribeFloatSession, floatSessionLoaded, floatSessionLoaded);
}

/**
 * True while the stored float could not be read: a null session then means
 * "unknown", not "no float". Reads again on mount and each foreground, and
 * `retry` reads again now.
 */
export function useFloatSessionUnreadable(): { unreadable: boolean; retry: () => void } {
  const unreadable = useSyncExternalStore(subscribeFloatSession, floatSessionLoadFailed, floatSessionLoadFailed);
  useEffect(() => {
    if (!unreadable) return;
    return onForeground(() => void ensureFloatSessionLoaded());
  }, [unreadable]);
  return { unreadable, retry: () => void ensureFloatSessionLoaded() };
}
