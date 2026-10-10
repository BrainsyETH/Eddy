// eddy-ios/src/hooks/useFloatSession.ts
// The active float, for screens. The session itself lives in
// src/lib/floatSessionStore.ts; this only subscribes to it.

import { useEffect, useSyncExternalStore } from 'react';
import type { FloatSession } from '@/lib/floatSession';
import { ensureFloatSessionLoaded, getFloatSession, subscribeFloatSession } from '@/lib/floatSessionStore';

export function useFloatSession(): FloatSession | null {
  useEffect(() => {
    void ensureFloatSessionLoaded();
  }, []);
  return useSyncExternalStore(subscribeFloatSession, getFloatSession, getFloatSession);
}
