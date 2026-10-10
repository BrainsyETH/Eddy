// eddy-ios/src/float/FloatTracker.tsx
// Feeds GPS to the active float while the app is open.
//
// Mounted once at the root, renders nothing, and does nothing until a float is
// active AND location permission is already granted. It never asks: the Start
// Float flow asks, with the reason on screen (see useLocation.ts on why a
// prompt is never spent without one).
//
// ONE subscription for the whole float, owned here rather than by a screen, so
// switching tabs or leaving the Float Mode screen does not stop tracking or
// start a second stream. Locked-screen tracking (#1448 Phase 4) replaces this
// with a background location task feeding the same store.
//
// Accuracy is High with no distance filter. A distance filter would starve the
// tracker during a stop and force a reacquire afterwards; battery tuning is a
// Phase 4 job, measured on a real river.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useFloatSession } from '@/hooks/useFloatSession';
import { flushFloatSession, recordFixes } from '@/lib/floatSessionStore';
import { onForeground } from '@/lib/foreground';
import { warn } from '@/lib/monitoring';

export function FloatTracker() {
  const session = useFloatSession();
  const active = session != null;
  const subscription = useRef<Location.LocationSubscription | null>(null);
  // Set while a start is in flight, so a foreground event arriving mid-start
  // cannot open a second stream.
  const starting = useRef(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const start = async () => {
      if (subscription.current || starting.current) return;
      starting.current = true;
      try {
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
        else subscription.current = next;
      } catch (error) {
        warn('float', 'could not start location updates', error);
      } finally {
        starting.current = false;
      }
    };

    void start();
    // Permission may be granted after the float began (the start flow asks),
    // or restored on return from Settings.
    const offForeground = onForeground(() => void start());
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushFloatSession();
    });

    return () => {
      cancelled = true;
      offForeground();
      appState.remove();
      subscription.current?.remove();
      subscription.current = null;
      void flushFloatSession();
    };
  }, [active]);

  return null;
}
