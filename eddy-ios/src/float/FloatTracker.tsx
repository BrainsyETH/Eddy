// eddy-ios/src/float/FloatTracker.tsx
// The foreground side of an active float, mounted once at the root.
//
// Recording is not here: the native recorder owns it, and src/float/
// recorder.ts applies what it records, with or without any screen mounted.
// This only keeps the Lock Screen card current while Eddy is in front, and
// saves the session checkpoint when Eddy leaves the foreground. It never asks
// for permission: the Start Float flow asks, with the reason on screen.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useFloatSession } from '@/hooks/useFloatSession';
import { flushFloatSession, getFloatSession } from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';
import { syncFloatActivity } from './liveActivity';

export function FloatTracker() {
  const active = useFloatSession() != null;

  useEffect(() => {
    if (!active) return;
    const offForeground = onForeground(() => {
      void syncFloatActivity(getFloatSession(), { force: true });
    });
    // Foreground heartbeat only. The system staleDate covers suspension;
    // this timer neither wakes the app nor extends the last reliable fix.
    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') void syncFloatActivity(getFloatSession());
    }, 60_000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushFloatSession();
    });
    return () => {
      offForeground();
      clearInterval(heartbeat);
      appState.remove();
      void flushFloatSession();
    };
  }, [active]);

  return null;
}
