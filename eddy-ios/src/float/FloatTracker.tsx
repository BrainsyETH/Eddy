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
//                      locks; Float Mode says so (floatPermissions.ts). Any
//                      background task left from an earlier "Always" grant is
//                      stopped first.
// What actually started is published to floatTrackerStatus.ts, so Float Mode
// reports the stream, not the permission: "Always" granted with a failed
// background start is foreground-only tracking, and says so.
// Re-checked whenever Eddy returns to the foreground, so changing the setting
// mid-float switches streams without a second one ever running.
//
// Ending the float stops both. Nothing else does (a stored float that could
// not be read is not an ended one, so it stops nothing either): switching tabs or leaving the
// Float Mode screen leaves tracking exactly as it was. Ending DURING a start is
// covered too: background starts and stops run in call order, and a queued
// start re-checks that the float is still wanted before it begins.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useFloatSession, useFloatSessionUnreadable } from '@/hooks/useFloatSession';
import { flushFloatSession, getFloatSession, recordFixes } from '@/lib/floatSessionStore';
import { trackerStatus } from '@/lib/floatTrackerStatus';
import { onForeground } from '@/lib/foreground';
import { warn } from '@/lib/monitoring';
import { startBackgroundTracking, stopBackgroundTracking } from './backgroundTracking';
import { syncFloatActivity } from './liveActivity';

export function FloatTracker() {
  const session = useFloatSession();
  const active = session != null;
  // Null because the stored float could not be read is not "ended": leave any
  // background stream running until a read says which it is.
  const { unreadable } = useFloatSessionUnreadable();
  const watch = useRef<Location.LocationSubscription | null>(null);
  // Serialises (re)starts, so a foreground event mid-start cannot open a
  // second stream.
  const busy = useRef(false);

  useEffect(() => {
    if (!active) {
      if (unreadable) return;
      void stopBackgroundTracking();
      watch.current?.remove();
      watch.current = null;
      return;
    }
    let cancelled = false;

    const ensure = async () => {
      if (busy.current) return;
      busy.current = true;
      // A running stream stays as it is; anything else shows "starting".
      const before = trackerStatus.get().status;
      if (before !== 'background' && before !== 'foreground') {
        trackerStatus.set({ status: 'starting', backgroundFailed: false });
      }
      try {
        // `() => !cancelled`: a float ended while this start waited its turn
        // is not started at all. Starts and stops are queued in call order
        // (backgroundTracking.ts), so End's stop also runs after any start
        // already under way — GPS cannot outlive the float.
        const background = await startBackgroundTracking(() => !cancelled);
        if (cancelled || background === 'not-wanted') return;
        if (background === 'running') {
          // The task is the stream now; drop any foreground watch.
          watch.current?.remove();
          watch.current = null;
          trackerStatus.set({ status: 'background', backgroundFailed: false });
          return;
        }
        // "Always" was withdrawn mid-float (or never given), or the native
        // start failed: the task cannot deliver while locked, so it must not
        // keep running beside the foreground watch as a second stream.
        const backgroundFailed = background === 'failed';
        await stopBackgroundTracking();
        if (watch.current) {
          trackerStatus.set({ status: 'foreground', backgroundFailed });
          return;
        }
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          // Nothing is tracking. Float Mode's permission line says why.
          trackerStatus.set({ status: 'blocked', backgroundFailed });
          return;
        }
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
          (reason) => {
            // The watch stays subscribed; iOS reports transient errors here
            // too. Say so only if nothing has arrived for a while, which the
            // stale position status already does, so only log.
            warn('float', 'foreground location error', reason);
          },
        );
        if (cancelled) next.remove();
        else {
          watch.current = next;
          trackerStatus.set({ status: 'foreground', backgroundFailed });
        }
      } catch (error) {
        warn('float', 'could not start location updates', error);
        if (!cancelled && !watch.current) trackerStatus.set({ status: 'failed', backgroundFailed: false });
      } finally {
        busy.current = false;
      }
    };

    void ensure();
    trackerStatus.onRetry(() => void ensure());
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
      trackerStatus.onRetry(null);
      trackerStatus.set({ status: 'idle', backgroundFailed: false });
      offForeground();
      clearInterval(heartbeat);
      appState.remove();
      // Only the foreground watch belongs to this component's lifetime. The
      // background task outlives it and stops when the float ends.
      watch.current?.remove();
      watch.current = null;
      void flushFloatSession();
    };
  }, [active, unreadable]);

  return null;
}
