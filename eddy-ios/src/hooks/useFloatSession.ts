// eddy-ios/src/hooks/useFloatSession.ts
// The active float, for screens. The session itself lives in
// src/lib/floatSessionStore.ts; this only subscribes to it.

import { useEffect, useSyncExternalStore } from 'react';
import type { FloatSession } from '@/lib/floatSession';
import {
  ensureFloatSessionLoaded,
  floatSessionLoadFailed,
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
