// eddy-ios/src/float/FloatTracker.tsx
// Runs the location stream for the active float.
//
// Mounted once at the root, renders nothing, and does nothing without an
// active float. It never asks for permission: the Start Float flow asks, with
// the reason on screen (see useLocation.ts on why a prompt is never spent
// without one).
//
// ONE stream at a time:
//   "Always" granted   the background task (backgroundTracking.ts), which also
//                      delivers in the foreground and keeps going while locked.
//   otherwise          a foreground watch here, which stops when the phone
//                      locks; Float Mode says so (floatPermissions.ts).
// Re-checked whenever Eddy returns to the foreground, so changing the setting
// mid-float switches streams without a second one ever running.
//
// Ending the float stops both. Nothing else does: switching tabs or leaving the
// Float Mode screen leaves tracking exactly as it was.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useFloatSession } from '@/hooks/useFloatSession';
import { flushFloatSession, getFloatSession, recordFixes } from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';
import { warn } from '@/lib/monitoring';
import { startBackgroundTracking, stopBackgroundTracking } from './backgroundTracking';
import { syncFloatActivity } from './liveActivity';

export function FloatTracker() {
  const session = useFloatSession();
  const active = session != null;
  const watch = useRef<Location.LocationSubscription | null>(null);
  // Serialises (re)starts, so a foreground event mid-start cannot open a
  // second stream.
  const busy = useRef(false);

  useEffect(() => {
    if (!active) {
      void stopBackgroundTracking();
      watch.current?.remove();
      watch.current = null;
      return;
    }
    let cancelled = false;

    const ensure = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (await startBackgroundTracking()) {
          // The task is the stream now; drop any foreground watch.
          watch.current?.remove();
          watch.current = null;
          return;
        }
        if (watch.current) return;
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || permission.status !== 'granted') return;
        const next = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 0 },
          (location) => {
            recordFixes([
              {
                lngLat: [location.coords.longitude, location.coords.latitude],
                accuracyMeters: location.coords.accuracy ?? null,
                timestamp: location.timestamp,
              },
            ]);
          },
        );
        if (cancelled) next.remove();
        else watch.current = next;
      } catch (error) {
        warn('float', 'could not start location updates', error);
      } finally {
        busy.current = false;
      }
    };

    void ensure();
    const offForeground = onForeground(() => {
      void ensure();
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
      cancelled = true;
      offForeground();
      clearInterval(heartbeat);
      appState.remove();
      // Only the foreground watch belongs to this component's lifetime. The
      // background task outlives it and stops when the float ends.
      watch.current?.remove();
      watch.current = null;
      void flushFloatSession();
    };
  }, [active]);

  return null;
}
