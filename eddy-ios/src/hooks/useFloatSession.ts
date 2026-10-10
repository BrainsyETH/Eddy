// eddy-ios/src/hooks/useFloatSession.ts
// The active float, for screens. The session itself lives in
// src/lib/floatSessionStore.ts; this only subscribes to it.

import { useEffect, useSyncExternalStore } from 'react';
import type { FloatSession } from '@/lib/floatSession';
import { getFloatSession, loadFloatSession, subscribeFloatSession } from '@/lib/floatSessionStore';

export function useFloatSession(): FloatSession | null {
  useEffect(() => {
    void loadFloatSession();
  }, []);
  return useSyncExternalStore(subscribeFloatSession, getFloatSession, getFloatSession);
}
